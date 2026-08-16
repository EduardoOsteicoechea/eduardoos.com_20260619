// Package documents serves pamphlet PDF generation for Eduardo OS Next.
// Print uses the same raw PDF builder as production (Roboto + WinAnsi, two-page
// US Letter landscape) so accents and multi-column layout match the sheet.
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

// PamphletPDF renders the full pamphlet JSON body as application/pdf.
// Same contract as production documents /pamphlet: type pamphlet_single_sheet,
// header/footer/column_1..8, Content-Disposition with UTF-8 filename*.
func (h *Handler) PamphletPDF(w http.ResponseWriter, r *http.Request) {
	_ = auth.UserEmailFromRequest(r)
	_ = httpx.CorrelationFromRequest(r)

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read body")
		return
	}
	if len(bytesTrimSpace(raw)) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "document must be JSON pamphlet")
		return
	}

	var doc pdf.PamphletDocument
	if err := json.Unmarshal(raw, &doc); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "document must be JSON pamphlet")
		return
	}
	if t := strings.TrimSpace(doc.Type); t != "" && t != "pamphlet_single_sheet" {
		httpx.WriteError(w, http.StatusBadRequest, "document.type must be pamphlet_single_sheet")
		return
	}

	data := pdf.BuildPamphletPDF(doc)
	downloadName := "panfleto.pdf"
	if title := strings.TrimSpace(doc.Header.Title); title != "" {
		downloadName = title + ".pdf"
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", httpx.ContentDispositionAttachment(downloadName))
	w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func bytesTrimSpace(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}
