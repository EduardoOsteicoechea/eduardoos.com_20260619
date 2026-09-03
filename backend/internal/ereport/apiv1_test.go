package ereport

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/apikeys"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestV1PostRequiresConfirmOverwriteAndSnapshots(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	ents := payments.NewStore()
	ents.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"api", "ereport"}, "monthly", 1))

	eh := NewHandler("ereport-secret", users)
	eh.Entitlements = ents
	keys := apikeys.NewMemoryStore()
	ah := apikeys.NewHandler("ereport-secret", users, keys, ents)

	r := chi.NewRouter()
	eh.Routes(r)
	ah.Routes(r)
	ah.MountV1(r, func(vr chi.Router) {
		vr.Use(ah.RequireProductAccess("ereport"))
		eh.RoutesV1(vr)
	})

	ownerTok := bearer(t, "owner@example.com")
	req := httptest.NewRequest(http.MethodPost, "/api/ereport/reports",
		bytes.NewBufferString(`{"tema":"API target"}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	meta := created["meta"].(map[string]any)
	id := meta["id"].(string)
	ownerSafe := meta["ownerSafe"].(string)

	// Create API key via JWT
	ck := httptest.NewRequest(http.MethodPost, "/api/apikeys", bytes.NewBufferString(`{"label":"bot"}`))
	ck.Header.Set("Authorization", "Bearer "+ownerTok)
	ckRec := httptest.NewRecorder()
	r.ServeHTTP(ckRec, ck)
	if ckRec.Code != http.StatusCreated {
		t.Fatalf("apikey create=%d %s", ckRec.Code, ckRec.Body.String())
	}
	var keyOut struct {
		Key string `json:"key"`
	}
	_ = json.Unmarshal(ckRec.Body.Bytes(), &keyOut)

	// Step 1 — access
	acc := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/access", nil)
	acc.Header.Set("Authorization", "Bearer "+keyOut.Key)
	accRec := httptest.NewRecorder()
	r.ServeHTTP(accRec, acc)
	if accRec.Code != http.StatusOK {
		t.Fatalf("access=%d %s", accRec.Code, accRec.Body.String())
	}
	var accOut map[string]any
	_ = json.Unmarshal(accRec.Body.Bytes(), &accOut)
	if accOut["allowed"] != true || accOut["ownerSafe"] != ownerSafe {
		t.Fatalf("access body=%#v", accOut)
	}

	// Step 2 — library
	lib := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/library", nil)
	lib.Header.Set("Authorization", "Bearer "+keyOut.Key)
	libRec := httptest.NewRecorder()
	r.ServeHTTP(libRec, lib)
	if libRec.Code != http.StatusOK {
		t.Fatalf("library=%d %s", libRec.Code, libRec.Body.String())
	}
	var libOut struct {
		Reports []ReportCard `json:"reports"`
	}
	_ = json.Unmarshal(libRec.Body.Bytes(), &libOut)
	if len(libOut.Reports) < 1 || libOut.Reports[0].ID != id {
		t.Fatalf("library=%#v", libOut)
	}

	// Reject without confirmOverwrite
	bad := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id,
		bytes.NewBufferString(`{"payload":{"reportNumber":"2","sections":[]}}`))
	bad.Header.Set("Authorization", "Bearer "+keyOut.Key)
	bad.Header.Set("Content-Type", "application/json")
	badRec := httptest.NewRecorder()
	r.ServeHTTP(badRec, bad)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 without confirmOverwrite got %d", badRec.Code)
	}

	// Full replace with confirm
	goodBody := `{"confirmOverwrite":true,"tema":"API tema","payload":{"reportNumber":"99","sections":[{"id":"s1"}]}}`
	good := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id,
		bytes.NewBufferString(goodBody))
	good.Header.Set("Authorization", "Bearer "+keyOut.Key)
	good.Header.Set("Content-Type", "application/json")
	goodRec := httptest.NewRecorder()
	r.ServeHTTP(goodRec, good)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("v1 post=%d body=%s", goodRec.Code, goodRec.Body.String())
	}
	var postOut map[string]any
	_ = json.Unmarshal(goodRec.Body.Bytes(), &postOut)
	if postOut["snapshotId"] == nil || postOut["snapshotId"] == "" {
		t.Fatalf("expected snapshotId in response: %#v", postOut)
	}

	// History list via JWT
	hist := httptest.NewRequest(http.MethodGet,
		"/api/ereport/reports/"+ownerSafe+"/"+id+"/history", nil)
	hist.Header.Set("Authorization", "Bearer "+ownerTok)
	histRec := httptest.NewRecorder()
	r.ServeHTTP(histRec, hist)
	if histRec.Code != http.StatusOK {
		t.Fatalf("history=%d %s", histRec.Code, histRec.Body.String())
	}
	var histOut struct {
		Items []HistoryCard `json:"items"`
	}
	_ = json.Unmarshal(histRec.Body.Bytes(), &histOut)
	if len(histOut.Items) < 1 {
		t.Fatal("expected at least one history item")
	}

	// GET v1
	get := httptest.NewRequest(http.MethodGet,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id, nil)
	get.Header.Set("Authorization", "Bearer "+keyOut.Key)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, get)
	if getRec.Code != http.StatusOK {
		t.Fatalf("v1 get=%d", getRec.Code)
	}
}
