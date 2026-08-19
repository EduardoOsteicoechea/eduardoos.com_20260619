package aps

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestIsAdminEmail(t *testing.T) {
	if !IsAdminEmail("eduardooost@gmail.com") {
		t.Fatal("expected admin match")
	}
	if !IsAdminEmail("EduardoOost@Gmail.com") {
		t.Fatal("expected case-insensitive match")
	}
	if IsAdminEmail("other@example.com") {
		t.Fatal("non-admin must be false")
	}
}

func TestRegistryUnauthorizedWithoutToken(t *testing.T) {
	h := &Handler{JWTSecret: "test-secret"}
	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/aps/registry", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestTriggerWorkItemServiceUnavailableWithoutCreds(t *testing.T) {
	secret := "aps-test-secret"
	token, err := auth.IssueJWT(AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	// Explicit empty config so Validate fails even if process env has APS_*.
	h := &Handler{
		JWTSecret: secret,
		Client:    NewClient(Config{}),
	}
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodPost, "/api/aps/trigger-workitem", strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "APS_CLIENT_ID") {
		t.Fatalf("expected missing env docs in body: %s", rec.Body.String())
	}
}
