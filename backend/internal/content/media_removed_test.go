package content

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// fakeMediaS3 stores objects in memory and counts DeleteObject calls so
// retention tests can prove soft-delete never destroys audio bytes.
type fakeMediaS3 struct {
	mu          sync.Mutex
	objects     map[string][]byte
	deleteCalls int
}

func newFakeMediaS3() *fakeMediaS3 {
	return &fakeMediaS3{objects: make(map[string][]byte)}
}

func (f *fakeMediaS3) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	data, ok := f.objects[key]
	if !ok {
		return nil, errors.New("NoSuchKey: not found")
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(bytes.NewReader(append([]byte(nil), data...))),
	}, nil
}

func (f *fakeMediaS3) PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	raw, err := io.ReadAll(params.Body)
	if err != nil {
		return nil, err
	}
	f.objects[key] = raw
	return &s3.PutObjectOutput{}, nil
}

func (f *fakeMediaS3) DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleteCalls++
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	delete(f.objects, key)
	return &s3.DeleteObjectOutput{}, nil
}

func (f *fakeMediaS3) deleteCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.deleteCalls
}

func (f *fakeMediaS3) hasObject(key string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.objects[key]
	return ok
}

func TestRemoveMediaAudioLibraryRejectsNonAdmin(t *testing.T) {
	secret := "media-remove-secret"
	token, err := auth.IssueJWT("listener@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, _ := json.Marshal(map[string]string{
		"key": "media/worship_playlists/demo.mp3",
	})
	req := httptest.NewRequest(http.MethodDelete, "/api/media/audio/library", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d want 403 body=%s", rec.Code, rec.Body.String())
	}
	if !containsString(rec.Body.String(), "admin only") {
		t.Fatalf("expected admin only message, got %s", rec.Body.String())
	}
}

func TestRemoveMediaAudioLibraryRequiresAuth(t *testing.T) {
	h := NewHandler("media-remove-secret", nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, _ := json.Marshal(map[string]string{"key": "media/worship_playlists/demo.mp3"})
	req := httptest.NewRequest(http.MethodDelete, "/api/media/audio/library", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401 body=%s", rec.Code, rec.Body.String())
	}
}

func TestRemoveMediaAudioLibraryRetainsS3Object(t *testing.T) {
	t.Setenv("S3_BUCKET", "test-bucket")
	t.Setenv("S3_PREFIX", "media")

	fake := newFakeMediaS3()
	audioKey := "media/worship_playlists/keep-me.mp3"
	fake.objects[audioKey] = []byte("fake-mp3-bytes")

	prev := newMediaObjectAPI
	newMediaObjectAPI = func(ctx context.Context) (mediaObjectAPI, string, error) {
		return fake, "test-bucket", nil
	}
	t.Cleanup(func() { newMediaObjectAPI = prev })

	secret := "media-remove-secret"
	token, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, _ := json.Marshal(map[string]string{
		"key":    audioKey,
		"prefix": "worship_playlists",
	})
	req := httptest.NewRequest(http.MethodDelete, "/api/media/audio/library", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200 body=%s", rec.Code, rec.Body.String())
	}
	if !containsString(rec.Body.String(), `"retained_on_s3":true`) {
		t.Fatalf("expected retained_on_s3 true, got %s", rec.Body.String())
	}
	if fake.deleteCallCount() != 0 {
		t.Fatalf("DeleteObject called %d times; soft-delete must retain audio", fake.deleteCallCount())
	}
	if !fake.hasObject(audioKey) {
		t.Fatal("audio object missing from fake S3 after soft-delete")
	}

	idxKey := libraryRemovedObjectKey("worship_playlists")
	if !fake.hasObject(idxKey) {
		t.Fatalf("expected tombstone sidecar at %s", idxKey)
	}
	var idx libraryRemovedIndex
	if err := json.Unmarshal(fake.objects[idxKey], &idx); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, k := range idx.Keys {
		if k == audioKey {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("tombstone missing key %s in %#v", audioKey, idx.Keys)
	}
}

func TestNormalizeLibraryObjectKeyRejectsTraversal(t *testing.T) {
	_, err := normalizeLibraryObjectKey("../secrets.mp3", "worship_playlists")
	if err == nil {
		t.Fatal("expected error for path traversal")
	}
	_, err = normalizeLibraryObjectKey("media/other/demo.mp3", "worship_playlists")
	if err == nil {
		t.Fatal("expected error for key outside prefix")
	}
	ok, err := normalizeLibraryObjectKey("worship_playlists/demo.mp3", "worship_playlists")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(ok, "worship_playlists/demo.mp3") {
		t.Fatalf("unexpected normalized key %q", ok)
	}
}

func TestRemovedKeySetFiltersList(t *testing.T) {
	set := removedKeySet(libraryRemovedIndex{Keys: []string{"media/worship_playlists/a.mp3", "worship_playlists/b.mp3"}})
	if _, ok := set["media/worship_playlists/a.mp3"]; !ok {
		t.Fatal("expected absolute a.mp3 in set")
	}
	if _, ok := set["media/worship_playlists/b.mp3"]; !ok {
		t.Fatal("expected absolute b.mp3 in set")
	}
}
