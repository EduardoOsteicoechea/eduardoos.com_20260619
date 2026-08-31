package evoice

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ObjectInfo is a listed object with size and last-modified.
type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

// ObjectSpace reads/writes binary + folder markers under evoice/.
type ObjectSpace interface {
	BackendName() string
	PutBytes(ctx context.Context, key string, body []byte, contentType, correlationID string) error
	GetBytes(ctx context.Context, key, correlationID string) ([]byte, bool, error)
	OpenStream(ctx context.Context, key, rangeHeader, correlationID string) (body io.ReadCloser, contentType string, contentLength int64, contentRange string, err error)
	ListObjects(ctx context.Context, prefix, correlationID string) ([]ObjectInfo, error)
	ListPrefixes(ctx context.Context, prefix, correlationID string) ([]string, error)
	DeleteKey(ctx context.Context, key, correlationID string) error
}

// MemoryObjectSpace is an in-process map for unit tests.
type MemoryObjectSpace struct {
	mu      sync.RWMutex
	objects map[string][]byte
	times   map[string]time.Time
}

// NewMemoryObjectSpace constructs an empty object map.
func NewMemoryObjectSpace() *MemoryObjectSpace {
	return &MemoryObjectSpace{
		objects: map[string][]byte{},
		times:   map[string]time.Time{},
	}
}

func (m *MemoryObjectSpace) BackendName() string { return "memory" }

func (m *MemoryObjectSpace) PutBytes(_ context.Context, key string, body []byte, _, _ string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	cp := make([]byte, len(body))
	copy(cp, body)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = cp
	m.times[key] = time.Now().UTC()
	return nil
}

func (m *MemoryObjectSpace) GetBytes(_ context.Context, key, _ string) ([]byte, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	body, ok := m.objects[key]
	if !ok {
		return nil, false, nil
	}
	cp := make([]byte, len(body))
	copy(cp, body)
	return cp, true, nil
}

func (m *MemoryObjectSpace) OpenStream(_ context.Context, key, _, _ string) (io.ReadCloser, string, int64, string, error) {
	m.mu.RLock()
	body, ok := m.objects[key]
	m.mu.RUnlock()
	if !ok {
		return nil, "", 0, "", fmt.Errorf("not found")
	}
	cp := make([]byte, len(body))
	copy(cp, body)
	return io.NopCloser(bytes.NewReader(cp)), contentTypeForKey(key), int64(len(cp)), "", nil
}

func (m *MemoryObjectSpace) ListObjects(_ context.Context, prefix, _ string) ([]ObjectInfo, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]ObjectInfo, 0)
	for key, body := range m.objects {
		if strings.HasPrefix(key, prefix) {
			out = append(out, ObjectInfo{Key: key, Size: int64(len(body)), LastModified: m.times[key]})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

func (m *MemoryObjectSpace) ListPrefixes(_ context.Context, prefix, _ string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	seen := map[string]bool{}
	for key := range m.objects {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		rest := strings.TrimPrefix(key, prefix)
		seg, _, _ := strings.Cut(rest, "/")
		if seg == "" || seg == ".keep" {
			continue
		}
		seen[seg] = true
	}
	out := make([]string, 0, len(seen))
	for s := range seen {
		out = append(out, s)
	}
	sort.Strings(out)
	return out, nil
}

func (m *MemoryObjectSpace) DeleteKey(_ context.Context, key, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	delete(m.times, key)
	return nil
}

// S3ObjectSpace stores evoice binaries in the configured media bucket.
type S3ObjectSpace struct {
	client *s3.Client
	bucket string
}

func (s *S3ObjectSpace) BackendName() string { return "s3:" + s.bucket }

func (s *S3ObjectSpace) PutBytes(ctx context.Context, key string, body []byte, contentType, cid string) error {
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	if contentType == "" {
		contentType = contentTypeForKey(key)
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
	log.Printf("[correlation=%s] evoice.s3.put key=%s bytes=%d", cid, key, len(body))
	return nil
}

func (s *S3ObjectSpace) GetBytes(ctx context.Context, key, cid string) ([]byte, bool, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		if isNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	defer out.Body.Close()
	body, err := io.ReadAll(io.LimitReader(out.Body, 64<<20))
	if err != nil {
		return nil, false, err
	}
	log.Printf("[correlation=%s] evoice.s3.get key=%s bytes=%d", cid, key, len(body))
	return body, true, nil
}

func (s *S3ObjectSpace) OpenStream(ctx context.Context, key, rangeHeader, cid string) (io.ReadCloser, string, int64, string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}
	if strings.TrimSpace(rangeHeader) != "" {
		input.Range = aws.String(rangeHeader)
	}
	out, err := s.client.GetObject(ctx, input)
	if err != nil {
		return nil, "", 0, "", err
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	if ct == "" || ct == "application/octet-stream" || ct == "binary/octet-stream" {
		ct = contentTypeForKey(key)
	}
	var length int64
	if out.ContentLength != nil {
		length = *out.ContentLength
	}
	cr := ""
	if out.ContentRange != nil {
		cr = *out.ContentRange
	}
	log.Printf("[correlation=%s] evoice.s3.stream key=%s range=%q", cid, key, rangeHeader)
	return out.Body, ct, length, cr, nil
}

func (s *S3ObjectSpace) ListObjects(ctx context.Context, prefix, cid string) ([]ObjectInfo, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	out := make([]ObjectInfo, 0)
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
			if obj.Key == nil || *obj.Key == "" {
				continue
			}
			info := ObjectInfo{Key: *obj.Key}
			if obj.Size != nil {
				info.Size = *obj.Size
			}
			if obj.LastModified != nil {
				info.LastModified = *obj.LastModified
			}
			out = append(out, info)
		}
		if resp.IsTruncated == nil || !*resp.IsTruncated {
			break
		}
		token = resp.NextContinuationToken
	}
	log.Printf("[correlation=%s] evoice.s3.list prefix=%s count=%d", cid, prefix, len(out))
	return out, nil
}

func (s *S3ObjectSpace) ListPrefixes(ctx context.Context, prefix, cid string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	seen := map[string]bool{}
	var token *string
	for {
		resp, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(s.bucket),
			Prefix:            aws.String(prefix),
			Delimiter:         aws.String("/"),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, p := range resp.CommonPrefixes {
			if p.Prefix == nil {
				continue
			}
			rest := strings.TrimPrefix(*p.Prefix, prefix)
			rest = strings.TrimSuffix(rest, "/")
			if rest == "" || rest == ".keep" {
				continue
			}
			seen[rest] = true
		}
		if resp.IsTruncated == nil || !*resp.IsTruncated {
			break
		}
		token = resp.NextContinuationToken
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	log.Printf("[correlation=%s] evoice.s3.prefixes prefix=%s count=%d", cid, prefix, len(out))
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
	log.Printf("[correlation=%s] evoice.s3.delete key=%s", cid, key)
	return nil
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	var nsk *types.NoSuchKey
	if ok := errorAs(err, &nsk); ok {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "not found") || strings.Contains(msg, "404")
}

func errorAs(err error, target **types.NoSuchKey) bool {
	if err == nil {
		return false
	}
	// Avoid importing errors.As dance for optional SDK type — string match is enough.
	_ = target
	return false
}

func contentTypeForKey(key string) string {
	lower := strings.ToLower(key)
	switch {
	case strings.HasSuffix(lower, ".mp3"):
		return "audio/mpeg"
	case strings.HasSuffix(lower, ".txt"):
		return "text/plain; charset=utf-8"
	case strings.HasSuffix(lower, ".pdf"):
		return "application/pdf"
	case strings.HasSuffix(lower, ".docx"):
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		return "image/gif"
	default:
		return "application/octet-stream"
	}
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
		log.Printf("evoice objects: memory (set S3_BUCKET for real prefixes under %s/)", RootPrefix)
		return NewMemoryObjectSpace()
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("evoice objects: memory fallback (aws unavailable: %v)", err)
		return NewMemoryObjectSpace()
	}
	log.Printf("evoice objects: s3 bucket=%s prefix=%s/", bucket, RootPrefix)
	return &S3ObjectSpace{client: s3.NewFromConfig(cfg), bucket: bucket}
}
