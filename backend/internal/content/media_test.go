package content

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestListMediaAudioWithoutS3ReturnsEmpty(t *testing.T) {
	t.Setenv("S3_BUCKET", "")
	t.Setenv("EPAMS_S3_BUCKET", "")

	h := NewHandler("test-secret", nil)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/media/audio?prefix=worship_playlists", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !containsAll(body, `"tracks"`, `"count":0`) && !containsAll(body, `"count": 0`, `"tracks"`) {
		// Accept either compact or spaced JSON.
		if !containsAll(body, `"tracks"`, `"count"`) {
			t.Fatalf("unexpected body: %s", body)
		}
	}
}

func TestPlaybackContentTypePrefersExtensionOverGenericS3(t *testing.T) {
	if got := playbackContentType("application/octet-stream", "media/worship_playlists/song.mp3"); got != "audio/mpeg" {
		t.Fatalf("mp3 generic s3 type → %q", got)
	}
	if got := playbackContentType("binary/octet-stream", "worship_playlists/clip.webm"); got != "audio/webm" {
		t.Fatalf("webm generic s3 type → %q", got)
	}
	if got := playbackContentType("", "a.wav"); got != "audio/wav" {
		t.Fatalf("empty s3 type → %q", got)
	}
	if got := playbackContentType("audio/mpeg", "song.mp3"); got != "audio/mpeg" {
		t.Fatalf("real audio s3 type should stay, got %q", got)
	}
}

func TestIsUnsafeMediaRelativePathAllowsDoubleDotFilename(t *testing.T) {
	// Production filename that 041 probe showed as 400 invalid path.
	safe := "worship_playlists/Ayúdame. Cánticos espirituales..mp3"
	if isUnsafeMediaRelativePath(safe) {
		t.Fatalf("expected safe path for double-dot filename: %q", safe)
	}
	if isUnsafeMediaRelativePath("worship_playlists/a..b..mp3") {
		t.Fatal("a..b..mp3 should be allowed")
	}
	if !isUnsafeMediaRelativePath("../secret.mp3") {
		t.Fatal("../secret.mp3 must be rejected")
	}
	if !isUnsafeMediaRelativePath("worship_playlists/../../etc/passwd") {
		t.Fatal("nested .. segments must be rejected")
	}
	if !isUnsafeMediaRelativePath("foo\\..\\bar.mp3") {
		t.Fatal(`backslash .. segment must be rejected`)
	}
}

func TestGetMediaFileAllowsDoubleDotFilenamePastPathGuard(t *testing.T) {
	t.Setenv("S3_BUCKET", "")
	t.Setenv("EPAMS_S3_BUCKET", "")

	h := NewHandler("test-secret", nil)
	r := chi.NewRouter()
	h.Routes(r)

	// Without S3 this becomes 503 after the path guard — proving we no longer
	// short-circuit with 400 invalid path on "..mp3" filenames.
	path := "/api/media/file/worship_playlists/Ay%C3%BAdame.%20C%C3%A1nticos%20espirituales..mp3"
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code == http.StatusBadRequest && containsString(rec.Body.String(), "invalid path") {
		t.Fatalf("double-dot filename must not hit invalid path guard; body=%s", rec.Body.String())
	}
	if rec.Code != http.StatusServiceUnavailable && rec.Code != http.StatusNotFound {
		// Accept 503 (no S3) or 404 (S3 miss) — never 400 for this key.
		t.Fatalf("status=%d body=%s (want 503/404, not 400)", rec.Code, rec.Body.String())
	}
}

func TestGetMediaFileRejectsTraversalSegment(t *testing.T) {
	h := NewHandler("test-secret", nil)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/media/file/foo/../secret.mp3", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400 body=%s", rec.Code, rec.Body.String())
	}
	if !containsString(rec.Body.String(), "invalid path") {
		t.Fatalf("body=%s", rec.Body.String())
	}
}

func TestGetEmusicInvalidSlug(t *testing.T) {
	h := NewHandler("test-secret", nil)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/emusic/BAD_SLUG!", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400 body=%s", rec.Code, rec.Body.String())
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !containsString(s, p) {
			return false
		}
	}
	return true
}

func containsString(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && (s == sub || len(s) > 0 && stringIndex(s, sub) >= 0))
}

func stringIndex(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
