package aps

import (
	"net/http"
	"net/http/httptest"
	"testing"

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
