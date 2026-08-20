package ereport

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func testRouter(t *testing.T) (*Handler, chi.Router, auth.UserStore) {
	t.Helper()
	users := auth.NewMemoryStore()
	h := NewHandler("ereport-secret", users)
	r := chi.NewRouter()
	h.Routes(r)
	return h, r, users
}

func bearer(t *testing.T, email string) string {
	t.Helper()
	tok, err := auth.IssueJWT(email, "ereport-secret")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestKeys(t *testing.T) {
	if got := SafeEmailKey("A@X.com"); got != "a_at_x.com" {
		t.Fatalf("SafeEmailKey=%s", got)
	}
	if got := ReportKey("u@x.com", "r1"); got != "ereport/u_at_x.com/reports/r1/report.ereport" {
		t.Fatalf("ReportKey=%s", got)
	}
}

func TestCreateGetShareRoundTrip(t *testing.T) {
	h, r, users := testRouter(t)
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	_ = users.PutUser(t.Context(), auth.User{
		Email: "viewer@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	ownerTok := bearer(t, "owner@example.com")
	viewerTok := bearer(t, "viewer@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/ereport/reports",
		bytes.NewBufferString(`{"tema":"QA Sprint"}`))
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

	// Share
	req = httptest.NewRequest(http.MethodPut,
		"/api/ereport/reports/"+ownerSafe+"/"+id+"/shares",
		bytes.NewBufferString(`{"emails":["viewer@example.com"]}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("share status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Viewer can get
	req = httptest.NewRequest(http.MethodGet, "/api/ereport/reports/"+ownerSafe+"/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+viewerTok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("viewer get status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Viewer library lists shared
	req = httptest.NewRequest(http.MethodGet, "/api/ereport/library", nil)
	req.Header.Set("Authorization", "Bearer "+viewerTok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var lib map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &lib)
	shared, _ := lib["shared"].([]any)
	if len(shared) != 1 {
		t.Fatalf("shared=%#v", shared)
	}

	_ = h // silence
}

func TestEmptyPayload(t *testing.T) {
	p := EmptyPayload()
	if _, ok := p["sections"]; !ok {
		t.Fatal("missing sections")
	}
}
