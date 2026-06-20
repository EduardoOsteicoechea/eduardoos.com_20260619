// Package s3store — media object storage (in-memory stub or AWS S3).
package s3store

import (
	"context"
	"fmt"
	"strings"
)

// UploadResult is returned after a successful put.
type UploadResult struct {
	Bucket      string `json:"bucket"`
	Key         string `json:"key"`
	ContentType string `json:"content_type"`
	URL         string `json:"url,omitempty"`
	Stored      bool   `json:"stored"`
}

// ObjectMeta describes a stored object for listing.
type ObjectMeta struct {
	Key          string `json:"key"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	LastModified string `json:"last_modified,omitempty"`
}

// MediaStore persists binary media objects.
type MediaStore interface {
	Put(ctx context.Context, key, contentType string, data []byte) (UploadResult, error)
	Get(ctx context.Context, key string) ([]byte, string, error)
	List(ctx context.Context, prefix string) ([]ObjectMeta, error)
	BackendName() string
	BucketName() string
}

// Config drives store construction.
type Config struct {
	Backend string
	Bucket  string
	Prefix  string
	Region  string
}

// ObjectKey applies the configured prefix to a relative media key.
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

// PublicURL builds a browser-facing URL when a CDN/base is configured.
func PublicURL(baseURL, objectKey string) string {
	if baseURL == "" {
		return ""
	}
	return strings.TrimSuffix(baseURL, "/") + "/" + strings.TrimPrefix(objectKey, "/")
}

// NewStore selects stub or AWS implementation from config.
func NewStore(ctx context.Context, cfg Config) (MediaStore, error) {
	if cfg.Backend == "aws" {
		return newAWSStore(ctx, cfg)
	}
	return newStubStore(cfg), nil
}

// ValidateKey rejects empty or path-traversal keys.
func ValidateKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("key required")
	}
	if strings.Contains(key, "..") {
		return fmt.Errorf("invalid key")
	}
	return nil
}
