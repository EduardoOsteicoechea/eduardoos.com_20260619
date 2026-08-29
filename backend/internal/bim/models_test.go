package bim

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/go-chi/chi/v5"
)

func TestSanitizeLibraryName(t *testing.T) {
	got := sanitizeLibraryName("My Model (1)")
	if got != "My-Model-1.ifc" {
		t.Fatalf("got %q", got)
	}
	if sanitizeLibraryName("a") != "" {
		t.Fatal("single char should be invalid")
	}
	if sanitizeLibraryName("topo001") != "topo001.ifc" {
		t.Fatalf("topo001 → %q", sanitizeLibraryName("topo001"))
	}
	if sanitizeLibraryName("../bad") != "" && stringsHasDotDot(sanitizeLibraryName("../bad")) {
		t.Fatal("path escape")
	}
}

func stringsHasDotDot(s string) bool {
	return len(s) >= 2 && (s == ".." || len(s) > 2 && (s[:2] == ".." || s[len(s)-2:] == ".."))
}

func TestSanitizeIfcFilenameFallback(t *testing.T) {
	got := sanitizeIfcFilename("My Model (1).IFC")
	if got[len(got)-4:] != ".ifc" {
		t.Fatalf("sanitize=%q", got)
	}
}

func TestEnsureKeyUnderLibrary(t *testing.T) {
	key, ok := ensureKeyUnderLibrary("topo001.ifc")
	if !ok || key != "ifcbim/library/topo001.ifc" {
		t.Fatalf("basename: key=%q ok=%v", key, ok)
	}
	key, ok = ensureKeyUnderLibrary("ifcbim/library/a.ifc")
	if !ok || key != "ifcbim/library/a.ifc" {
		t.Fatalf("full: key=%q ok=%v", key, ok)
	}
	if _, ok := ensureKeyUnderLibrary("../etc/passwd.ifc"); ok {
		t.Fatal("expected reject ..")
	}
	if _, ok := ensureKeyUnderLibrary("ifcbim/other/a.ifc"); ok {
		t.Fatal("expected reject outside library")
	}
}

// memS3 is a tiny in-memory S3 stub for library delete tests.
type memS3 struct {
	mu   sync.Mutex
	objs map[string][]byte
}

func newMemS3(seed map[string][]byte) *memS3 {
	m := &memS3{objs: map[string][]byte{}}
	for k, v := range seed {
		m.objs[k] = append([]byte(nil), v...)
	}
	return m
}

func (m *memS3) ListObjectsV2(ctx context.Context, params *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	prefix := ""
	if params.Prefix != nil {
		prefix = *params.Prefix
	}
	out := &s3.ListObjectsV2Output{}
	for k, v := range m.objs {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		key, size := k, int64(len(v))
		out.Contents = append(out.Contents, types.Object{Key: &key, Size: &size})
	}
	return out, nil
}

func (m *memS3) GetObject(ctx context.Context, params *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return nil, errors.New("not implemented")
}

func (m *memS3) PutObject(ctx context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	return nil, errors.New("not implemented")
}

func (m *memS3) HeadObject(ctx context.Context, params *s3.HeadObjectInput, _ ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	if _, ok := m.objs[key]; !ok {
		return nil, errors.New("NotFound: status code: 404")
	}
	return &s3.HeadObjectOutput{}, nil
}

func (m *memS3) DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	delete(m.objs, key)
	return &s3.DeleteObjectOutput{}, nil
}

func TestDeleteModelAdminOK(t *testing.T) {
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	mem := newMemS3(map[string][]byte{
		"ifcbim/library/demo.ifc": []byte("ISO-10303-21;"),
	})
	h := NewHandler("test-secret", store)
	h.S3 = mem
	h.Bucket = "test-bucket"

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodDelete, "/api/bim/models/file/demo.ifc", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["deleted"] != true {
		t.Fatalf("resp=%v", resp)
	}
	mem.mu.Lock()
	_, still := mem.objs["ifcbim/library/demo.ifc"]
	mem.mu.Unlock()
	if still {
		t.Fatal("object still present")
	}
}

func TestDeleteModelForbiddenForUser(t *testing.T) {
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        "user@test.local",
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleUser,
		CreatedAt:    auth.NowRFC3339(),
	})
	mem := newMemS3(map[string][]byte{
		"ifcbim/library/demo.ifc": []byte("ISO-10303-21;"),
	})
	h := NewHandler("test-secret", store)
	h.S3 = mem
	h.Bucket = "test-bucket"

	token, err := auth.IssueJWT("user@test.local", "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodDelete, "/api/bim/models/file/demo.ifc", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestDeleteModelNotFound(t *testing.T) {
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	h := NewHandler("test-secret", store)
	h.S3 = newMemS3(nil)
	h.Bucket = "test-bucket"

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodDelete, "/api/bim/models/file/missing.ifc", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}
