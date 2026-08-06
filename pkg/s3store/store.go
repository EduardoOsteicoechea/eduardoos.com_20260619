package s3store

import (
	"context"
	"fmt"
	"strings"
)

type UploadResult struct {
	Bucket      string `json:"bucket"`
	Key         string `json:"key"`
	ContentType string `json:"content_type"`
	URL         string `json:"url,omitempty"`
	Stored      bool   `json:"stored"`
}

type ObjectMeta struct {
	Key          string `json:"key"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	LastModified string `json:"last_modified,omitempty"`
}

type MediaStore interface {
	Put(ctx context.Context, key, contentType string, data []byte) (UploadResult, error)
	Get(ctx context.Context, key string) ([]byte, string, error)
	List(ctx context.Context, prefix string) ([]ObjectMeta, error)
	PutAbsolute(ctx context.Context, objectKey, contentType string, data []byte) (UploadResult, error)
	GetAbsolute(ctx context.Context, objectKey string) ([]byte, string, error)
	BackendName() string
	BucketName() string
}

type Config struct {
	Backend     string
	Bucket      string
	Prefix      string
	Region      string
	StubDataDir string
}

func ObjectKey(prefix, key string) string {
	key = strings.TrimPrefix(strings.TrimSpace(key), "/")
	if key == "" {
		return ""
	}
	if prefix == "" {
		return key
	}
	return strings.TrimSuffix(prefix, "/") + "/" + key
}

func PublicURL(baseURL, objectKey string) string {
	if baseURL == "" {
		return ""
	}
	return strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(objectKey, "/")
}

func NewStore(ctx context.Context, cfg Config) (MediaStore, error) {
	if cfg.Backend == "aws" {
		return newAWSStore(ctx, cfg)
	}
	return newStubStore(cfg), nil
}

func ValidateKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("key required")
	}
	if hasPathTraversal(key) {
		return fmt.Errorf("invalid key")
	}
	return nil
}
