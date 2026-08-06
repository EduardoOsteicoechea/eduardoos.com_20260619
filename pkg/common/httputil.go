package common

import (
	"encoding/json"
	"net/http"
)

const CorrelationHeader = "x-correlation-id"

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"message": message})
}

func CorrelationFromRequest(r *http.Request) string {
	if v := r.Header.Get(CorrelationHeader); v != "" {
		return v
	}
	return "unknown"
}

func InternalAuthMiddleware(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get(InternalTokenHeader)
			if !VerifyInternalToken(secret, token) {
				WriteError(w, http.StatusUnauthorized, "invalid internal token")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func HealthHandler(service string, extra map[string]any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		body := map[string]any{"status": "ok", "service": service}
		for k, v := range extra {
			body[k] = v
		}
		WriteJSON(w, http.StatusOK, body)
	}
}
