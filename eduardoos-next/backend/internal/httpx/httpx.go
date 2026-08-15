package httpx

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/google/uuid"
)

// WriteJSON encodes payload as JSON with the given status and content-type.
// This is the shared response helper used by every Next API handler so clients
// always see application/json and a consistent status code path.
func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError returns a small JSON error object: {"error":"<message>"}.
// Handlers should pass a short, client-safe message (no stack traces or secrets).
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// CorrelationFromRequest returns X-Correlation-ID when the client (or middleware)
// already set it; otherwise it mints a new UUID so every request can be traced.
func CorrelationFromRequest(r *http.Request) string {
	if r == nil {
		return uuid.NewString()
	}
	if v := r.Header.Get("X-Correlation-ID"); v != "" {
		return v
	}
	return uuid.NewString()
}

// Env reads an environment variable, returning fallback when unset or empty.
// Mirrors production common.Env so local defaults stay explicit in call sites.
func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// CorrelationMiddleware ensures every response (and downstream handler) sees
// X-Correlation-ID. If the inbound request lacks the header, a UUID is generated
// and injected into the request header before calling the next handler.
func CorrelationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cid := r.Header.Get("X-Correlation-ID")
		if cid == "" {
			cid = uuid.NewString()
			r.Header.Set("X-Correlation-ID", cid)
		}
		w.Header().Set("X-Correlation-ID", cid)
		next.ServeHTTP(w, r)
	})
}
