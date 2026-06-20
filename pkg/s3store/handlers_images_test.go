package s3store

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

func TestHandleListImages(t *testing.T) {
	ctx := context.Background()
	st := newStubStore(Config{Bucket: "b", Prefix: "media"})
	_, _ = st.Put(ctx, "photo.png", "image/png", []byte("PNG"))
	_, _ = st.Put(ctx, "notes.txt", "text/plain", []byte("hi"))

	srv := &Server{Store: st, Prefix: "media"}
	r := chi.NewRouter()
	r.Use(common.InternalAuthMiddleware("secret"))
	srv.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/images", nil)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken("secret", "cid"))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Count  int         `json:"count"`
		Images []ImageItem `json:"images"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Count != 1 || len(payload.Images) != 1 || payload.Images[0].Name != "photo.png" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}
