package latin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Minimal ready index: 81 entries with the clean Caput map (no OCR, no repo assets).
func readyIndexFixture() string {
	type entry struct {
		ID      string `json:"id"`
		Order   int    `json:"order"`
		Volume  int    `json:"volume"`
		Book    string `json:"book"`
		Section string `json:"section"`
		Heading string `json:"heading"`
		URL     string `json:"url"`
	}
	romans := []string{
		"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
		"XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
		"XXI", "XXII", "XXIII", "XXIV", "XXV",
	}
	var sections []entry
	order := 1
	add := func(book, section, heading string) {
		id := fmt.Sprintf("section-%04d", order)
		sections = append(sections, entry{
			ID: id, Order: order, Volume: 1559, Book: book, Section: section,
			Heading: heading, URL: fmt.Sprintf("sections/%04d.json", order),
		})
		order++
	}
	add("I", "PRELIMINARY", "Praefatio ad Regem Christianissimum")
	for i := 0; i < 18; i++ {
		h := "CAPUT " + romans[i] + "."
		if romans[i] == "XI" {
			h = "CAPUT XI. — Deo tribuere visibilem formam nefas esse, ac generaliter deficere a vero Deo quicunque idola sibi erigunt."
		}
		add("I", romans[i], h)
	}
	for i := 0; i < 17; i++ {
		add("II", romans[i], "CAPUT "+romans[i]+".")
	}
	for i := 0; i < 25; i++ {
		add("III", romans[i], "CAPUT "+romans[i]+".")
	}
	for i := 0; i < 20; i++ {
		add("IV", romans[i], "CAPUT "+romans[i]+".")
	}
	payload := map[string]any{
		"schemaVersion": 1,
		"sourceSha256":  expectedSourceSha256,
		"sourceEdition": "Barth/Niesel Latin 1559 via calvin.reformation.nl",
		"sectionCount":  len(sections),
		"sections":      sections,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(raw)
}

func TestIndexServesReadyLatinCorpus(t *testing.T) {
	raw := readyIndexFixture()
	h := &Handler{
		Bucket: "test-bucket",
		Prefix: "calvin-institutes",
		S3: &fakeS3{objects: map[string]string{
			"calvin-institutes/index.json":         raw,
			"calvin-institutes/sections/0002.json": `{"id":"section-0002","book":"I","section":"I","heading":"CAPUT I.","paragraphs":[]}`,
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
	if !strings.Contains(strings.ToLower(parsed.SourceEdition), "barth") {
		t.Fatalf("sourceEdition=%q", parsed.SourceEdition)
	}

	if parsed.Sections[0].Book != "I" || parsed.Sections[0].Section != "PRELIMINARY" {
		t.Fatalf("first=%s.%s", parsed.Sections[0].Book, parsed.Sections[0].Section)
	}

	mustHave := []struct{ book, section string }{
		{"I", "I"}, {"I", "XI"}, {"II", "I"}, {"III", "I"}, {"III", "X"}, {"III", "XI"}, {"IV", "I"},
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

	books := map[string]int{}
	for _, s := range parsed.Sections {
		books[s.Book]++
	}
	wantBooks := map[string]int{"I": 19, "II": 17, "III": 25, "IV": 20}
	for book, n := range wantBooks {
		if books[book] != n {
			t.Fatalf("book %s count=%d want %d", book, books[book], n)
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
