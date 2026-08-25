package latin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestOutlineFromLocalWebsiteAssets(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	indexPath := filepath.Join(filepath.Dir(file), "..", "..", "dynamodb_output", "website_assets", "index.json")
	raw, err := os.ReadFile(indexPath)
	if err != nil {
		t.Skipf("local assets missing: %v", err)
	}
	var idx institutesIndex
	if err := json.Unmarshal(raw, &idx); err != nil {
		t.Fatal(err)
	}
	out := buildChapterOutline(filterLatinIndex(idx))
	if out.SectionCount < 30 || out.SectionCount > 50 {
		t.Fatalf("unexpected outline size %d headings=%v", out.SectionCount, headingsOf(out.Sections))
	}
	if out.Sections[0].Heading != "Caput XI — De iustificatione fidei, ac primo de ipsa nominis et rei definitione" {
		t.Fatalf("first=%q", out.Sections[0].Heading)
	}
	seen := map[string]bool{}
	prevLiber, prevRank := "", -1
	for _, s := range out.Sections {
		if seen[s.Heading] {
			t.Fatalf("duplicate %q", s.Heading)
		}
		seen[s.Heading] = true
		liber := ""
		if s.Book != nil {
			liber = *s.Book
		}
		rank := 0
		if strings.Contains(s.Heading, "Argumentum") {
			rank = 0
		} else if i := strings.Index(s.Heading, "Caput "); i >= 0 {
			rest := s.Heading[i+len("Caput "):]
			roman := rest
			if j := strings.Index(rest, " —"); j >= 0 {
				roman = strings.TrimSpace(rest[:j])
			}
			rank = caputRank(roman)
		}
		if liber == prevLiber && rank <= prevRank {
			t.Fatalf("out of order after rank %d: %q", prevRank, s.Heading)
		}
		if liber != prevLiber {
			prevRank = -1
		}
		prevLiber = liber
		prevRank = rank
	}
	t.Logf("outline entries=%d", out.SectionCount)
}
