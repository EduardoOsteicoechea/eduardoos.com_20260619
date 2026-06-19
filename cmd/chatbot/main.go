// Chatbot — context-isolated conversational echo routing engine.
package main

import (
	"encoding/json"
	"log"
	"net/http"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("chatbot", nil))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/chat", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				SessionID string `json:"session_id"`
				Message   string `json:"message"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			common.WriteJSON(w, http.StatusOK, map[string]string{
				"session_id": body.SessionID,
				"reply":      "Echo: " + body.Message,
			})
		})
	})
	log.Printf("chatbot listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}
