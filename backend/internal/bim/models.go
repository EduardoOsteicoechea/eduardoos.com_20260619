// Package bim IFC library storage under S3 prefix ifcbim/library/ (spec 037).
// Public list + file stream; admin multipart upload. No DynamoDB in this slice.
package bim

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

const (
	libraryPrefix          = "ifcbim/library"
	maxIfcUploadBytes      = 128 << 20 // 128 MiB
	maxListKeys            = 500
)

var (
	safeIfcBaseName   = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	libraryNameStemRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$`)
)

// LibraryModel is one IFC object listed for the browse modal.
type LibraryModel struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	SizeBytes    int64  `json:"sizeBytes"`
	SizeHuman    string `json:"sizeHuman"`
	LastModified string `json:"lastModified"`
	URL          string `json:"url"`
}

type s3API interface {
	ListObjectsV2(ctx context.Context, params *s3.ListObjectsV2Input, optFns ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	HeadObject(ctx context.Context, params *s3.HeadObjectInput, optFns ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

func (h *Handler) resolveBucket() string {
	b := strings.TrimSpace(httpx.Env("IFCBIM_S3_BUCKET", ""))
	if b == "" {
		b = strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	}
	if b == "" {
		b = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	return b
}

func (h *Handler) s3Client(ctx context.Context) (s3API, string, error) {
	if h.S3 != nil && h.Bucket != "" {
		return h.S3, h.Bucket, nil
	}
	bucket := h.resolveBucket()
	if bucket == "" {
		return nil, "", fmt.Errorf("S3_BUCKET not configured")
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, "", err
	}
	return s3.NewFromConfig(cfg), bucket, nil
}

func librarySearchPrefix() string {
	return libraryPrefix + "/"
}

func encodeLibraryPath(rel string) string {
	parts := strings.Split(rel, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/")
}

func formatBytes(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%d B", n)
	}
	if n < 1024*1024 {
		return fmt.Sprintf("%.1f KiB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MiB", float64(n)/(1024*1024))
}

func sanitizeLibraryName(raw string) string {
	base := path.Base(strings.TrimSpace(raw))
	base = strings.TrimSuffix(base, path.Ext(base))
	base = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return '-'
		}
		return r
	}, base)
	base = safeIfcBaseName.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-._")
	for strings.Contains(base, "--") {
		base = strings.ReplaceAll(base, "--", "-")
	}
	if len(base) > 120 {
		base = base[:120]
	}
	if !libraryNameStemRe.MatchString(base) {
		return ""
	}
	return base + ".ifc"
}

func sanitizeIfcFilename(uploadName string) string {
	if name := sanitizeLibraryName(uploadName); name != "" {
		return name
	}
	return fmt.Sprintf("model-%d.ifc", time.Now().UTC().Unix())
}

func libraryObjectKey(filename string) string {
	return path.Join(libraryPrefix, path.Base(filename))
}

// ensureKeyUnderLibrary rejects path escape outside ifcbim/library/.
func ensureKeyUnderLibrary(key string) (string, bool) {
	key = strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	key = strings.TrimPrefix(key, "/")
	if key == "" || strings.Contains(key, "..") {
		return "", false
	}
	prefix := librarySearchPrefix()
	if !strings.HasPrefix(key, prefix) {
		// Allow relative names under library (basename only).
		if strings.Contains(key, "/") {
			return "", false
		}
		key = libraryObjectKey(key)
	}
	if !strings.HasPrefix(key, prefix) || key == prefix {
		return "", false
	}
	if !strings.HasSuffix(strings.ToLower(key), ".ifc") {
		return "", false
	}
	return key, true
}

// ListModels — GET /api/bim/models (public).
func (h *Handler) ListModels(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	client, bucket, err := h.s3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] bim.models.list no-s3: %v", cid, err)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"prefix": libraryPrefix,
			"count":  0,
			"models": []LibraryModel{},
		})
		return
	}

	out, err := client.ListObjectsV2(r.Context(), &s3.ListObjectsV2Input{
		Bucket:  aws.String(bucket),
		Prefix:  aws.String(librarySearchPrefix()),
		MaxKeys: aws.Int32(maxListKeys),
	})
	if err != nil {
		log.Printf("[correlation=%s] bim.models.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list IFC library")
		return
	}

	models := make([]LibraryModel, 0)
	for _, obj := range out.Contents {
		if obj.Key == nil || strings.HasSuffix(*obj.Key, "/") {
			continue
		}
		key := *obj.Key
		if !strings.HasSuffix(strings.ToLower(key), ".ifc") {
			continue
		}
		var size int64
		if obj.Size != nil {
			size = *obj.Size
		}
		modified := time.Now().UTC().Format(time.RFC3339)
		if obj.LastModified != nil {
			modified = obj.LastModified.UTC().Format(time.RFC3339)
		}
		name := path.Base(key)
		models = append(models, LibraryModel{
			Key:          key,
			Name:         name,
			SizeBytes:    size,
			SizeHuman:    formatBytes(size),
			LastModified: modified,
			URL:          "/api/bim/models/file/" + encodeLibraryPath(strings.TrimPrefix(key, librarySearchPrefix())),
		})
	}

	log.Printf("[correlation=%s] bim.models.list count=%d", cid, len(models))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"prefix": libraryPrefix,
		"count":  len(models),
		"models": models,
	})
}

// GetModelFile — GET /api/bim/models/file/* (public stream).
func (h *Handler) GetModelFile(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	suffix := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if suffix == "" {
		httpx.WriteError(w, http.StatusBadRequest, "file key required")
		return
	}
	if decoded, err := url.PathUnescape(suffix); err == nil {
		suffix = decoded
	}
	key, ok := ensureKeyUnderLibrary(suffix)
	if !ok {
		// Also accept full key passed as suffix.
		key, ok = ensureKeyUnderLibrary(librarySearchPrefix() + path.Base(suffix))
	}
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid library path")
		return
	}

	client, bucket, err := h.s3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] bim.models.file no-s3: %v", cid, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "IFC library unavailable")
		return
	}

	out, err := client.GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[correlation=%s] bim.models.file miss key=%s: %v", cid, key, err)
		httpx.WriteError(w, http.StatusNotFound, "model not found")
		return
	}
	defer out.Body.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", path.Base(key)))
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", *out.ContentLength))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, out.Body); err != nil {
		log.Printf("[correlation=%s] bim.models.file stream key=%s: %v", cid, key, err)
	}
}

// UploadModel — POST /api/bim/models/upload (admin JWT).
// Multipart: file (required) + name (required library basename). Rejects duplicate keys.
func (h *Handler) UploadModel(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)

	if err := r.ParseMultipartForm(maxIfcUploadBytes); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxIfcUploadBytes+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read upload")
		return
	}
	if len(data) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "empty file")
		return
	}
	if len(data) > maxIfcUploadBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "IFC too large")
		return
	}

	rawName := strings.TrimSpace(r.FormValue("name"))
	if rawName == "" {
		httpx.WriteError(w, http.StatusBadRequest, "library name required")
		return
	}
	filename := sanitizeLibraryName(rawName)
	if filename == "" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid library name (use letters, numbers, . _ - ; min 2 chars)")
		return
	}
	key := libraryObjectKey(filename)

	client, bucket, err := h.s3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] bim.models.upload no-s3 user=%s: %v", cid, email, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "IFC library unavailable")
		return
	}

	_, headErr := client.HeadObject(r.Context(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if headErr == nil {
		httpx.WriteError(w, http.StatusConflict, "library name already exists; choose a different name")
		return
	}
	if !isS3NotFound(headErr) {
		log.Printf("[correlation=%s] bim.models.upload head user=%s key=%s: %v", cid, email, key, headErr)
		httpx.WriteError(w, http.StatusBadGateway, "could not check library name")
		return
	}

	_, err = client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String("application/octet-stream"),
	})
	if err != nil {
		log.Printf("[correlation=%s] bim.models.upload s3_error user=%s key=%s: %v", cid, email, key, err)
		httpx.WriteError(w, http.StatusBadGateway, "IFC upload failed")
		return
	}

	_ = header // original upload filename kept only for logs
	log.Printf("[correlation=%s] bim.models.upload ok user=%s key=%s bytes=%d src=%s", cid, email, key, len(data), header.Filename)

	model := LibraryModel{
		Key:          key,
		Name:         filename,
		SizeBytes:    int64(len(data)),
		SizeHuman:    formatBytes(int64(len(data))),
		LastModified: time.Now().UTC().Format(time.RFC3339),
		URL:          "/api/bim/models/file/" + encodeLibraryPath(filename),
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"model":  model,
		"prefix": libraryPrefix,
	})
}

// DeleteModel — DELETE /api/bim/models/file/* (admin JWT). Removes one IFC under ifcbim/library/.
func (h *Handler) DeleteModel(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)

	suffix := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if suffix == "" {
		httpx.WriteError(w, http.StatusBadRequest, "file key required")
		return
	}
	if decoded, err := url.PathUnescape(suffix); err == nil {
		suffix = decoded
	}
	key, ok := ensureKeyUnderLibrary(suffix)
	if !ok {
		key, ok = ensureKeyUnderLibrary(librarySearchPrefix() + path.Base(suffix))
	}
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid library path")
		return
	}

	client, bucket, err := h.s3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] bim.models.delete no-s3 user=%s: %v", cid, email, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "IFC library unavailable")
		return
	}

	_, headErr := client.HeadObject(r.Context(), &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if headErr != nil {
		if isS3NotFound(headErr) {
			httpx.WriteError(w, http.StatusNotFound, "model not found")
			return
		}
		log.Printf("[correlation=%s] bim.models.delete head user=%s key=%s: %v", cid, email, key, headErr)
		httpx.WriteError(w, http.StatusBadGateway, "could not check model")
		return
	}

	_, err = client.DeleteObject(r.Context(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[correlation=%s] bim.models.delete s3_error user=%s key=%s: %v", cid, email, key, err)
		httpx.WriteError(w, http.StatusBadGateway, "IFC delete failed")
		return
	}

	log.Printf("[correlation=%s] bim.models.delete ok user=%s key=%s", cid, email, key)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
		"key":     key,
		"name":    path.Base(key),
		"prefix":  libraryPrefix,
	})
}

func isS3NotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "not found") || strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "status code: 404") || strings.Contains(msg, "statuscode: 404") {
		return true
	}
	var api interface{ ErrorCode() string }
	if errors.As(err, &api) {
		code := strings.ToUpper(api.ErrorCode())
		return code == "NOTFOUND" || code == "NOSUCHKEY"
	}
	return false
}
