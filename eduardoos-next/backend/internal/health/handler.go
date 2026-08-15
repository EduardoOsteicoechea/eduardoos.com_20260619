package health

import (
	"encoding/json"
	"net/http"
)

// Handler returns a tiny JSON probe used by deploy smoke checks and local ops.
func Handler(service string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": service,
		})
	}
}
