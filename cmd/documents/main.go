// Documents — raw PDF generation microservice.
package main

import (
	"encoding/json"
	"log"
	"net/http"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pdf"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("documents", nil))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/generate", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Title string `json:"title"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Title == "" {
				body.Title = "Eduardo OS Document"
			}
			data := pdf.BuildSamplePDF(body.Title)
			w.Header().Set("Content-Type", "application/pdf")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
		})
	})
	log.Printf("documents listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}
