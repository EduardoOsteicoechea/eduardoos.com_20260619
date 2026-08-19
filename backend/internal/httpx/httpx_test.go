package httpx

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestWriteJSONAndError(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, http.StatusOK, map[string]string{"ok": "yes"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type=%q", ct)
	}

	rec2 := httptest.NewRecorder()
	WriteError(rec2, http.StatusBadRequest, "bad")
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", rec2.Code)
	}
}

func TestCorrelationFromRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Correlation-ID", "cid-1")
	if got := CorrelationFromRequest(req); got != "cid-1" {
		t.Fatalf("got %q", got)
	}
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := CorrelationFromRequest(req2); got == "" {
		t.Fatal("expected generated correlation id")
	}
}

func TestEnv(t *testing.T) {
	_ = os.Setenv("HTTPX_TEST_KEY", "from-env")
	defer os.Unsetenv("HTTPX_TEST_KEY")
	if got := Env("HTTPX_TEST_KEY", "fallback"); got != "from-env" {
		t.Fatalf("got %q", got)
	}
	if got := Env("HTTPX_MISSING_KEY_XYZ", "fallback"); got != "fallback" {
		t.Fatalf("got %q", got)
	}
}

func TestCorrelationMiddleware(t *testing.T) {
	h := CorrelationMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Correlation-ID") == "" {
			t.Fatal("middleware did not inject correlation id")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Header().Get("X-Correlation-ID") == "" {
		t.Fatal("response missing correlation id")
	}
}
