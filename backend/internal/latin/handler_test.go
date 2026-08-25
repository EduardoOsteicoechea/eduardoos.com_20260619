package latin

import (
	"bytes"
	"context"
	"encoding/json"
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

func TestIndexFiltersEnglishAndSectionPassthrough(t *testing.T) {
	fullIndex := `{
  "schemaVersion": 1,
  "sourceSha256": "abc",
  "sectionCount": 4,
  "sections": [
    {"id":"section-0001","order":1,"volume":1,"heading":"CHAP.I.]CHRISTIANRELIGION.","url":"sections/0001.json"},
    {"id":"section-0305","order":305,"volume":2,"heading":"VOLUME 2 — PRELIMINARY MATERIAL","url":"sections/0305.json"},
    {"id":"section-0306","order":306,"volume":2,"heading":"LIBER TERTIUS.","url":"sections/0306.json"},
    {"id":"section-0307","order":307,"volume":2,"heading":"CAPUT XI.","url":"sections/0307.json"}
  ]
}`
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes/index.json":         fullIndex,
			"calvin-institutes/sections/0001.json": `{"id":"section-0001","heading":"English","text":"Body"}`,
			"calvin-institutes/sections/0306.json": `{"id":"section-0306","heading":"LIBER TERTIUS.","text":"De modo"}`,
		}},
	}
	r := chi.NewRouter()
	h.Routes(r)

	idx := httptest.NewRecorder()
	r.ServeHTTP(idx, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes", nil))
	if idx.Code != http.StatusOK {
		t.Fatalf("index status=%d body=%s", idx.Code, idx.Body.String())
	}
	var parsed institutesIndex
	if err := json.Unmarshal(idx.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, idx.Body.String())
	}
	if parsed.SectionCount != 2 || len(parsed.Sections) != 2 {
		t.Fatalf("want 2 latin sections, got count=%d len=%d body=%s", parsed.SectionCount, len(parsed.Sections), idx.Body.String())
	}
	if parsed.Sections[0].Heading != "LIBER TERTIUS." || parsed.Sections[1].Heading != "CAPUT XI." {
		t.Fatalf("unexpected latin headings: %+v", parsed.Sections)
	}
	if bytes.Contains(idx.Body.Bytes(), []byte("CHRISTIANRELIGION")) {
		t.Fatal("english heading leaked into index")
	}
	if bytes.Contains(idx.Body.Bytes(), []byte("VOLUME 2")) {
		t.Fatal("english prelim leaked into index")
	}

	sec := httptest.NewRecorder()
	r.ServeHTTP(sec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/306", nil))
	if sec.Code != http.StatusOK {
		t.Fatalf("section status=%d", sec.Code)
	}
	if !bytes.Contains(sec.Body.Bytes(), []byte("LIBER TERTIUS")) {
		t.Fatalf("section body=%s", sec.Body.String())
	}

	// English section object still fetchable by id (left on S3; hidden from index only).
	eng := httptest.NewRecorder()
	r.ServeHTTP(eng, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/1", nil))
	if eng.Code != http.StatusOK {
		t.Fatalf("english section status=%d", eng.Code)
	}

	miss := httptest.NewRecorder()
	r.ServeHTTP(miss, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/9999", nil))
	if miss.Code != http.StatusNotFound {
		t.Fatalf("miss status=%d", miss.Code)
	}
}

func TestIsLatinIndexEntry(t *testing.T) {
	v1, v2 := 1, 2
	cases := []struct {
		name string
		e    institutesIndexEntry
		want bool
	}{
		{"english v1", institutesIndexEntry{Volume: &v1, Heading: "CHAP.I."}, false},
		{"prelim v2", institutesIndexEntry{Volume: &v2, Heading: "VOLUME 2 — PRELIMINARY MATERIAL"}, false},
		{"latin liber", institutesIndexEntry{Volume: &v2, Heading: "LIBER TERTIUS."}, true},
		{"nil volume", institutesIndexEntry{Heading: "CAPUT XI."}, false},
	}
	for _, tc := range cases {
		if got := isLatinIndexEntry(tc.e); got != tc.want {
			t.Fatalf("%s: got %v want %v", tc.name, got, tc.want)
		}
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
