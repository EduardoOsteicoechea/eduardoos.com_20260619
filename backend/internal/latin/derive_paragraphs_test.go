package latin

import (
	"strings"
	"testing"
)

func TestFormatReadableParagraphBreaksNumbered(t *testing.T) {
	in := "1. Prima sententia. Secunda sententia."
	got := FormatReadableParagraphBreaks(in)
	want := "1.\n\nPrima sententia.\n\nSecunda sententia."
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestSplitDisplaySegmentsMatchesReader(t *testing.T) {
	segs := SplitDisplaySegments("1. Prima sententia. Secunda sententia.")
	if len(segs) != 3 {
		t.Fatalf("len=%d segs=%v", len(segs), segs)
	}
	if segs[0] != "1." || segs[1] != "Prima sententia." || segs[2] != "Secunda sententia." {
		t.Fatalf("unexpected segs=%v", segs)
	}
}

func TestDeriveChapterIDs(t *testing.T) {
	ch := DeriveChapter(SourceSection{
		ID:      "section-0012",
		Order:   12,
		Book:    "I",
		Section: "XI",
		Heading: "CAPUT XI. — Deo tribuere…",
		Paragraphs: []SourceParagraph{
			{Order: 1, Text: "1. Alpha. Beta."},
			{Order: 2, Text: "Gamma. Delta."},
		},
	})
	if ch.ID != "I.XI" {
		t.Fatalf("chapter id=%q", ch.ID)
	}
	if len(ch.Paragraphs) != 5 {
		t.Fatalf("paragraphs=%d want 5: %#v", len(ch.Paragraphs), ch.Paragraphs)
	}
	if ch.Paragraphs[0].ID != "I.XI.1" || ch.Paragraphs[0].Text != "1." {
		t.Fatalf("p0=%+v", ch.Paragraphs[0])
	}
	if ch.Paragraphs[4].ID != "I.XI.5" || !strings.HasPrefix(ch.Paragraphs[4].Text, "Delta") {
		t.Fatalf("p4=%+v", ch.Paragraphs[4])
	}
}

func TestDeriveChapterFallsBackToPoints(t *testing.T) {
	ch := DeriveChapter(SourceSection{
		ID: "section-0002", Order: 2, Book: "I", Section: "I", Heading: "CAPUT I.",
		Paragraphs: []SourceParagraph{
			{Order: 1, Text: "", Points: []SourcePoint{
				{Order: 2, Text: "Second point. More."},
				{Order: 1, Text: "First point."},
			}},
		},
	})
	if len(ch.Paragraphs) != 3 {
		t.Fatalf("len=%d %#v", len(ch.Paragraphs), ch.Paragraphs)
	}
	if ch.Paragraphs[0].Text != "First point." {
		t.Fatalf("order wrong: %+v", ch.Paragraphs)
	}
}

func TestBuildParagraphIndexCounts(t *testing.T) {
	a := DeriveChapter(SourceSection{
		ID: "section-0001", Order: 1, Book: "I", Section: "PRELIMINARY", Heading: "Praefatio",
		Paragraphs: []SourceParagraph{{Order: 1, Text: "Uno. Dos."}},
	})
	b := DeriveChapter(SourceSection{
		ID: "section-0002", Order: 2, Book: "I", Section: "I", Heading: "CAPUT I.",
		Paragraphs: []SourceParagraph{{Order: 1, Text: "Tres."}},
	})
	idx := BuildParagraphIndex(ParagraphExpectedSourceSha256, "test", []ChapterDoc{b, a})
	if idx.ChapterCount != 2 || idx.ParagraphCount != 3 {
		t.Fatalf("chapters=%d paras=%d", idx.ChapterCount, idx.ParagraphCount)
	}
	if idx.Chapters[0].ID != "I.PRELIMINARY" || idx.Chapters[0].URL != "chapters/I/PRELIMINARY.json" {
		t.Fatalf("first=%+v", idx.Chapters[0])
	}
	if idx.Derivation != ParagraphDerivation {
		t.Fatalf("derivation=%q", idx.Derivation)
	}
}

func TestValidateParagraphIndexReadyRequires81(t *testing.T) {
	idx := BuildParagraphIndex(ParagraphExpectedSourceSha256, "", []ChapterDoc{
		{ID: "I.I", Order: 1, Book: "I", Chapter: "I"},
	})
	ok, reason := ValidateParagraphIndex(idx)
	if ok {
		t.Fatal("expected not ready for 1 chapter")
	}
	if !strings.Contains(reason, "chapterCount") {
		t.Fatalf("reason=%q", reason)
	}
}
