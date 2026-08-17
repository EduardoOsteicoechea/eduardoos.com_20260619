package church

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"path"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ObjectSpace reads/writes Church hierarchy objects under church/.
type ObjectSpace interface {
	BackendName() string
	PutJSON(ctx context.Context, key string, value any, correlationID string) error
	GetJSON(ctx context.Context, key string, dest any, correlationID string) (bool, error)
	PutBytes(ctx context.Context, key string, body []byte, contentType, correlationID string) error
	GetBytes(ctx context.Context, key, correlationID string) ([]byte, string, bool, error)
	ListKeys(ctx context.Context, prefix, correlationID string) ([]string, error)
	DeleteKey(ctx context.Context, key, correlationID string) error
}

// MemoryObjectSpace is an in-process map for unit tests.
type MemoryObjectSpace struct {
	mu      sync.RWMutex
	objects map[string]memObj
}

type memObj struct {
	body        []byte
	contentType string
}

// NewMemoryObjectSpace constructs an empty object map.
func NewMemoryObjectSpace() *MemoryObjectSpace {
	return &MemoryObjectSpace{objects: map[string]memObj{}}
}

func (m *MemoryObjectSpace) BackendName() string { return "memory" }

func (m *MemoryObjectSpace) PutJSON(_ context.Context, key string, value any, _ string) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return m.PutBytes(context.Background(), key, raw, "application/json", "")
}

func (m *MemoryObjectSpace) GetJSON(ctx context.Context, key string, dest any, cid string) (bool, error) {
	body, _, ok, err := m.GetBytes(ctx, key, cid)
	if err != nil || !ok {
		return ok, err
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (m *MemoryObjectSpace) PutBytes(_ context.Context, key string, body []byte, contentType, _ string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	cp := make([]byte, len(body))
	copy(cp, body)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = memObj{body: cp, contentType: contentType}
	return nil
}

func (m *MemoryObjectSpace) GetBytes(_ context.Context, key, _ string) ([]byte, string, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	obj, ok := m.objects[key]
	if !ok {
		return nil, "", false, nil
	}
	cp := make([]byte, len(obj.body))
	copy(cp, obj.body)
	return cp, obj.contentType, true, nil
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

// S3ObjectSpace stores Church objects in the configured media bucket.
type S3ObjectSpace struct {
	client *s3.Client
	bucket string
}

func (s *S3ObjectSpace) BackendName() string { return "s3:" + s.bucket }

func (s *S3ObjectSpace) PutJSON(ctx context.Context, key string, value any, cid string) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return s.PutBytes(ctx, key, raw, "application/json", cid)
}

func (s *S3ObjectSpace) GetJSON(ctx context.Context, key string, dest any, cid string) (bool, error) {
	body, _, ok, err := s.GetBytes(ctx, key, cid)
	if err != nil || !ok {
		return ok, err
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (s *S3ObjectSpace) PutBytes(ctx context.Context, key string, body []byte, contentType, cid string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return err
	}
	log.Printf("[correlation=%s] church.s3.put key=%s bytes=%d", cid, key, len(body))
	return nil
}

func (s *S3ObjectSpace) GetBytes(ctx context.Context, key, cid string) ([]byte, string, bool, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, "", false, nil
		}
		return nil, "", false, err
	}
	defer out.Body.Close()
	body, err := io.ReadAll(io.LimitReader(out.Body, 8<<20))
	if err != nil {
		return nil, "", false, err
	}
	ct := "application/octet-stream"
	if out.ContentType != nil && *out.ContentType != "" {
		ct = *out.ContentType
	}
	log.Printf("[correlation=%s] church.s3.get key=%s bytes=%d", cid, key, len(body))
	return body, ct, true, nil
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
	log.Printf("[correlation=%s] church.s3.list prefix=%s count=%d", cid, prefix, len(out))
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
	log.Printf("[correlation=%s] church.s3.delete key=%s", cid, key)
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
		log.Printf("church objects: memory (set S3_BUCKET for real prefixes under %s/)", RootPrefix)
		return NewMemoryObjectSpace()
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("church objects: memory fallback (aws unavailable: %v)", err)
		return NewMemoryObjectSpace()
	}
	log.Printf("church objects: s3 bucket=%s prefix=%s/", bucket, RootPrefix)
	return &S3ObjectSpace{client: s3.NewFromConfig(cfg), bucket: bucket}
}

// OpenCatalogStore selects memory or DynamoDB for church cards.
func OpenCatalogStore(ctx context.Context) CatalogStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("CHURCH_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("church catalog store backend=memory")
		return NewMemoryCatalog()
	}
	store, err := newDynamoCatalog(ctx)
	if err != nil {
		log.Printf("church CHURCH_BACKEND/DATABASE_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
		return NewMemoryCatalog()
	}
	log.Printf("church catalog store backend=dynamodb table=%s", store.table)
	return store
}

// OpenMembershipStore selects memory or DynamoDB for memberships.
func OpenMembershipStore(ctx context.Context) MembershipStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("CHURCH_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("church membership store backend=memory")
		return NewMemoryMemberships()
	}
	store, err := newDynamoMemberships(ctx)
	if err != nil {
		log.Printf("church memberships: dynamodb unavailable (%v); falling back to memory", err)
		return NewMemoryMemberships()
	}
	log.Printf("church membership store backend=dynamodb table=%s", store.table)
	return store
}

// parseActivityIDFromKey extracts the activity id from …/activities/{id}/….
func parseActivityIDFromKey(key string) string {
	marker := "/activities/"
	idx := strings.Index(key, marker)
	if idx < 0 {
		return ""
	}
	rest := key[idx+len(marker):]
	return path.Base(strings.SplitN(rest, "/", 2)[0])
}
