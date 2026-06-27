// Documents — raw PDF generation microservice.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/common"
	"eduardoos/pkg/pdf"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	pamphletStore, err := ddb.NewPamphletDocumentStore(ctx)
	if err != nil {
		log.Fatalf("pamphlet store: %v", err)
	}
	log.Printf("pamphlet store backend=%s", pamphletStore.BackendName())

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("documents", map[string]any{
		"pamphlets_backend": pamphletStore.BackendName(),
	}))
	registerPamphletRoutes(r, secret, pamphletStore)
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
