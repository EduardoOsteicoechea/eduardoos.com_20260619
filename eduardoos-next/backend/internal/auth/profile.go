package auth

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// MountProfileRoutes registers JWT-protected profile endpoints that match
// production gateway contracts used by the header avatar and profile page:
//   GET  /api/auth/profile
//   POST /api/auth/profile/image
func (h *Handler) MountProfileRoutes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.RequireJWT)
		r.Get("/api/auth/profile", h.GetProfile)
		r.Post("/api/auth/profile/image", h.UploadProfileImage)
	})
}

// GetProfile returns the signed-in user's email and optional avatar URL.
// profileImageUrl is derived from profileImageKey so the header <img> can
// load /api/media/file/profiles/... without a separate redirect hop.
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := UserEmailFromRequest(r)
	user, ok, err := h.Store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] auth.profile.get store_error email=%s err=%v", cid, email, err)
		httpx.WriteError(w, http.StatusBadGateway, "profile lookup failed")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	key := strings.TrimSpace(user.ProfileImageKey)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":           user.Email,
		"role":            ResolveRole(user.Email, user.Role),
		"profileImageKey": key,
		"profileImageUrl": ProfileImageURLFromKey(key),
	})
}

// UploadProfileImage accepts multipart field "file", stores bytes under
// media/profiles/{email}/avatar{ext}, and persists profileImageKey on the user.
func (h *Handler) UploadProfileImage(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := UserEmailFromRequest(r)
	log.Printf("[correlation=%s] auth.profile.image.upload begin email=%s", cid, email)

	if err := r.ParseMultipartForm(8 << 20); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil || len(data) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "read file failed")
		return
	}

	filename := ProfileImageFilenameFromUpload(header.Filename)
	objectKey := ProfileImageObjectKey(email, filename)
	if err := putProfileImageObject(r, objectKey, filepath.Base(filename), data); err != nil {
		log.Printf("[correlation=%s] auth.profile.image.upload s3_error key=%s err=%v", cid, objectKey, err)
		httpx.WriteError(w, http.StatusBadGateway, "profile image upload failed")
		return
	}

	user, ok, err := h.Store.GetUser(r.Context(), email)
	if err != nil || !ok {
		log.Printf("[correlation=%s] auth.profile.image.upload user_miss email=%s err=%v", cid, email, err)
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	user.ProfileImageKey = objectKey
	if err := h.Store.PutUser(r.Context(), user); err != nil {
		log.Printf("[correlation=%s] auth.profile.image.upload save_error email=%s err=%v", cid, email, err)
		httpx.WriteError(w, http.StatusBadGateway, "profile update failed")
		return
	}

	imageURL := ProfileImageURLFromKey(objectKey)
	log.Printf("[correlation=%s] auth.profile.image.upload success email=%s key=%s", cid, email, objectKey)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"status":          "ok",
		"profileImageKey": objectKey,
		"profileImageUrl": imageURL,
	})
}

func profileMediaBucket() string {
	b := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if b == "" {
		b = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	return b
}

func putProfileImageObject(r *http.Request, objectKey, filename string, data []byte) error {
	bucket := profileMediaBucket()
	if bucket == "" {
		return errProfileS3Unavailable
	}
	cfg, err := awsx.LoadConfig(r.Context())
	if err != nil {
		return err
	}
	client := s3.NewFromConfig(cfg)
	ct := contentTypeForProfileFilename(filename)
	_, err = client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(ct),
	})
	return err
}

var errProfileS3Unavailable = &profileS3Error{msg: "S3_BUCKET not configured"}

type profileS3Error struct{ msg string }

func (e *profileS3Error) Error() string { return e.msg }

func contentTypeForProfileFilename(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "application/octet-stream"
	}
}
