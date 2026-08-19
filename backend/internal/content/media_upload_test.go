package content

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestUploadMediaAudioRejectsNonAdmin(t *testing.T) {
	secret := "media-upload-secret"
	token, err := auth.IssueJWT("listener@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, contentType := multipartAudioBody(t, "demo.webm", []byte("fake-audio-bytes"))
	req := httptest.NewRequest(http.MethodPost, "/api/media/audio/upload", body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d want 403 body=%s", rec.Code, rec.Body.String())
	}
	if !containsString(rec.Body.String(), "admin only") {
		t.Fatalf("expected admin only message, got %s", rec.Body.String())
	}
}

func TestUploadMediaAudioRequiresAuth(t *testing.T) {
	h := NewHandler("media-upload-secret", nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, contentType := multipartAudioBody(t, "demo.webm", []byte("fake-audio-bytes"))
	req := httptest.NewRequest(http.MethodPost, "/api/media/audio/upload", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401 body=%s", rec.Code, rec.Body.String())
	}
}

func TestUploadMediaAudioAdminWithoutS3ReturnsUnavailable(t *testing.T) {
	t.Setenv("S3_BUCKET", "")
	t.Setenv("EPAMS_S3_BUCKET", "")

	secret := "media-upload-secret"
	token, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	body, contentType := multipartAudioBody(t, "demo.webm", []byte("fake-audio-bytes"))
	req := httptest.NewRequest(http.MethodPost, "/api/media/audio/upload", body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 body=%s", rec.Code, rec.Body.String())
	}
}

func TestUploadMediaAudioAdminRejectsMissingFile(t *testing.T) {
	secret := "media-upload-secret"
	token, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, nil, nil)
	r := chi.NewRouter()
	h.Routes(r)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("title", "Sin archivo")
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/media/audio/upload", &buf)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400 body=%s", rec.Code, rec.Body.String())
	}
}

func TestSanitizeWorshipAudioFilename(t *testing.T) {
	name := sanitizeWorshipAudioFilename("raw.bin", "Mi Cancion Nueva", "audio/webm")
	if !containsString(name, "Mi-Cancion-Nueva") {
		t.Fatalf("expected title slug in name, got %q", name)
	}
	if pathExtOf(name) != ".webm" {
		t.Fatalf("expected .webm, got %q", name)
	}

	plain := sanitizeWorshipAudioFilename("demo.mp3", "", "audio/mpeg")
	if pathExtOf(plain) != ".mp3" {
		t.Fatalf("expected .mp3, got %q", plain)
	}
	if !containsString(plain, "demo-") {
		t.Fatalf("expected demo prefix, got %q", plain)
	}
}

func pathExtOf(name string) string {
	for i := len(name) - 1; i >= 0; i-- {
		if name[i] == '.' {
			return name[i:]
		}
	}
	return ""
}

func multipartAudioBody(t *testing.T, filename string, payload []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, w.FormDataContentType()
}
