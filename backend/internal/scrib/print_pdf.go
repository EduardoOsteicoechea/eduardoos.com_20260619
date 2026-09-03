// Package scrib — Print PDF endpoint: accept a client-captured light grayscale
// sheet raster and return a portrait US Letter PDF download (spec 024).
package scrib

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/pkg/pdf"
)

const maxPrintImageBytes = 12 << 20 // 12 MiB decoded budget

type printPDFRequest struct {
	ImageBase64 string `json:"imageBase64"`
	FileName    string `json:"fileName,omitempty"`
}

// PrintPDF builds application/pdf from a client sheet capture.
func (h *Handler) PrintPDF(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	body, err := io.ReadAll(io.LimitReader(r.Body, maxPrintImageBytes+1024))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "unreadable body")
		return
	}
	var req printPDFRequest
	if err := json.Unmarshal(body, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	raw, err := decodePrintImage(req.ImageBase64)
	if err != nil || len(raw) == 0 {
		log.Printf("[correlation=%s] scrib.print_pdf bad_image: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, "imageBase64 required (jpeg/png)")
		return
	}
	if len(raw) > maxPrintImageBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "image too large")
		return
	}
	out, err := pdf.BuildScribPrintPDF(raw)
	if err != nil {
		log.Printf("[correlation=%s] scrib.print_pdf build_failed: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, "could not build print pdf")
		return
	}
	name := strings.TrimSpace(req.FileName)
	if name == "" {
		name = "scrib-sheet.pdf"
	}
	if !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		name += ".pdf"
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="`+sanitizeFileName(name)+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
	log.Printf("[correlation=%s] scrib.print_pdf ok bytes=%d", cid, len(out))
}

func decodePrintImage(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, io.ErrUnexpectedEOF
	}
	if i := strings.Index(s, "base64,"); i >= 0 {
		s = s[i+len("base64,"):]
	}
	return base64.StdEncoding.DecodeString(s)
}

func sanitizeFileName(name string) string {
	name = strings.ReplaceAll(name, `"`, "")
	name = strings.ReplaceAll(name, "/", "-")
	name = strings.ReplaceAll(name, "\\", "-")
	if name == "" {
		return "scrib-sheet.pdf"
	}
	return name
}
