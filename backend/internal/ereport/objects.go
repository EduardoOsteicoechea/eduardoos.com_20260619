package ereport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ObjectSpace reads/writes eReport JSON objects under ereport/.
type ObjectSpace interface {
	BackendName() string
	PutJSON(ctx context.Context, key string, value any, correlationID string) error
	GetJSON(ctx context.Context, key string, dest any, correlationID string) (bool, error)
	ListKeys(ctx context.Context, prefix, correlationID string) ([]string, error)
	DeleteKey(ctx context.Context, key, correlationID string) error
}

// MemoryObjectSpace is an in-process map for unit tests.
type MemoryObjectSpace struct {
	mu      sync.RWMutex
	objects map[string][]byte
}

// NewMemoryObjectSpace constructs an empty object map.
func NewMemoryObjectSpace() *MemoryObjectSpace {
	return &MemoryObjectSpace{objects: map[string][]byte{}}
}

func (m *MemoryObjectSpace) BackendName() string { return "memory" }

func (m *MemoryObjectSpace) PutJSON(_ context.Context, key string, value any, _ string) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	cp := make([]byte, len(raw))
	copy(cp, raw)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = cp
	return nil
}

func (m *MemoryObjectSpace) GetJSON(_ context.Context, key string, dest any, _ string) (bool, error) {
	m.mu.RLock()
	body, ok := m.objects[key]
	m.mu.RUnlock()
	if !ok {
		return false, nil
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (m *MemoryObjectSpace) ListKeys(_ context.Context, prefix, _ string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]string, 0)
	for key := range m.objects {
		if strings.HasPrefix(key, prefix) || key == strings.TrimSuffix(prefix, "/") {
			out = append(out, key)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (m *MemoryObjectSpace) DeleteKey(_ context.Context, key, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

// S3ObjectSpace stores ereport objects in the configured media bucket.
type S3ObjectSpace struct {
	client *s3.Client
	bucket string
}

func (s *S3ObjectSpace) BackendName() string { return "s3:" + s.bucket }

func (s *S3ObjectSpace) PutJSON(ctx context.Context, key string, value any, cid string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(raw),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return err
	}
	log.Printf("[correlation=%s] ereport.s3.put key=%s bytes=%d", cid, key, len(raw))
	return nil
}

func (s *S3ObjectSpace) GetJSON(ctx context.Context, key string, dest any, cid string) (bool, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return false, nil
		}
		return false, err
	}
	defer out.Body.Close()
	body, err := io.ReadAll(io.LimitReader(out.Body, 32<<20))
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	log.Printf("[correlation=%s] ereport.s3.get key=%s bytes=%d", cid, key, len(body))
	return true, nil
}

func (s *S3ObjectSpace) ListKeys(ctx context.Context, prefix, cid string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	out := make([]string, 0)
	var token *string
	for {
		resp, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(s.bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, obj := range resp.Contents {
			if obj.Key != nil && *obj.Key != "" {
				out = append(out, *obj.Key)
			}
		}
		if resp.IsTruncated == nil || !*resp.IsTruncated {
			break
		}
		token = resp.NextContinuationToken
	}
	log.Printf("[correlation=%s] ereport.s3.list prefix=%s count=%d", cid, prefix, len(out))
	return out, nil
}

func (s *S3ObjectSpace) DeleteKey(ctx context.Context, key, cid string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return err
	}
	log.Printf("[correlation=%s] ereport.s3.delete key=%s", cid, key)
	return nil
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "not found") || strings.Contains(msg, "404")
}

func mediaBucket() string {
	b := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if b == "" {
		b = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	return b
}

// OpenObjectSpace returns S3 when configured; otherwise memory.
func OpenObjectSpace(ctx context.Context) ObjectSpace {
	bucket := mediaBucket()
	if bucket == "" {
		log.Printf("ereport objects: memory (set S3_BUCKET for real prefixes under %s/)", RootPrefix)
		return NewMemoryObjectSpace()
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("ereport objects: memory fallback (aws unavailable: %v)", err)
		return NewMemoryObjectSpace()
	}
	log.Printf("ereport objects: s3 bucket=%s prefix=%s/", bucket, RootPrefix)
	return &S3ObjectSpace{client: s3.NewFromConfig(cfg), bucket: bucket}
}
