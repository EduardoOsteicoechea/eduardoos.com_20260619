package content

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// .emusic lyrics documents live at media/emusic_files/{slug}.emusic (production parity).
// GET is public; PUT requires APS admin (eduardooost@gmail.com).

var emusicSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func emusicObjectKey(slug string) string {
	return fmt.Sprintf("%s/emusic_files/%s.emusic", mediaPrefix(), slug)
}

func sanitizeEmusicSlug(raw string) (string, error) {
	slug := strings.ToLower(strings.TrimSpace(raw))
	slug = strings.TrimSuffix(slug, ".emusic")
	if !emusicSlugPattern.MatchString(slug) {
		return "", fmt.Errorf("invalid emusic slug")
	}
	if len(slug) > 180 {
		return "", fmt.Errorf("emusic slug too long")
	}
	return slug, nil
}

// GetEmusic returns a stored .emusic document for the slug.
func (h *Handler) GetEmusic(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	slug, err := sanitizeEmusicSlug(chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	client, bucket, err := mediaS3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] emusic.get no-s3 slug=%s: %v", cid, slug, err)
		httpx.WriteError(w, http.StatusNotFound, "emusic not found")
		return
	}

	key := emusicObjectKey(slug)
	out, err := client.GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[correlation=%s] emusic.get miss slug=%s: %v", cid, slug, err)
		httpx.WriteError(w, http.StatusNotFound, "emusic not found")
		return
	}
	defer out.Body.Close()
	body, err := io.ReadAll(out.Body)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not read emusic")
		return
	}

	var document json.RawMessage
	if err := json.Unmarshal(body, &document); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "stored emusic is not valid JSON")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"slug":     slug,
		"s3Key":    key,
		"document": document,
	})
}

// PutEmusic saves a .emusic document (APS admin only).
func (h *Handler) PutEmusic(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !auth.IsAdminEmail(email) {
		httpx.WriteError(w, http.StatusForbidden, "admin only")
		return
	}

	slug, err := sanitizeEmusicSlug(chi.URLParam(r, "slug"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req struct {
		Document json.RawMessage `json:"document"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(req.Document) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "document required")
		return
	}

	var probe struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(req.Document, &probe); err != nil || probe.Type != "emusic" {
		httpx.WriteError(w, http.StatusBadRequest, "document.type must be emusic")
		return
	}

	var normalized any
	if err := json.Unmarshal(req.Document, &normalized); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "document must be JSON object")
		return
	}
	payload, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not normalize document")
		return
	}
	payload = append(payload, '\n')

	client, bucket, err := mediaS3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] emusic.put no-s3: %v", cid, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "media store unavailable")
		return
	}

	key := emusicObjectKey(slug)
	_, err = client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(payload),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		log.Printf("[correlation=%s] emusic.put s3 error user=%s slug=%s: %v", cid, email, slug, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save emusic")
		return
	}

	log.Printf("[correlation=%s] emusic.put user=%s slug=%s bytes=%d key=%s", cid, email, slug, len(payload), key)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"slug":     slug,
		"s3Key":    key,
		"document": json.RawMessage(payload),
	})
}
