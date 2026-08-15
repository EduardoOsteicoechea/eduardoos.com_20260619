// Package documents serves pamphlet PDF generation for Eduardo OS Next.
// The first cut returns a single-page stub PDF so the pamphlet Print button
// can download application/pdf without depending on the production documents service.
package documents

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/pkg/pdf"

	"github.com/go-chi/chi/v5"
)

// Handler mounts JWT-protected document routes.
type Handler struct {
	JWTSecret string
	auth      *auth.Handler
}

// NewHandler builds a documents handler.
func NewHandler(jwtSecret string) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		auth:      &auth.Handler{JWTSecret: jwtSecret},
	}
}

// Routes mounts pamphlet PDF under /api/documents/*.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Post("/api/documents/pamphlet/pdf", h.PamphletPDF)
	})
}

// pamphletBody is a loose subset of the pamphlet-generator JSON payload.
// We only peek at header.title for the stub title line.
type pamphletBody struct {
	Header struct {
		Title string `json:"title"`
	} `json:"header"`
	Title string `json:"title"`
}

// PamphletPDF returns a minimal single-page PDF for the authenticated user.
// Body may be empty or full pamphlet JSON; unknown fields are ignored.
func (h *Handler) PamphletPDF(w http.ResponseWriter, r *http.Request) {
	_ = auth.UserEmailFromRequest(r)
	_ = httpx.CorrelationFromRequest(r)

	raw, _ := io.ReadAll(r.Body)
	title := "Eduardo OS Pamphlet"
	if len(bytesTrimSpace(raw)) > 0 {
		var body pamphletBody
		if err := json.Unmarshal(raw, &body); err == nil {
			if t := strings.TrimSpace(body.Header.Title); t != "" {
				title = t
			} else if t := strings.TrimSpace(body.Title); t != "" {
				title = t
			}
		}
	}

	data := pdf.BuildSamplePDF(title)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="panfleto.pdf"`)
	w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func bytesTrimSpace(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}
