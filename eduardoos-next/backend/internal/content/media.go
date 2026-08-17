package content

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// Media routes mirror production gateway contracts used by PlaylistBuilder:
// GET /api/media/audio?prefix=worship_playlists
// GET /api/media/file/*  (relative under S3_PREFIX, default media/)

type mediaAudioTrack struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	SizeHuman    string `json:"size_human,omitempty"`
	LastModified string `json:"last_modified,omitempty"`
	URL          string `json:"url"`
	S3URL        string `json:"s3_url,omitempty"`
}

func mediaBucket() string {
	b := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if b == "" {
		b = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	return b
}

func mediaPrefix() string {
	p := strings.TrimSpace(httpx.Env("S3_PREFIX", "media"))
	return strings.Trim(p, "/")
}

func mediaS3Client(ctx context.Context) (*s3.Client, string, error) {
	bucket := mediaBucket()
	if bucket == "" {
		return nil, "", fmt.Errorf("S3_BUCKET not configured")
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, "", err
	}
	return s3.NewFromConfig(cfg), bucket, nil
}

func absoluteMediaKey(relative string) string {
	rel := strings.TrimPrefix(strings.TrimSpace(relative), "/")
	prefix := mediaPrefix()
	if prefix == "" {
		return rel
	}
	if strings.HasPrefix(rel, prefix+"/") {
		return rel
	}
	return prefix + "/" + rel
}

func relativeMediaKey(objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	prefix := mediaPrefix()
	if prefix == "" {
		return objectKey
	}
	return strings.TrimPrefix(objectKey, prefix+"/")
}

func encodeMediaPath(key string) string {
	parts := strings.Split(key, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func contentTypeFromKey(objectKey string) string {
	switch strings.ToLower(path.Ext(objectKey)) {
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".ogg":
		return "audio/ogg"
	case ".m4a", ".aac":
		return "audio/mp4"
	case ".flac":
		return "audio/flac"
	case ".webm":
		return "audio/webm"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".emusic", ".json":
		return "application/json"
	default:
		return "application/octet-stream"
	}
}

func isAudioContentType(ct, key string) bool {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if strings.HasPrefix(ct, "audio/") || ct == "application/ogg" {
		return true
	}
	return strings.HasPrefix(contentTypeFromKey(key), "audio/")
}

func formatSize(bytes int) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
}

// ListMediaAudio lists audio objects under media/{prefix}/ (default worship_playlists).
func (h *Handler) ListMediaAudio(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	audioPrefix := strings.TrimSpace(r.URL.Query().Get("prefix"))
	if audioPrefix == "" {
		audioPrefix = httpx.Env("S3_AUDIO_PREFIX", "worship_playlists")
	}
	audioPrefix = strings.Trim(audioPrefix, "/")

	client, bucket, err := mediaS3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] media.audio.list no-s3: %v", cid, err)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"prefix": audioPrefix,
			"count":  0,
			"tracks": []mediaAudioTrack{},
		})
		return
	}

	search := absoluteMediaKey(audioPrefix)
	if !strings.HasSuffix(search, "/") {
		search += "/"
	}
	out, err := client.ListObjectsV2(r.Context(), &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(search),
	})
	if err != nil {
		log.Printf("[correlation=%s] media.audio.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list audio library")
		return
	}

	// Soft-deleted library keys stay in S3 but must not appear in the UI list.
	removed := map[string]struct{}{}
	if idx, loadErr := loadLibraryRemovedIndex(r.Context(), mediaS3APIFromClient(client), bucket, audioPrefix); loadErr == nil {
		removed = removedKeySet(idx)
	} else {
		log.Printf("[correlation=%s] media.audio.list removed-index: %v", cid, loadErr)
	}

	region := httpx.Env("AWS_REGION", "us-east-1")
	tracks := make([]mediaAudioTrack, 0)
	for _, obj := range out.Contents {
		if obj.Key == nil || strings.HasSuffix(*obj.Key, "/") {
			continue
		}
		key := *obj.Key
		if _, hide := removed[key]; hide {
			continue
		}
		ct := contentTypeFromKey(key)
		if !isAudioContentType(ct, key) {
			continue
		}
		size := 0
		if obj.Size != nil {
			size = int(*obj.Size)
		}
		modified := time.Now().UTC().Format(time.RFC3339)
		if obj.LastModified != nil {
			modified = obj.LastModified.UTC().Format(time.RFC3339)
		}
		rel := relativeMediaKey(key)
		tracks = append(tracks, mediaAudioTrack{
			Key:          key,
			Name:         path.Base(key),
			ContentType:  ct,
			Size:         size,
			SizeHuman:    formatSize(size),
			LastModified: modified,
			URL:          "/api/media/file/" + encodeMediaPath(rel),
			S3URL:        fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, region, encodeMediaPath(key)),
		})
	}

	log.Printf("[correlation=%s] media.audio.list prefix=%s count=%d", cid, audioPrefix, len(tracks))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"prefix": audioPrefix,
		"count":  len(tracks),
		"tracks": tracks,
	})
}

// GetMediaFile streams an object under media/ by relative path (public playback).
func (h *Handler) GetMediaFile(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	suffix := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if suffix == "" {
		httpx.WriteError(w, http.StatusBadRequest, "file key required")
		return
	}
	if decoded, err := url.PathUnescape(suffix); err == nil {
		suffix = decoded
	}
	if strings.Contains(suffix, "..") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}

	client, bucket, err := mediaS3Client(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] media.file no-s3: %v", cid, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "media store unavailable")
		return
	}

	key := absoluteMediaKey(suffix)
	out, err := client.GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("[correlation=%s] media.file miss key=%s: %v", cid, key, err)
		httpx.WriteError(w, http.StatusNotFound, "file not found")
		return
	}
	defer out.Body.Close()

	ct := contentTypeFromKey(key)
	if out.ContentType != nil && strings.TrimSpace(*out.ContentType) != "" {
		ct = *out.ContentType
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=300")
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", *out.ContentLength))
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, out.Body); err != nil {
		log.Printf("[correlation=%s] media.file stream error key=%s: %v", cid, key, err)
	}
}
