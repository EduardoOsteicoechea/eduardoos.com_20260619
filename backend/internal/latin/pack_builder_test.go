package latin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildParagraphPackFromDir(t *testing.T) {
	inDir := t.TempDir()
	outDir := t.TempDir()

	// Minimal ready index + two Capita (builder still requires 81 for readiness —
	// so use the full ready fixture index and stub all section files).
	idxRaw := readyIndexFixture()
	if err := os.WriteFile(filepath.Join(inDir, "index.json"), []byte(idxRaw), 0o644); err != nil {
		t.Fatal(err)
	}
	secDir := filepath.Join(inDir, "sections")
	if err := os.MkdirAll(secDir, 0o755); err != nil {
		t.Fatal(err)
	}
	var parsed institutesIndex
	if err := json.Unmarshal([]byte(idxRaw), &parsed); err != nil {
		t.Fatal(err)
	}
	for _, e := range parsed.Sections {
		nnnn, err := normalizeSectionID(e.ID)
		if err != nil {
			t.Fatal(err)
		}
		text := "1. Alpha. Beta."
		if e.Section == "PRELIMINARY" {
			text = "Praefatio una. Praefatio dua."
		}
		sec := SourceSection{
			ID: e.ID, Order: e.Order, Book: e.Book, Section: e.Section, Heading: e.Heading,
			Paragraphs: []SourceParagraph{{Order: 1, Text: text}},
		}
		body, _ := json.Marshal(sec)
		if err := os.WriteFile(filepath.Join(secDir, nnnn+".json"), body, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	outIdx, err := BuildParagraphPackFromDir(inDir, outDir)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if outIdx.ChapterCount != 81 || outIdx.Derivation != ParagraphDerivation {
		t.Fatalf("index=%+v", outIdx)
	}
	xiPath := filepath.Join(outDir, "chapters", "I", "XI.json")
	raw, err := os.ReadFile(xiPath)
	if err != nil {
		t.Fatal(err)
	}
	var ch ChapterDoc
	if err := json.Unmarshal(raw, &ch); err != nil {
		t.Fatal(err)
	}
	if ch.ID != "I.XI" || len(ch.Paragraphs) != 3 || ch.Paragraphs[0].ID != "I.XI.1" {
		t.Fatalf("XI=%+v", ch)
	}
	if _, err := os.Stat(filepath.Join(outDir, "index.json")); err != nil {
		t.Fatal(err)
	}
}
