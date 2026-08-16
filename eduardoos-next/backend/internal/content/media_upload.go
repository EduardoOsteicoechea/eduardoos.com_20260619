package content

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode"

	"eduardoos.nex/internal/aps"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

// Admin-only worship audio upload (MediaRecorder / mic recordings).
// POST /api/media/audio/upload — multipart field "file", optional "title" / "prefix".
// Objects land under media/{prefix}/ (default worship_playlists) so ListMediaAudio
// and PlaylistBuilder pick them up immediately after a successful put.

const maxWorshipAudioUploadBytes = 64 << 20 // 64 MiB

var safeAudioBaseName = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

// UploadMediaAudio stores a recorded/uploaded audio blob in S3 (APS admin only).
func (h *Handler) UploadMediaAudio(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !aps.IsAdminEmail(email) {
		httpx.WriteError(w, http.StatusForbidden, "admin only")
		return
	}

	if err := r.ParseMultipartForm(maxWorshipAudioUploadBytes); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxWorshipAudioUploadBytes+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read upload")
		return
	}
	if len(data) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "empty file")
		return
	}
	if len(data) > maxWorshipAudioUploadBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "audio too large")
		return
	}

	audioPrefix := strings.TrimSpace(r.FormValue("prefix"))
	if audioPrefix == "" {
		audioPrefix = httpx.Env("S3_AUDIO_PREFIX", "worship_playlists")
	}
	audioPrefix = strings.Trim(audioPrefix, "/")
	if audioPrefix == "" || strings.Contains(audioPrefix, "..") || strings.Contains(audioPrefix, "\\") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid prefix")
		return
	}

	title := strings.TrimSpace(r.FormValue("title"))
	filename := sanitizeWorshipAudioFilename(header.Filename, title, header.Header.Get("Content-Type"))
	ct := contentTypeFromKey(filename)
	if headerCT := strings.TrimSpace(header.Header.Get("Content-Type")); headerCT != "" && strings.HasPrefix(strings.ToLower(headerCT), "audio/") {
		ct = headerCT
	}
	if !isAudioContentType(ct, filename) {
		httpx.WriteError(w, http.StatusBadRequest, "audio file required")
		return
	}

	relKey := path.Join(audioPrefix, filename)
	objectKey := absoluteMediaKey(relKey)

	client, bucket, err := mediaS3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] media.audio.upload no-s3 user=%s: %v", cid, email, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "media store unavailable")
		return
	}

	_, err = client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(ct),
	})
	if err != nil {
		log.Printf("[correlation=%s] media.audio.upload s3_error user=%s key=%s: %v", cid, email, objectKey, err)
		httpx.WriteError(w, http.StatusBadGateway, "audio upload failed")
		return
	}

	region := httpx.Env("AWS_REGION", "us-east-1")
	track := mediaAudioTrack{
		Key:          objectKey,
		Name:         path.Base(objectKey),
		ContentType:  ct,
		Size:         len(data),
		SizeHuman:    formatSize(len(data)),
		LastModified: time.Now().UTC().Format(time.RFC3339),
		URL:          "/api/media/file/" + encodeMediaPath(relativeMediaKey(objectKey)),
		S3URL:        fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, encodeMediaPath(objectKey)),
	}

	log.Printf("[correlation=%s] media.audio.upload success user=%s key=%s bytes=%d", cid, email, objectKey, len(data))
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"track":  track,
		"prefix": audioPrefix,
	})
}

// sanitizeWorshipAudioFilename builds a safe basename under worship_playlists/.
// Prefers an optional human title; otherwise uses the upload name; always keeps
// a known audio extension (default .webm for MediaRecorder blobs).
func sanitizeWorshipAudioFilename(uploadName, title, contentType string) string {
	ext := strings.ToLower(path.Ext(strings.TrimSpace(uploadName)))
	if !isAllowedAudioExt(ext) {
		ext = extFromAudioContentType(contentType)
	}
	if !isAllowedAudioExt(ext) {
		ext = ".webm"
	}

	base := strings.TrimSpace(title)
	if base == "" {
		base = strings.TrimSuffix(path.Base(strings.TrimSpace(uploadName)), path.Ext(uploadName))
	}
	base = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return '-'
		}
		return r
	}, base)
	base = safeAudioBaseName.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-._")
	if base == "" {
		base = "recording-" + time.Now().UTC().Format("20060102-150405")
	}
	if len(base) > 120 {
		base = base[:120]
	}
	// Collision-safe suffix so re-records with the same title do not overwrite.
	return fmt.Sprintf("%s-%s%s", base, uuid.NewString()[:8], ext)
}

func isAllowedAudioExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm":
		return true
	default:
		return false
	}
}

func extFromAudioContentType(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	switch {
	case strings.Contains(ct, "webm"):
		return ".webm"
	case strings.Contains(ct, "mpeg"), strings.Contains(ct, "mp3"):
		return ".mp3"
	case strings.Contains(ct, "wav"):
		return ".wav"
	case strings.Contains(ct, "ogg"):
		return ".ogg"
	case strings.Contains(ct, "mp4"), strings.Contains(ct, "m4a"), strings.Contains(ct, "aac"):
		return ".m4a"
	case strings.Contains(ct, "flac"):
		return ".flac"
	default:
		return ""
	}
}
