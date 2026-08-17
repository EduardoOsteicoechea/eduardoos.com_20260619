package homescool

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strings"
	"sync"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// FolderObject is one listed file under a student folder prefix.
type FolderObject struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified,omitempty"`
	URL          string `json:"url,omitempty"`
}

// ObjectSpace creates folder markers and lists objects under a relationship.
// Production uses S3; tests inject MemoryObjectSpace.
type ObjectSpace interface {
	BackendName() string
	EnsureStudentFolders(ctx context.Context, teacherEmail, studentEmail, correlationID string) error
	ListFolder(ctx context.Context, teacherEmail, studentEmail, folder, correlationID string) ([]FolderObject, error)
}

// MemoryObjectSpace records written keys and lists them for unit tests.
type MemoryObjectSpace struct {
	mu   sync.RWMutex
	keys map[string][]byte
}

// NewMemoryObjectSpace constructs an empty in-process object map.
func NewMemoryObjectSpace() *MemoryObjectSpace {
	return &MemoryObjectSpace{keys: map[string][]byte{}}
}

func (m *MemoryObjectSpace) BackendName() string { return "memory" }

func (m *MemoryObjectSpace) EnsureStudentFolders(_ context.Context, teacherEmail, studentEmail, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, folder := range FolderNames {
		key := absoluteMediaKey(KeepObjectKey(teacherEmail, studentEmail, folder))
		m.keys[key] = []byte{}
	}
	return nil
}

func (m *MemoryObjectSpace) ListFolder(_ context.Context, teacherEmail, studentEmail, folder, _ string) ([]FolderObject, error) {
	if !IsValidFolder(folder) {
		return nil, fmt.Errorf("invalid folder")
	}
	prefix := absoluteMediaKey(FolderPrefix(teacherEmail, studentEmail, folder)) + "/"
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]FolderObject, 0)
	for key, body := range m.keys {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		name := strings.TrimPrefix(key, prefix)
		if name == "" || name == ".keep" || strings.HasSuffix(name, "/") {
			continue
		}
		rel := relativeMediaKey(key)
		out = append(out, FolderObject{
			Key:  rel,
			Name: name,
			Size: int64(len(body)),
			URL:  "/api/media/file/" + encodeMediaPath(rel),
		})
	}
	return out, nil
}

// S3ObjectSpace writes markers and lists under the configured media bucket.
type S3ObjectSpace struct {
	client *s3.Client
	bucket string
}

func (s *S3ObjectSpace) BackendName() string { return "s3:" + s.bucket }

func (s *S3ObjectSpace) EnsureStudentFolders(ctx context.Context, teacherEmail, studentEmail, correlationID string) error {
	for _, folder := range FolderNames {
		key := absoluteMediaKey(KeepObjectKey(teacherEmail, studentEmail, folder))
		_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
			Bucket:      aws.String(s.bucket),
			Key:         aws.String(key),
			Body:        bytes.NewReader(nil),
			ContentType: aws.String("application/octet-stream"),
		})
		if err != nil {
			return fmt.Errorf("s3 put keep %s: %w", key, err)
		}
		log.Printf("[correlation=%s] homescool.s3.keep key=%s", correlationID, key)
	}
	return nil
}

func (s *S3ObjectSpace) ListFolder(ctx context.Context, teacherEmail, studentEmail, folder, correlationID string) ([]FolderObject, error) {
	if !IsValidFolder(folder) {
		return nil, fmt.Errorf("invalid folder")
	}
	prefix := absoluteMediaKey(FolderPrefix(teacherEmail, studentEmail, folder))
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, err
	}
	items := make([]FolderObject, 0)
	for _, obj := range out.Contents {
		if obj.Key == nil {
			continue
		}
		key := *obj.Key
		if strings.HasSuffix(key, "/") || strings.HasSuffix(key, "/.keep") {
			continue
		}
		rel := relativeMediaKey(key)
		name := strings.TrimPrefix(key, prefix)
		item := FolderObject{
			Key:  rel,
			Name: name,
			URL:  "/api/media/file/" + encodeMediaPath(rel),
		}
		if obj.Size != nil {
			item.Size = *obj.Size
		}
		if obj.LastModified != nil {
			item.LastModified = obj.LastModified.UTC().Format("2006-01-02T15:04:05Z")
		}
		items = append(items, item)
	}
	log.Printf("[correlation=%s] homescool.s3.list prefix=%s count=%d", correlationID, prefix, len(items))
	return items, nil
}

func mediaBucket() string {
	b := strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	if b == "" {
		b = strings.TrimSpace(httpx.Env("EPAMS_S3_BUCKET", ""))
	}
	return b
}

func mediaPrefix() string {
	p := strings.TrimSpace(httpx.Env("S3_PREFIX", "media"))
	return strings.Trim(p, "/")
}

func absoluteMediaKey(relative string) string {
	rel := strings.TrimPrefix(strings.TrimSpace(relative), "/")
	prefix := mediaPrefix()
	if prefix == "" {
		return rel
	}
	if strings.HasPrefix(rel, prefix+"/") {
		return rel
	}
	return prefix + "/" + rel
}

func relativeMediaKey(objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	prefix := mediaPrefix()
	if prefix == "" {
		return objectKey
	}
	return strings.TrimPrefix(objectKey, prefix+"/")
}

func encodeMediaPath(key string) string {
	parts := strings.Split(key, "/")
	for i, part := range parts {
		parts[i] = strings.ReplaceAll(part, " ", "%20")
		// Keep parity with content.encodeMediaPath via PathEscape semantics for @ etc.
		parts[i] = pathEscapeSegment(parts[i])
	}
	return strings.Join(parts, "/")
}

func pathEscapeSegment(s string) string {
	replacer := strings.NewReplacer(
		"@", "%40",
		"+", "%2B",
		"#", "%23",
		"?", "%3F",
		"&", "%26",
	)
	return replacer.Replace(s)
}

// OpenObjectSpace returns S3 when a bucket is configured and AWS creds work;
// otherwise a memory space so local/dev registration still scaffolds folders.
func OpenObjectSpace(ctx context.Context) ObjectSpace {
	bucket := mediaBucket()
	if bucket == "" {
		log.Printf("homescool objects: memory (set S3_BUCKET for real prefixes)")
		return NewMemoryObjectSpace()
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("homescool objects: memory fallback (aws unavailable: %v)", err)
		return NewMemoryObjectSpace()
	}
	log.Printf("homescool objects: s3 bucket=%s", bucket)
	return &S3ObjectSpace{client: s3.NewFromConfig(cfg), bucket: bucket}
}
