package s3store

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

func TestHandleUploadJSON(t *testing.T) {
	st := newStubStore(Config{Bucket: "b", Prefix: "media"})
	srv := &Server{Store: st}
	r := chi.NewRouter()
	r.Use(common.InternalAuthMiddleware("secret"))
	srv.RegisterRoutes(r)

	body, _ := json.Marshal(map[string]string{
		"key":         "test.png",
		"body_base64": base64.StdEncoding.EncodeToString(pngBytes()),
	})
	req := httptest.NewRequest(http.MethodPost, "/upload", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken("secret", "cid-1"))
	req.Header.Set(common.CorrelationHeader, "cid-1")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	got, _, err := st.Get(req.Context(), "test.png")
	if err != nil || !bytes.Equal(got, pngBytes()) {
		t.Fatalf("stored object mismatch: %v", err)
	}
}

func TestHandleUploadRequiresInternalToken(t *testing.T) {
	st := newStubStore(Config{Bucket: "b", Prefix: "media"})
	srv := &Server{Store: st}
	r := chi.NewRouter()
	r.Use(common.InternalAuthMiddleware("secret"))
	srv.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost, "/upload", bytes.NewReader([]byte("{}")))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 got %d", rec.Code)
	}
}
