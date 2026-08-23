package content

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"strings"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// s3EpamStore wraps a metadata EpamStore and persists the pamphlet JSON body
// in S3 under media/epams/{user}/{id}.epam — same contract as production.
// Dynamo/memory hold list metadata only; without this wrap, Get returns an
// empty document and the editor looks like a failed "download".
type s3EpamStore struct {
	meta   EpamStore
	client *s3.Client
	bucket string
}

func (s *s3EpamStore) BackendName() string {
	return s.meta.BackendName() + "+s3"
}

func (s *s3EpamStore) Save(ctx context.Context, record EpamRecord, correlationID string) (EpamRecord, error) {
	body := record.Body
	// Strip body before metadata write — Dynamo never stores it; memory keeps a copy via record.
	metaIn := record
	if body != nil {
		// Keep body on the in-memory meta path so local/dev still round-trips without S3 reads.
		metaIn.Body = body
	}
	saved, err := s.meta.Save(ctx, metaIn, correlationID)
	if err != nil {
		return saved, err
	}
	if saved.S3Key == "" {
		saved.S3Key = EpamObjectKey(saved.UserID, saved.EpamID)
	}
	if body == nil {
		return saved, nil
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return saved, fmt.Errorf("marshal epam body: %w", err)
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(saved.S3Key),
		Body:        bytes.NewReader(raw),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return saved, fmt.Errorf("s3 put epam %s: %w", saved.S3Key, err)
	}
	saved.ContentSizeBytes = int64(len(raw))
	saved.Body = body
	log.Printf("[correlation=%s] epams.s3.put key=%s bytes=%d", correlationID, saved.S3Key, len(raw))
	// Best-effort: refresh contentSizeBytes in metadata without clearing memory body.
	sizeOnly := saved
	_, _ = s.meta.Save(ctx, sizeOnly, correlationID)
	saved.Body = body
	return saved, nil
}

func (s *s3EpamStore) Get(ctx context.Context, userID, epamID, correlationID string) (EpamRecord, bool, error) {
	rec, ok, err := s.meta.Get(ctx, userID, epamID, correlationID)
	if err != nil || !ok {
		return rec, ok, err
	}
	key := rec.S3Key
	if key == "" {
		key = EpamObjectKey(userID, epamID)
		rec.S3Key = key
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		// Fall back to in-memory body (memory store / tests) if present.
		if rec.Body != nil {
			log.Printf("[correlation=%s] epams.s3.get miss key=%s; using in-memory body (%v)", correlationID, key, err)
			return rec, true, nil
		}
		return EpamRecord{}, false, fmt.Errorf("could not load epam body from S3 key=%s: %w", key, err)
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(out.Body)
	if err != nil {
		return EpamRecord{}, false, fmt.Errorf("read epam body from S3: %w", err)
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return EpamRecord{}, false, fmt.Errorf("stored epam is not valid JSON (%d bytes): %w", len(raw), err)
	}
	rec.Body = doc
	rec.ContentSizeBytes = int64(len(raw))
	log.Printf("[correlation=%s] epams.s3.get ok key=%s bytes=%d", correlationID, key, len(raw))
	return rec, true, nil
}

func (s *s3EpamStore) ListByUser(ctx context.Context, userID, correlationID string) ([]EpamRecord, error) {
	return s.meta.ListByUser(ctx, userID, correlationID)
}

// Delete moves the S3 body into recycle-bin/, then drops list metadata.
// The original object is removed after a successful copy (move semantics).
func (s *s3EpamStore) Delete(ctx context.Context, userID, epamID, correlationID string) error {
	rec, ok, err := s.meta.Get(ctx, userID, epamID, correlationID)
	if err != nil {
		return err
	}
	srcKey := ""
	if ok {
		srcKey = rec.S3Key
	}
	if srcKey == "" {
		srcKey = EpamObjectKey(userID, epamID)
	}
	dstKey := EpamRecycleObjectKey(userID, epamID)
	_, copyErr := s.client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(s.bucket),
		CopySource: aws.String(s.bucket + "/" + srcKey),
		Key:        aws.String(dstKey),
	})
	if copyErr != nil {
		// Still drop metadata if the active object is already gone.
		log.Printf("[correlation=%s] epams.s3.recycle copy failed key=%s → %s: %v", correlationID, srcKey, dstKey, copyErr)
	} else {
		_, _ = s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: aws.String(s.bucket),
			Key:    aws.String(srcKey),
		})
		log.Printf("[correlation=%s] epams.s3.recycle ok %s → %s", correlationID, srcKey, dstKey)
	}
	return s.meta.Delete(ctx, userID, epamID, correlationID)
}

// maybeWrapEpamS3 attaches S3 body storage when S3_BUCKET is set (production cutover).
func maybeWrapEpamS3(ctx context.Context, base EpamStore) EpamStore {
	bucket := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if bucket == "" {
		bucket = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	if bucket == "" {
		log.Printf("epams bodies: metadata-only (set S3_BUCKET to load/save .epam JSON in S3)")
		return base
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("epams S3 bucket=%s but AWS unavailable (%v); keeping %s without S3 bodies", bucket, err, base.BackendName())
		return base
	}
	log.Printf("epams bodies: s3 bucket=%s (meta=%s)", bucket, base.BackendName())
	return &s3EpamStore{
		meta:   base,
		client: s3.NewFromConfig(cfg),
		bucket: bucket,
	}
}
