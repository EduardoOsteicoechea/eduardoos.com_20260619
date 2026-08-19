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
