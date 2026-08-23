// Package documents serves pamphlet PDF generation for Eduardo OS Next.
// Print uses the same raw PDF builder as production (Roboto + WinAnsi, two-page
// US Letter landscape) so accents and multi-column layout match the sheet.
package documents

import (
	"encoding/json"
	"io"
	"log"
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

// allowedPamphletTypes are the print-time document.type values the FE may send.
var allowedPamphletTypes = map[string]struct{}{
	"":                           {}, // legacy bodies without type
	"pamphlet_single_sheet":      {},
	"pamphlet_structured_images": {},
}

// PamphletPDF renders the full pamphlet JSON body as application/pdf.
// Accepts pamphlet_single_sheet and pamphlet_structured_images (lead images on
// odd columns). Content-Disposition uses UTF-8 filename*.
func (h *Handler) PamphletPDF(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] documents.pamphlet_pdf begin user=%s contentLength=%d",
		cid, email, r.ContentLength)

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[correlation=%s] documents.pamphlet_pdf read_body_failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, "could not read body")
		return
	}
	trimmed := bytesTrimSpace(raw)
	log.Printf("[correlation=%s] documents.pamphlet_pdf body_bytes=%d", cid, len(trimmed))
	if len(trimmed) == 0 {
		log.Printf("[correlation=%s] documents.pamphlet_pdf empty_body", cid)
		httpx.WriteError(w, http.StatusBadRequest, "document must be JSON pamphlet")
		return
	}

	var doc pdf.PamphletDocument
	if err := json.Unmarshal(trimmed, &doc); err != nil {
		preview := string(trimmed)
		if len(preview) > 240 {
			preview = preview[:240] + "…"
		}
		log.Printf("[correlation=%s] documents.pamphlet_pdf json_unmarshal_failed err=%v preview=%q",
			cid, err, preview)
		httpx.WriteError(w, http.StatusBadRequest, "document must be JSON pamphlet: "+err.Error())
		return
	}

	t := strings.TrimSpace(doc.Type)
	if _, ok := allowedPamphletTypes[t]; !ok {
		log.Printf("[correlation=%s] documents.pamphlet_pdf bad_type type=%q title=%q",
			cid, t, doc.Header.Title)
		httpx.WriteError(w, http.StatusBadRequest,
			`document.type must be "pamphlet_single_sheet" or "pamphlet_structured_images"`)
		return
	}

	colCounts := [8]int{
		len(doc.Column1), len(doc.Column2), len(doc.Column3), len(doc.Column4),
		len(doc.Column5), len(doc.Column6), len(doc.Column7), len(doc.Column8),
	}
	imageItems := 0
	for _, col := range [][]pdf.PamphletItem{
		doc.Column1, doc.Column2, doc.Column3, doc.Column4,
		doc.Column5, doc.Column6, doc.Column7, doc.Column8,
	} {
		for _, it := range col {
			if it.Type == "image" {
				imageItems++
			}
		}
	}
	log.Printf("[correlation=%s] documents.pamphlet_pdf render type=%q title=%q cols=%v images=%d headerLayout=%v footerLayout=%v",
		cid, t, strings.TrimSpace(doc.Header.Title), colCounts, imageItems,
		doc.HeaderLayout != (pdf.PamphletHeaderLayout{}),
		doc.FooterLayout != (pdf.PamphletFooterLayout{}))

	data := pdf.BuildPamphletPDF(doc)
	downloadName := "panfleto.pdf"
	if title := strings.TrimSpace(doc.Header.Title); title != "" {
		downloadName = title + ".pdf"
	}
	log.Printf("[correlation=%s] documents.pamphlet_pdf ok pdfBytes=%d download=%q",
		cid, len(data), downloadName)

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", httpx.ContentDispositionAttachment(downloadName))
	w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(data); err != nil {
		log.Printf("[correlation=%s] documents.pamphlet_pdf write_failed err=%v", cid, err)
	}
}

func bytesTrimSpace(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}
