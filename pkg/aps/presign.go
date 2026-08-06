package aps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type PresignResult struct {
	Bucket     string    `json:"bucket"`
	Region     string    `json:"region"`
	ObjectKey  string    `json:"objectKey"`
	URL        string    `json:"url"`
	ExpiresAt  time.Time `json:"expiresAt"`
	TTLSeconds int       `json:"ttlSeconds"`
}

type Presigner struct {
	bucket string
	region string
	ttl    time.Duration
	client *s3.Client
}

func NewPresigner(ctx context.Context, cfg Config) (*Presigner, error) {
	region := cfg.S3Region
	if region == "" {
		region = "us-east-1"
	}
	ttl := cfg.PresignTTL
	if ttl <= 0 {
		ttl = DefaultPresignTTL
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aps s3 aws config: %w", err)
	}
	return &Presigner{
		bucket: cfg.S3Bucket,
		region: region,
		ttl:    ttl,
		client: s3.NewFromConfig(awsCfg),
	}, nil
}

func (p *Presigner) PresignPutObjectURL(ctx context.Context, objectKey string) (PresignResult, error) {
	key := strings.TrimSpace(objectKey)
	if key == "" {
		return PresignResult{}, fmt.Errorf("object key required")
	}
	if strings.HasPrefix(key, "/") {
		return PresignResult{}, fmt.Errorf("object key must not start with /")
	}

	presigner := s3.NewPresignClient(p.client)
	out, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = p.ttl
	})
	if err != nil {
		return PresignResult{}, fmt.Errorf("presign put object: %w", err)
	}

	expiresAt := time.Now().UTC().Add(p.ttl)
	return PresignResult{
		Bucket:     p.bucket,
		Region:     p.region,
		ObjectKey:  key,
		URL:        out.URL,
		ExpiresAt:  expiresAt,
		TTLSeconds: int(p.ttl.Seconds()),
	}, nil
}

func (p *Presigner) PresignGetObjectURL(ctx context.Context, objectKey string) (PresignResult, error) {
	key := strings.TrimSpace(objectKey)
	if key == "" {
		return PresignResult{}, fmt.Errorf("object key required")
	}
	if strings.HasPrefix(key, "/") {
		return PresignResult{}, fmt.Errorf("object key must not start with /")
	}

	presigner := s3.NewPresignClient(p.client)
	out, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = p.ttl
	})
	if err != nil {
		return PresignResult{}, fmt.Errorf("presign get object: %w", err)
	}

	expiresAt := time.Now().UTC().Add(p.ttl)
	return PresignResult{
		Bucket:     p.bucket,
		Region:     p.region,
		ObjectKey:  key,
		URL:        out.URL,
		ExpiresAt:  expiresAt,
		TTLSeconds: int(p.ttl.Seconds()),
	}, nil
}

func (p *Presigner) GetObjectJSON(ctx context.Context, objectKey string) (map[string]any, error) {
	key := strings.TrimSpace(objectKey)
	out, err := p.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(p.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		return map[string]any{"raw": string(data)}, nil
	}
	return decoded, nil
}

func NewOutputObjectKey(prefix, filename string) string {
	base := strings.Trim(strings.TrimSpace(prefix), "/")
	name := strings.TrimSpace(filename)
	if name == "" {
		name = "result.json"
	}
	id := uuid.NewString()
	if base == "" {
		return id + "/" + name
	}
	return base + "/" + id + "/" + name
}
