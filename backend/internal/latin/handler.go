// Package latin serves Calvin’s Institutes JSON from S3 (prefix calvin-institutes/).
// Public read-only APIs for the /latin/calvins-institutes Astro page.
//
// Corpus: Latin-only 1559 Institutes (institutiochrist1559calv_abbyy.xml).
// The public index is readiness-gated: sectionCount and sourceSha256 must match
// the sanitized asset contract in specs/032-calvins-institutes.
package latin

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strings"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// Readiness gate for the sanitized Latin 1559 website assets.
const (
	expectedSourceSha256 = "ecc221dfb9428e34de11e392df0711d96cf0333e5fbb5baa1a4a5e774309ccc8"
	expectedSectionCount = 81
)

// sectionIDRe allows 0001, section-0001, or 1..9999 padded forms only.
var sectionIDRe = regexp.MustCompile(`^(?:section-)?(\d{1,4})$`)

// objectAPI is the S3 GetObject surface (mocked in tests).
type objectAPI interface {
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}

// Handler proxies Institutes assets from the Eduardo S3 bucket.
type Handler struct {
	S3     objectAPI
	Bucket string
	Prefix string
}

// institutesIndex is the S3 index.json shape for the Latin 1559 corpus.
type institutesIndex struct {
	SchemaVersion int                    `json:"schemaVersion,omitempty"`
	SourceSha256  string                 `json:"sourceSha256,omitempty"`
	SectionCount  int                    `json:"sectionCount"`
	Sections      []institutesIndexEntry `json:"sections"`
}

type institutesIndexEntry struct {
	ID              string  `json:"id"`
	Order           int     `json:"order"`
	Volume          *int    `json:"volume,omitempty"`
	Book            string  `json:"book"`
	Section         string  `json:"section"`
	Heading         string  `json:"heading"`
	ParagraphCount  int     `json:"paragraphCount,omitempty"`
	PointCount      int     `json:"pointCount,omitempty"`
	URL             string  `json:"url"`
}

// NewHandler builds a handler using S3_BUCKET and optional CALVIN_INSTITUTES_S3_PREFIX.
func NewHandler(ctx context.Context) *Handler {
	h := &Handler{
		Prefix: strings.Trim(httpx.Env("CALVIN_INSTITUTES_S3_PREFIX", "calvin-institutes"), "/"),
	}
	bucket := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if bucket == "" {
		bucket = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	h.Bucket = bucket
	if bucket == "" {
		log.Printf("latin institutes: S3_BUCKET unset — routes will return 503")
		return h
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("latin institutes: aws config: %v", err)
		return h
	}
	h.S3 = s3.NewFromConfig(cfg)
	return h
}

// Routes mounts public GET endpoints (no JWT).
func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/latin/calvins-institutes", h.Index)
	r.Get("/api/latin/calvins-institutes/sections/{id}", h.Section)
}

// Index streams calvin-institutes/index.json after readiness checks.
// Stale/wrong corpora (sha or count mismatch) return 503 so the UI does not
// ship against an old cache.
func (h *Handler) Index(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	key := h.Prefix + "/index.json"
	raw, err := h.getObjectBytes(r.Context(), key)
	if err != nil {
		log.Printf("[correlation=%s] latin.institutes miss key=%s: %v", cid, key, err)
		httpx.WriteError(w, http.StatusNotFound, "section not found")
		return
	}
	var idx institutesIndex
	if err := json.Unmarshal(raw, &idx); err != nil {
		log.Printf("[correlation=%s] latin.institutes bad index: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "institutes index unreadable")
		return
	}
	ready, reason := validateLatinIndex(idx)
	if !ready {
		log.Printf("[correlation=%s] latin.institutes not ready: %s", cid, reason)
		httpx.WriteError(w, http.StatusServiceUnavailable, "institutes corpus not ready: "+reason)
		return
	}
	out := normalizeLatinIndex(idx)
	body, err := json.Marshal(out)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "institutes index encode failed")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// Bypass CDN/browser caches so readiness always reflects the live S3 object.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// Section streams calvin-institutes/sections/NNNN.json (Latin 1559 section object).
func (h *Handler) Section(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	nnnn, err := normalizeSectionID(id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid section id")
		return
	}
	h.serveKey(w, r, fmt.Sprintf("%s/sections/%s.json", h.Prefix, nnnn))
}

func (h *Handler) getObjectBytes(ctx context.Context, key string) ([]byte, error) {
	if h == nil || h.S3 == nil || h.Bucket == "" {
		return nil, fmt.Errorf("institutes store unavailable")
	}
	out, err := h.S3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (h *Handler) serveKey(w http.ResponseWriter, r *http.Request, key string) {
	cid := httpx.CorrelationFromRequest(r)
	if h == nil || h.S3 == nil || h.Bucket == "" {
		log.Printf("[correlation=%s] latin.institutes unavailable key=%s", cid, key)
		httpx.WriteError(w, http.StatusServiceUnavailable, "institutes store unavailable")
		return
	}
	out, err := h.S3.GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(h.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[correlation=%s] latin.institutes miss key=%s: %v", cid, key, err)
		httpx.WriteError(w, http.StatusNotFound, "section not found")
		return
	}
	defer out.Body.Close()

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", *out.ContentLength))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, out.Body); err != nil {
		log.Printf("[correlation=%s] latin.institutes stream error key=%s: %v", cid, key, err)
	}
}

// validateLatinIndex enforces the sanitized corpus readiness contract.
func validateLatinIndex(idx institutesIndex) (bool, string) {
	if strings.TrimSpace(idx.SourceSha256) != expectedSourceSha256 {
		return false, "sourceSha256 mismatch"
	}
	if idx.SectionCount != expectedSectionCount {
		return false, fmt.Sprintf("sectionCount=%d want %d", idx.SectionCount, expectedSectionCount)
	}
	if len(idx.Sections) != expectedSectionCount {
		return false, fmt.Sprintf("sections len=%d want %d", len(idx.Sections), expectedSectionCount)
	}
	return true, ""
}

// normalizeLatinIndex sorts by order and refreshes sectionCount from the list.
func normalizeLatinIndex(idx institutesIndex) institutesIndex {
	out := institutesIndex{
		SchemaVersion: idx.SchemaVersion,
		SourceSha256:  idx.SourceSha256,
		Sections:      append([]institutesIndexEntry(nil), idx.Sections...),
	}
	sort.SliceStable(out.Sections, func(i, j int) bool {
		return out.Sections[i].Order < out.Sections[j].Order
	})
	out.SectionCount = len(out.Sections)
	return out
}

func normalizeSectionID(raw string) (string, error) {
	m := sectionIDRe.FindStringSubmatch(strings.TrimSpace(raw))
	if m == nil {
		return "", fmt.Errorf("invalid")
	}
	n := m[1]
	for len(n) < 4 {
		n = "0" + n
	}
	if len(n) > 4 {
		return "", fmt.Errorf("invalid")
	}
	return n, nil
}
