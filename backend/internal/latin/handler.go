// Package latin serves Calvin’s Institutes JSON from S3 (prefix calvin-institutes/).
// Public read-only APIs for the /latin/calvins-institutes Astro page.
package latin

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// sectionIDRe allows 0001, section-0001, or 1..473 padded forms only.
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

// Index streams calvin-institutes/index.json.
func (h *Handler) Index(w http.ResponseWriter, r *http.Request) {
	h.serveKey(w, r, h.Prefix+"/index.json")
}

// Section streams calvin-institutes/sections/NNNN.json.
func (h *Handler) Section(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	nnnn, err := normalizeSectionID(id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid section id")
		return
	}
	h.serveKey(w, r, fmt.Sprintf("%s/sections/%s.json", h.Prefix, nnnn))
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
	w.Header().Set("Cache-Control", "public, max-age=120")
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", *out.ContentLength))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, out.Body); err != nil {
		log.Printf("[correlation=%s] latin.institutes stream error key=%s: %v", cid, key, err)
	}
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
