package s3store

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

type stubObject struct {
	data         []byte
	contentType  string
	lastModified time.Time
}

type stubStore struct {
	mu      sync.RWMutex
	bucket  string
	prefix  string
	dataDir string
	objs    map[string]stubObject
}

func newStubStore(cfg Config) *stubStore {
	s := &stubStore{
		bucket:  cfg.Bucket,
		prefix:  cfg.Prefix,
		dataDir: cfg.StubDataDir,
		objs:    map[string]stubObject{},
	}
	s.loadFromDisk()
	return s
}

func (s *stubStore) BackendName() string { return "stub" }
func (s *stubStore) BucketName() string  { return s.bucket }

func (s *stubStore) PutAbsolute(_ context.Context, objectKey, contentType string, data []byte) (UploadResult, error) {
	if err := ValidateAbsoluteKey(objectKey); err != nil {
		return UploadResult{}, err
	}
	now := time.Now().UTC()
	s.mu.Lock()
	s.objs[objectKey] = stubObject{
		data:         append([]byte(nil), data...),
		contentType:  contentType,
		lastModified: now,
	}
	s.saveToDisk()
	s.mu.Unlock()
	return UploadResult{
		Bucket: s.bucket, Key: objectKey, ContentType: contentType, Stored: true,
	}, nil
}

func (s *stubStore) GetAbsolute(_ context.Context, objectKey string) ([]byte, string, error) {
	if err := ValidateAbsoluteKey(objectKey); err != nil {
		return nil, "", err
	}
	s.mu.RLock()
	obj, ok := s.objs[objectKey]
	s.mu.RUnlock()
	if !ok {
		return nil, "", fmt.Errorf("not found")
	}
	return append([]byte(nil), obj.data...), obj.contentType, nil
}

func (s *stubStore) Put(_ context.Context, key, contentType string, data []byte) (UploadResult, error) {
	if err := ValidateKey(key); err != nil {
		return UploadResult{}, err
	}
	objectKey := ObjectKey(s.prefix, key)
	now := time.Now().UTC()
	s.mu.Lock()
	s.objs[objectKey] = stubObject{
		data:         append([]byte(nil), data...),
		contentType:  contentType,
		lastModified: now,
	}
	s.saveToDisk()
	s.mu.Unlock()
	return UploadResult{
		Bucket: s.bucket, Key: objectKey, ContentType: contentType, Stored: true,
	}, nil
}

func (s *stubStore) Get(_ context.Context, key string) ([]byte, string, error) {
	objectKey := ObjectKey(s.prefix, key)
	s.mu.RLock()
	obj, ok := s.objs[objectKey]
	s.mu.RUnlock()
	if !ok {
		return nil, "", fmt.Errorf("not found")
	}
	return append([]byte(nil), obj.data...), obj.contentType, nil
}

func (s *stubStore) List(_ context.Context, prefix string) ([]ObjectMeta, error) {
	search := ObjectKey(s.prefix, prefix)
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []ObjectMeta
	for k, obj := range s.objs {
		if prefix == "" || strings.HasPrefix(k, search) {
			out = append(out, ObjectMeta{
				Key:          k,
				ContentType:  obj.contentType,
				Size:         len(obj.data),
				LastModified: obj.lastModified.Format(time.RFC3339),
			})
		}
	}
	return out, nil
}
