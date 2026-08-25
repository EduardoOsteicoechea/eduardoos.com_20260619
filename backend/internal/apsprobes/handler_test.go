package apsprobes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/apswebhook"
	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestCatalogAndEnvProbe(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: auth.AdminEmail, Role: auth.RoleAdmin, Verified: true})
	wh := apswebhook.NewHandler("test-secret", users, "")
	h := NewHandler("test-secret", users, wh)
	r := chi.NewRouter()
	h.Routes(r)

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}

	catReq := httptest.NewRequest(http.MethodGet, "/api/admin/aps/probes", nil)
	catReq.Header.Set("Authorization", "Bearer "+token)
	catRec := httptest.NewRecorder()
	r.ServeHTTP(catRec, catReq)
	if catRec.Code != http.StatusOK {
		t.Fatalf("catalog status=%d", catRec.Code)
	}

	envReq := httptest.NewRequest(http.MethodPost, "/api/admin/aps/probes/env-check", nil)
	envReq.Header.Set("Authorization", "Bearer "+token)
	envRec := httptest.NewRecorder()
	r.ServeHTTP(envRec, envReq)
	if envRec.Code != http.StatusOK {
		t.Fatalf("env-check wrapper should be 200, got %d %s", envRec.Code, envRec.Body.String())
	}
	var res Result
	if err := json.Unmarshal(envRec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.ProbeID != "env-check" || res.Details == nil {
		t.Fatalf("unexpected result: %+v", res)
	}
	// Without env secrets in test, ok may be false — still structured.
	if _, has := res.Details["APS_CLIENT_ID_set"]; !has {
		t.Fatalf("missing boolean env flags: %+v", res.Details)
	}
}

func TestSyntheticWebhookProbe(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: auth.AdminEmail, Role: auth.RoleAdmin, Verified: true})
	wh := apswebhook.NewHandler("test-secret", users, "")
	h := NewHandler("test-secret", users, wh)
	r := chi.NewRouter()
	h.Routes(r)

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/admin/aps/probes/webhook-sync-complete", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var res Result
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if !res.OK {
		t.Fatalf("expected ok synthetic: %+v", res)
	}
	if len(wh.SnapshotEvents()) < 1 {
		t.Fatal("expected event in webhook store")
	}
	if res.Details["disposition"] != "meeting_relevant" {
		t.Fatalf("expected meeting_relevant, got %+v", res.Details)
	}
	if res.Details["triggersDA"] != false {
		t.Fatalf("must not trigger DA: %+v", res.Details)
	}
}

func TestSyncStartIgnoredNoDA(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: auth.AdminEmail, Role: auth.RoleAdmin, Verified: true})
	wh := apswebhook.NewHandler("test-secret", users, "")
	h := NewHandler("test-secret", users, wh)
	r := chi.NewRouter()
	h.Routes(r)
	token, _ := auth.IssueJWT(auth.AdminEmail, "test-secret")
	req := httptest.NewRequest(http.MethodPost, "/api/admin/aps/probes/webhook-sync-start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	var res Result
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if !res.OK {
		t.Fatalf("expected ok: %+v", res)
	}
	if res.Details["disposition"] != "ignored_no_da" {
		t.Fatalf("expected ignored_no_da, got %+v", res.Details)
	}
}

func TestUnknownProbeStill200Structured(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: auth.AdminEmail, Role: auth.RoleAdmin, Verified: true})
	h := NewHandler("test-secret", users, apswebhook.NewHandler("test-secret", users, ""))
	r := chi.NewRouter()
	h.Routes(r)
	token, _ := auth.IssueJWT(auth.AdminEmail, "test-secret")
	req := httptest.NewRequest(http.MethodPost, "/api/admin/aps/probes/nope", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	var res Result
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if res.OK {
		t.Fatal("unknown should not be ok")
	}
}
