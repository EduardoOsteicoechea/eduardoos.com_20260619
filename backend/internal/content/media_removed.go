package content

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Soft-delete for the worship audio library (PlaylistBuilder).
//
// DELETE /api/media/audio/library — admin only.
// Removes the track from the *library listing* by recording its key in a small
// S3 JSON sidecar (.library_removed.json). The audio object itself is NEVER
// deleted (no DeleteObject on the MP3/WebM). ListMediaAudio filters tombstones.

const libraryRemovedObjectName = ".library_removed.json"

// mediaObjectAPI is the S3 surface used by library soft-delete. DeleteObject is
// part of the interface so tests can assert the retention path never calls it.
type mediaObjectAPI interface {
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

// mediaS3APIFromClient adapts the AWS SDK client to mediaObjectAPI.
func mediaS3APIFromClient(c *s3.Client) mediaObjectAPI {
	return c
}

// newMediaObjectAPI builds the real S3 client wrapper used in production.
// Tests override this to inject a mock that counts DeleteObject calls.
var newMediaObjectAPI = func(ctx context.Context) (mediaObjectAPI, string, error) {
	client, bucket, err := mediaS3Client(ctx)
	if err != nil {
		return nil, "", err
	}
	return mediaS3APIFromClient(client), bucket, nil
}

type libraryRemovedIndex struct {
	Keys      []string `json:"keys"`
	UpdatedAt string   `json:"updated_at,omitempty"`
}

func libraryRemovedObjectKey(audioPrefix string) string {
	return absoluteMediaKey(path.Join(strings.Trim(audioPrefix, "/"), libraryRemovedObjectName))
}

func normalizeLibraryObjectKey(raw, audioPrefix string) (string, error) {
	key := strings.TrimSpace(raw)
	if key == "" {
		return "", fmt.Errorf("key required")
	}
	if strings.Contains(key, "..") || strings.Contains(key, "\\") {
		return "", fmt.Errorf("invalid key")
	}
	key = strings.TrimPrefix(key, "/")
	abs := absoluteMediaKey(key)
	prefixRoot := absoluteMediaKey(strings.Trim(audioPrefix, "/"))
	if !strings.HasPrefix(abs, prefixRoot+"/") && abs != prefixRoot {
		return "", fmt.Errorf("key outside audio prefix")
	}
	base := path.Base(abs)
	if base == libraryRemovedObjectName || strings.HasPrefix(base, ".") {
		return "", fmt.Errorf("cannot remove index object")
	}
	if !isAudioContentType(contentTypeFromKey(abs), abs) {
		return "", fmt.Errorf("audio key required")
	}
	return abs, nil
}

func loadLibraryRemovedIndex(ctx context.Context, api mediaObjectAPI, bucket, audioPrefix string) (libraryRemovedIndex, error) {
	out, err := api.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(libraryRemovedObjectKey(audioPrefix)),
	})
	if err != nil {
		// Missing sidecar → empty tombstone set (normal for a fresh library).
		msg := strings.ToLower(err.Error())
		if strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "not found") || strings.Contains(msg, "404") {
			return libraryRemovedIndex{Keys: []string{}}, nil
		}
		return libraryRemovedIndex{}, err
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(out.Body, 1<<20))
	if err != nil {
		return libraryRemovedIndex{}, err
	}
	var idx libraryRemovedIndex
	if len(bytes.TrimSpace(raw)) == 0 {
		return libraryRemovedIndex{Keys: []string{}}, nil
	}
	if err := json.Unmarshal(raw, &idx); err != nil {
		return libraryRemovedIndex{}, err
	}
	if idx.Keys == nil {
		idx.Keys = []string{}
	}
	return idx, nil
}

func saveLibraryRemovedIndex(ctx context.Context, api mediaObjectAPI, bucket, audioPrefix string, idx libraryRemovedIndex) error {
	idx.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	payload, err := json.Marshal(idx)
	if err != nil {
		return err
	}
	_, err = api.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(libraryRemovedObjectKey(audioPrefix)),
		Body:        bytes.NewReader(payload),
		ContentType: aws.String("application/json"),
	})
	return err
}

func removedKeySet(idx libraryRemovedIndex) map[string]struct{} {
	out := make(map[string]struct{}, len(idx.Keys))
	for _, k := range idx.Keys {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		out[absoluteMediaKey(strings.TrimPrefix(k, "/"))] = struct{}{}
	}
	return out
}

// markLibraryTrackRemoved adds key to the tombstone sidecar. It never calls
// DeleteObject — audio bytes stay in the bucket.
func markLibraryTrackRemoved(ctx context.Context, api mediaObjectAPI, bucket, audioPrefix, objectKey string) error {
	idx, err := loadLibraryRemovedIndex(ctx, api, bucket, audioPrefix)
	if err != nil {
		return err
	}
	set := removedKeySet(idx)
	if _, ok := set[objectKey]; ok {
		return nil
	}
	idx.Keys = append(idx.Keys, objectKey)
	return saveLibraryRemovedIndex(ctx, api, bucket, audioPrefix, idx)
}

// RemoveMediaAudioLibrary permanently hides a track from the library list (admin).
// Soft-delete only: updates .library_removed.json; keeps the S3 audio object.
func (h *Handler) RemoveMediaAudioLibrary(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !auth.IsAdminEmail(email) {
		httpx.WriteError(w, http.StatusForbidden, "admin only")
		return
	}

	var body struct {
		Key    string `json:"key"`
		Prefix string `json:"prefix"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	audioPrefix := strings.TrimSpace(body.Prefix)
	if audioPrefix == "" {
		audioPrefix = httpx.Env("S3_AUDIO_PREFIX", "worship_playlists")
	}
	audioPrefix = strings.Trim(audioPrefix, "/")
	if audioPrefix == "" || strings.Contains(audioPrefix, "..") || strings.Contains(audioPrefix, "\\") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid prefix")
		return
	}

	objectKey, err := normalizeLibraryObjectKey(body.Key, audioPrefix)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	api, bucket, err := newMediaObjectAPI(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] media.audio.library.remove no-s3 user=%s: %v", cid, email, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, "media store unavailable")
		return
	}

	if err := markLibraryTrackRemoved(r.Context(), api, bucket, audioPrefix, objectKey); err != nil {
		log.Printf("[correlation=%s] media.audio.library.remove failed user=%s key=%s: %v", cid, email, objectKey, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not remove library reference")
		return
	}

	log.Printf("[correlation=%s] media.audio.library.remove success user=%s key=%s retained_on_s3=true", cid, email, objectKey)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"removed":        true,
		"key":            objectKey,
		"prefix":         audioPrefix,
		"retained_on_s3": true,
	})
}
