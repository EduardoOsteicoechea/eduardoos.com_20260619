// Package latin — public GET APIs for the parallel Institutes paragraph pack (spec 056).
// Mounted beside the Capita routes; does not alter Index/Section Capita behavior.
package latin

import (
	"encoding/json"
	"log"
	"net/http"
	"path"
	"regexp"
	"strings"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// chapterTokenRe allows PRELIMINARY or Roman numerals used as Caput labels.
var chapterTokenRe = regexp.MustCompile(`^(?:PRELIMINARY|[IVXLCDM]+)$`)

var bookTokenRe = regexp.MustCompile(`^(?:I|II|III|IV)$`)

// ParagraphPrefix is the S3 prefix for the parallel pack (never the Capita prefix).
func (h *Handler) ParagraphPrefix() string {
	if h == nil {
		return "calvin-institutes-paragraphs"
	}
	if p := strings.TrimSpace(h.ParaPrefix); p != "" {
		return strings.Trim(p, "/")
	}
	return "calvin-institutes-paragraphs"
}

// mountParagraphRoutes registers the book→chapter→paragraph public APIs.
func (h *Handler) mountParagraphRoutes(r chi.Router) {
	r.Get("/api/latin/calvins-institutes/paragraphs", h.ParagraphIndex)
	r.Get("/api/latin/calvins-institutes/paragraphs/chapters/{book}/{chapter}", h.ParagraphChapter)
}

// ParagraphIndex streams calvin-institutes-paragraphs/index.json after readiness.
func (h *Handler) ParagraphIndex(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	key := h.ParagraphPrefix() + "/index.json"
	raw, err := h.getObjectBytes(r.Context(), key)
	if err != nil {
		log.Printf("[correlation=%s] latin.paragraphs miss key=%s: %v", cid, key, err)
		httpx.WriteError(w, http.StatusNotFound, "paragraph pack not found")
		return
	}
	var idx ParagraphIndex
	if err := json.Unmarshal(raw, &idx); err != nil {
		log.Printf("[correlation=%s] latin.paragraphs bad index: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "paragraph index unreadable")
		return
	}
	ready, reason := ValidateParagraphIndex(idx)
	if !ready {
		log.Printf("[correlation=%s] latin.paragraphs not ready: %s", cid, reason)
		httpx.WriteError(w, http.StatusServiceUnavailable, "paragraph pack not ready: "+reason)
		return
	}
	body, err := json.Marshal(idx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "paragraph index encode failed")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// ParagraphChapter streams one chapter JSON from the parallel pack.
func (h *Handler) ParagraphChapter(w http.ResponseWriter, r *http.Request) {
	book := strings.TrimSpace(chi.URLParam(r, "book"))
	chapter := strings.TrimSpace(chi.URLParam(r, "chapter"))
	if !bookTokenRe.MatchString(book) || !chapterTokenRe.MatchString(chapter) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid book or chapter")
		return
	}
	// path.Join keeps forward slashes for the S3 key.
	rel := path.Join("chapters", book, chapter+".json")
	h.serveKey(w, r, h.ParagraphPrefix()+"/"+rel)
}
