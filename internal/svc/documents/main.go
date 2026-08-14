package documents

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pdf"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func Run(addr string) error {
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
		// Pamphlet PDF: exact US Letter landscape mm geometry (279.4 × 215.9), two pages.
		r.Post("/pamphlet", handlePamphletPDF())
	})
	log.Printf("documents listening on %s", addr)
	return http.ListenAndServe(addr, r)
}

func handlePamphletPDF() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, "could not read body")
			return
		}
		var doc pdf.PamphletDocument
		if err := json.Unmarshal(raw, &doc); err != nil {
			common.WriteError(w, http.StatusBadRequest, "document must be JSON pamphlet")
			return
		}
		if strings.TrimSpace(doc.Type) != "" && doc.Type != "pamphlet_single_sheet" {
			common.WriteError(w, http.StatusBadRequest, "document.type must be pamphlet_single_sheet")
			return
		}
		data := pdf.BuildPamphletPDF(doc)
		downloadName := "panfleto.pdf"
		if t := strings.TrimSpace(doc.Header.Title); t != "" {
			downloadName = t + ".pdf"
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", common.ContentDispositionAttachment(downloadName))
		// Let browsers / fetch() read the UTF-8 filename* parameter.
		w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	}
}
