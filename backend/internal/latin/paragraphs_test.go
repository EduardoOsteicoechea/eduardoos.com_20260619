package latin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func readyParagraphIndexFixture(t *testing.T) (string, string) {
	t.Helper()
	chapters := make([]ChapterDoc, 0, ParagraphExpectedChapterCount)
	var parsed institutesIndex
	if err := json.Unmarshal([]byte(readyIndexFixture()), &parsed); err != nil {
		t.Fatal(err)
	}
	for _, e := range parsed.Sections {
		ch := DeriveChapter(SourceSection{
			ID: e.ID, Order: e.Order, Book: e.Book, Section: e.Section, Heading: e.Heading,
			Paragraphs: []SourceParagraph{{Order: 1, Text: "1. Alpha. Beta."}},
		})
		chapters = append(chapters, ch)
	}
	idx := BuildParagraphIndex(ParagraphExpectedSourceSha256, "test", chapters)
	raw, err := json.Marshal(idx)
	if err != nil {
		t.Fatal(err)
	}
	xi := chapters[11] // Liber I Caput XI (order 12 → index 11 with PRELIMINARY first)
	xiRaw, err := json.Marshal(xi)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw), string(xiRaw)
}

func TestParagraphIndexAndChapter(t *testing.T) {
	idxRaw, xiRaw := readyParagraphIndexFixture(t)
	h := &Handler{
		Bucket:     "test-bucket",
		Prefix:     "calvin-institutes",
		ParaPrefix: "calvin-institutes-paragraphs",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes-paragraphs/index.json":           idxRaw,
			"calvin-institutes-paragraphs/chapters/I/XI.json":   xiRaw,
		}},
	}
	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/paragraphs", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("index status=%d body=%s", rec.Code, rec.Body.String())
	}
	var idx ParagraphIndex
	if err := json.Unmarshal(rec.Body.Bytes(), &idx); err != nil {
		t.Fatal(err)
	}
	if idx.ChapterCount != 81 || idx.Derivation != ParagraphDerivation {
		t.Fatalf("%+v", idx)
	}

	sec := httptest.NewRecorder()
	r.ServeHTTP(sec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/paragraphs/chapters/I/XI", nil))
	if sec.Code != http.StatusOK {
		t.Fatalf("chapter status=%d body=%s", sec.Code, sec.Body.String())
	}
	var ch ChapterDoc
	if err := json.Unmarshal(sec.Body.Bytes(), &ch); err != nil {
		t.Fatal(err)
	}
	if ch.ID != "I.XI" || len(ch.Paragraphs) < 1 {
		t.Fatalf("%+v", ch)
	}

	bad := httptest.NewRecorder()
	r.ServeHTTP(bad, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/paragraphs/chapters/X/I", nil))
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("bad book status=%d", bad.Code)
	}
}

func TestParagraphIndexNotReady(t *testing.T) {
	stale := `{"schemaVersion":1,"sourceSha256":"nope","derivation":"break-after-period-v1","chapterCount":81,"paragraphCount":0,"chapters":[]}`
	h := &Handler{
		Bucket: "b", ParaPrefix: "calvin-institutes-paragraphs",
		S3: &fakeS3{objects: map[string]string{"calvin-institutes-paragraphs/index.json": stale}},
	}
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/paragraphs", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d", rec.Code)
	}
}
