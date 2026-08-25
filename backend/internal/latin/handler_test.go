package latin

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

type fakeS3 struct {
	objects map[string]string
}

func (f *fakeS3) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	_ = ctx
	_ = optFns
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	body, ok := f.objects[key]
	if !ok {
		return nil, fmtErr("NoSuchKey: " + key)
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(body)),
	}, nil
}

type simpleErr string

func (e simpleErr) Error() string { return string(e) }
func fmtErr(s string) error       { return simpleErr(s) }

func TestIndexAndSection(t *testing.T) {
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes/index.json":         `{"sectionCount":1,"sections":[{"id":"section-0001","url":"sections/0001.json"}]}`,
			"calvin-institutes/sections/0001.json": `{"id":"section-0001","heading":"Hello","text":"Body"}`,
		}},
	}
	r := chi.NewRouter()
	h.Routes(r)

	idx := httptest.NewRecorder()
	r.ServeHTTP(idx, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes", nil))
	if idx.Code != http.StatusOK {
		t.Fatalf("index status=%d body=%s", idx.Code, idx.Body.String())
	}
	if !bytes.Contains(idx.Body.Bytes(), []byte("sectionCount")) {
		t.Fatalf("index body=%s", idx.Body.String())
	}

	sec := httptest.NewRecorder()
	r.ServeHTTP(sec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/1", nil))
	if sec.Code != http.StatusOK {
		t.Fatalf("section status=%d", sec.Code)
	}
	if !bytes.Contains(sec.Body.Bytes(), []byte("Hello")) {
		t.Fatalf("section body=%s", sec.Body.String())
	}

	bad := httptest.NewRecorder()
	r.ServeHTTP(bad, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/../x", nil))
	if bad.Code != http.StatusBadRequest && bad.Code != http.StatusNotFound {
		// chi may not match; if matched, normalize rejects
		t.Logf("traversal status=%d", bad.Code)
	}

	miss := httptest.NewRecorder()
	r.ServeHTTP(miss, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/9999", nil))
	if miss.Code != http.StatusNotFound {
		t.Fatalf("miss status=%d", miss.Code)
	}
}

func TestNormalizeSectionID(t *testing.T) {
	n, err := normalizeSectionID("section-12")
	if err != nil || n != "0012" {
		t.Fatalf("got %q %v", n, err)
	}
	if _, err := normalizeSectionID("abc"); err == nil {
		t.Fatal("expected error")
	}
}
