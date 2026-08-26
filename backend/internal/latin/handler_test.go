package latin

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestIndexServesReadyLatinCorpus(t *testing.T) {
	raw := loadLocalIndexOrSkip(t)
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes/index.json":         string(raw),
			"calvin-institutes/sections/0002.json": `{"id":"section-0002","book":"I","section":"I","heading":"CAPUT I.","paragraphs":[]}`,
			"calvin-institutes/sections/0037.json": `{"id":"section-0037","book":"III","section":"I","heading":"CAPUT I.","paragraphs":[]}`,
		}},
	}
	r := chi.NewRouter()
	h.Routes(r)

	idx := httptest.NewRecorder()
	r.ServeHTTP(idx, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes", nil))
	if idx.Code != http.StatusOK {
		t.Fatalf("index status=%d body=%s", idx.Code, idx.Body.String())
	}
	if cc := idx.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control=%q want no-store", cc)
	}

	var parsed institutesIndex
	if err := json.Unmarshal(idx.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v body=%s", err, idx.Body.String())
	}
	if parsed.SectionCount != expectedSectionCount || len(parsed.Sections) != expectedSectionCount {
		t.Fatalf("count=%d len=%d", parsed.SectionCount, len(parsed.Sections))
	}
	if parsed.SourceSha256 != expectedSourceSha256 {
		t.Fatalf("sha=%q", parsed.SourceSha256)
	}

	wantFirst := map[string]string{"book": "I", "section": "PRELIMINARY"}
	if parsed.Sections[0].Book != wantFirst["book"] || parsed.Sections[0].Section != wantFirst["section"] {
		t.Fatalf("first=%s.%s", parsed.Sections[0].Book, parsed.Sections[0].Section)
	}

	// Spot-check Liber coverage including previously missing III.I–X and clean I.XI.
	mustHave := []struct{ book, section string }{
		{"I", "I"},
		{"I", "XI"},
		{"II", "I"},
		{"III", "I"},
		{"III", "X"},
		{"III", "XI"},
		{"IV", "I"},
	}
	for _, want := range mustHave {
		if !hasBookSection(parsed.Sections, want.book, want.section) {
			t.Fatalf("missing Liber %s Caput %s", want.book, want.section)
		}
	}
	xi := findBookSection(parsed.Sections, "I", "XI")
	if xi == nil || !strings.Contains(xi.Heading, "visibilem formam") {
		t.Fatalf("I.XI heading not clean: %#v", xi)
	}
	if strings.Contains(strings.ToLower(xi.Heading), "utfibilem") {
		t.Fatalf("OCR garbage still in I.XI: %q", xi.Heading)
	}

	// No English Allen leakage markers in the outline.
	body := idx.Body.String()
	for _, bad := range []string{"CHRISTIANRELIGION", "CHAP.I.", "Allen"} {
		if strings.Contains(body, bad) {
			t.Fatalf("english marker %q leaked", bad)
		}
	}

	sec := httptest.NewRecorder()
	r.ServeHTTP(sec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes/sections/2", nil))
	if sec.Code != http.StatusOK {
		t.Fatalf("section status=%d", sec.Code)
	}
}

func TestIndexRejectsStaleSha(t *testing.T) {
	stale := `{
  "schemaVersion": 1,
  "sourceSha256": "deadbeef",
  "sectionCount": 81,
  "sections": []
}`
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3:     &fakeS3{objects: map[string]string{"calvin-institutes/index.json": stale}},
	}
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/latin/calvins-institutes", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
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

func TestValidateLatinIndexLocalAssets(t *testing.T) {
	raw := loadLocalIndexOrSkip(t)
	var idx institutesIndex
	if err := json.Unmarshal(raw, &idx); err != nil {
		t.Fatal(err)
	}
	ok, reason := validateLatinIndex(idx)
	if !ok {
		t.Fatalf("not ready: %s", reason)
	}
	out := normalizeLatinIndex(idx)
	if out.Sections[0].Section != "PRELIMINARY" {
		t.Fatalf("first section=%q", out.Sections[0].Section)
	}
	books := map[string]int{}
	for _, s := range out.Sections {
		books[s.Book]++
	}
	wantBooks := map[string]int{"I": 19, "II": 17, "III": 25, "IV": 20}
	for book, n := range wantBooks {
		if books[book] != n {
			t.Fatalf("book %s count=%d want %d", book, books[book], n)
		}
	}
	if !strings.Contains(strings.ToLower(idx.SourceEdition), "barth") {
		t.Fatalf("sourceEdition=%q", idx.SourceEdition)
	}
}

func hasBookSection(sections []institutesIndexEntry, book, section string) bool {
	return findBookSection(sections, book, section) != nil
}

func findBookSection(sections []institutesIndexEntry, book, section string) *institutesIndexEntry {
	for i := range sections {
		if sections[i].Book == book && sections[i].Section == section {
			return &sections[i]
		}
	}
	return nil
}

func loadLocalIndexOrSkip(t *testing.T) []byte {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	indexPath := filepath.Join(filepath.Dir(file), "..", "..", "dynamodb_output", "website_assets", "index.json")
	raw, err := os.ReadFile(indexPath)
	if err != nil {
		t.Skipf("local assets missing: %v", err)
	}
	return raw
}
