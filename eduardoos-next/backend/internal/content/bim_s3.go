package content

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"strings"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// s3BIMStore wraps a metadata BIMStore and persists IFC bytes in S3
// under the ifcbim/ prefix when IFCBIM_S3_BUCKET is configured.
type s3BIMStore struct {
	meta   BIMStore
	client *s3.Client
	bucket string
}

func (s *s3BIMStore) BackendName() string {
	return s.meta.BackendName() + "+s3"
}

func (s *s3BIMStore) Save(ctx context.Context, record IfcBimRecord, file []byte, correlationID string) (IfcBimRecord, error) {
	payload := file
	if len(payload) == 0 {
		payload = []byte("ISO-10303-21;\n/* eduardoos-next s3 placeholder IFC */\nEND-ISO-10303-21;\n")
	}
	record.ContentSizeBytes = int64(len(payload))
	saved, err := s.meta.Save(ctx, record, payload, correlationID)
	if err != nil {
		return saved, err
	}
	if saved.S3Key == "" {
		saved.S3Key = IfcBimObjectKey(saved.UserID, saved.ModelID)
	}
	ctype := saved.ContentType
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(saved.S3Key),
		Body:        bytes.NewReader(payload),
		ContentType: aws.String(ctype),
	})
	if err != nil {
		return saved, fmt.Errorf("s3 put %s: %w", saved.S3Key, err)
	}
	saved.ContentSizeBytes = int64(len(payload))
	return saved, nil
}

func (s *s3BIMStore) Get(ctx context.Context, userID, modelID, correlationID string) (IfcBimRecord, bool, error) {
	return s.meta.Get(ctx, userID, modelID, correlationID)
}

func (s *s3BIMStore) ListByUser(ctx context.Context, userID, correlationID string) ([]IfcBimRecord, error) {
	return s.meta.ListByUser(ctx, userID, correlationID)
}

func (s *s3BIMStore) GetFile(ctx context.Context, userID, modelID string) ([]byte, bool, error) {
	rec, ok, err := s.meta.Get(ctx, userID, modelID, "")
	if err != nil {
		return nil, false, err
	}
	key := ""
	if ok && rec.S3Key != "" {
		key = rec.S3Key
	} else {
		key = IfcBimObjectKey(userID, modelID)
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, false, err
	}
	defer out.Body.Close()
	b, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, false, err
	}
	return b, true, nil
}

// maybeWrapS3 attaches S3 file storage when IFCBIM_S3_BUCKET (or S3_BUCKET) is set.
func maybeWrapS3(ctx context.Context, base BIMStore) BIMStore {
	bucket := strings.TrimSpace(httpx.Env("IFCBIM_S3_BUCKET", ""))
	if bucket == "" {
		bucket = strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	}
	if bucket == "" {
		log.Printf("ifcbim files: memory/placeholder path (set IFCBIM_S3_BUCKET for S3-backed IFC bytes)")
		return base
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("ifcbim S3 bucket=%s but AWS unavailable (%v); keeping %s file path", bucket, err, base.BackendName())
		return base
	}
	log.Printf("ifcbim files: s3 bucket=%s (meta=%s)", bucket, base.BackendName())
	return &s3BIMStore{
		meta:   base,
		client: s3.NewFromConfig(cfg),
		bucket: bucket,
	}
}
