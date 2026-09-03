// Package latin — paragraph derivation for the parallel Institutes pack (spec 056).
//
// This file turns each Caput’s paragraphs[]/points[] into addressable
// book → chapter → paragraph units that match the 032 reader’s
// “break after period” display (formatReadableParagraphBreaks + split on \n\n).
// It never mutates the calvin-institutes/ Capita objects.
package latin

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Derivation tag written into the parallel pack index (readiness gate).
const ParagraphDerivation = "break-after-period-v1"

// Expected parent corpus fingerprint (same clean pack as feature 032).
const ParagraphExpectedSourceSha256 = expectedSourceSha256

// Expected chapter count equals the Capita count in the 032 pack.
const ParagraphExpectedChapterCount = expectedSectionCount

// leadingNumberedParagraphRe matches Institutes “N. …” paragraph openers.
var leadingNumberedParagraphRe = regexp.MustCompile(`^(\d+)\.\s+([\s\S]*)$`)

// SourceParagraph is one Caput paragraphs[] entry (032 contract).
type SourceParagraph struct {
	Order  int           `json:"order"`
	Text   string        `json:"text"`
	Points []SourcePoint `json:"points,omitempty"`
}

// SourcePoint is an optional subdivision under a Caput paragraph.
type SourcePoint struct {
	Order int    `json:"order"`
	Text  string `json:"text"`
}

// SourceSection is the Caput JSON shape needed for derivation (032 section file).
type SourceSection struct {
	ID         string            `json:"id"`
	Order      int               `json:"order"`
	Book       string            `json:"book"`
	Section    string            `json:"section"`
	Heading    string            `json:"heading"`
	Paragraphs []SourceParagraph `json:"paragraphs"`
}

// ParagraphUnit is one addressable display segment in the parallel pack.
type ParagraphUnit struct {
	ID    string `json:"id"`
	Order int    `json:"order"`
	Text  string `json:"text"`
}

// ChapterDoc is chapters/{book}/{chapter}.json in the parallel pack.
type ChapterDoc struct {
	ID              string          `json:"id"`
	Order           int             `json:"order"`
	Book            string          `json:"book"`
	Chapter         string          `json:"chapter"`
	Heading         string          `json:"heading"`
	SourceSectionID string          `json:"sourceSectionId"`
	Paragraphs      []ParagraphUnit `json:"paragraphs"`
}

// ParagraphIndexEntry is one row in the parallel pack index.
type ParagraphIndexEntry struct {
	ID              string `json:"id"`
	Order           int    `json:"order"`
	Book            string `json:"book"`
	Chapter         string `json:"chapter"`
	Heading         string `json:"heading"`
	SourceSectionID string `json:"sourceSectionId"`
	ParagraphCount  int    `json:"paragraphCount"`
	URL             string `json:"url"`
}

// ParagraphIndex is calvin-institutes-paragraphs/index.json.
type ParagraphIndex struct {
	SchemaVersion  int                   `json:"schemaVersion"`
	SourceSha256   string                `json:"sourceSha256"`
	SourceEdition  string                `json:"sourceEdition,omitempty"`
	Derivation     string                `json:"derivation"`
	ChapterCount   int                   `json:"chapterCount"`
	ParagraphCount int                   `json:"paragraphCount"`
	Chapters       []ParagraphIndexEntry `json:"chapters"`
}

// ChapterID builds "{book}.{chapter}" (e.g. I.XI, I.PRELIMINARY).
func ChapterID(book, chapter string) string {
	return strings.TrimSpace(book) + "." + strings.TrimSpace(chapter)
}

// ParagraphID builds "{book}.{chapter}.{order}" (e.g. I.XI.3).
func ParagraphID(book, chapter string, order int) string {
	return fmt.Sprintf("%s.%d", ChapterID(book, chapter), order)
}

// ChapterObjectURL is the relative S3 object path under the paragraph pack prefix.
func ChapterObjectURL(book, chapter string) string {
	return fmt.Sprintf("chapters/%s/%s.json", strings.TrimSpace(book), strings.TrimSpace(chapter))
}

// FormatReadableParagraphBreaks mirrors frontend formatReadableParagraphBreaks
// (blank line after sentence periods; numbered openers get their own first block).
func FormatReadableParagraphBreaks(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return trimmed
	}
	if m := leadingNumberedParagraphRe.FindStringSubmatch(trimmed); m != nil {
		body := strings.TrimRight(replaceSentenceBreaks(m[2]), " \t\r\n")
		return m[1] + ".\n\n" + body
	}
	return strings.TrimRight(replaceSentenceBreaks(trimmed), " \t\r\n")
}

// replaceSentenceBreaks turns ". " (period + whitespace) into ".\n\n".
func replaceSentenceBreaks(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 8)
	i := 0
	for i < len(s) {
		if s[i] == '.' && i+1 < len(s) && isASCIISpace(s[i+1]) {
			b.WriteByte('.')
			b.WriteString("\n\n")
			i++
			for i < len(s) && isASCIISpace(s[i]) {
				i++
			}
			continue
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

func isASCIISpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

// SplitDisplaySegments applies FormatReadableParagraphBreaks then splits on \n\n.
func SplitDisplaySegments(text string) []string {
	formatted := FormatReadableParagraphBreaks(text)
	if formatted == "" {
		return nil
	}
	raw := strings.Split(formatted, "\n\n")
	out := make([]string, 0, len(raw))
	for _, part := range raw {
		t := strings.TrimSpace(part)
		if t == "" {
			continue
		}
		out = append(out, t)
	}
	return out
}

// sourceTextsInReaderOrder yields Caput body strings in the same preference as
// 032 flattenSectionBody: paragraph text if non-empty, else each point text.
func sourceTextsInReaderOrder(paras []SourceParagraph) []string {
	sorted := append([]SourceParagraph(nil), paras...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Order < sorted[j].Order
	})
	var out []string
	for _, p := range sorted {
		text := strings.TrimSpace(p.Text)
		if text != "" {
			out = append(out, text)
			continue
		}
		pts := append([]SourcePoint(nil), p.Points...)
		sort.SliceStable(pts, func(i, j int) bool {
			return pts[i].Order < pts[j].Order
		})
		for _, pt := range pts {
			t := strings.TrimSpace(pt.Text)
			if t != "" {
				out = append(out, t)
			}
		}
	}
	return out
}

// DeriveChapter builds a ChapterDoc from one 032 Caput section.
func DeriveChapter(sec SourceSection) ChapterDoc {
	book := strings.TrimSpace(sec.Book)
	chapter := strings.TrimSpace(sec.Section)
	var units []ParagraphUnit
	order := 1
	for _, src := range sourceTextsInReaderOrder(sec.Paragraphs) {
		for _, seg := range SplitDisplaySegments(src) {
			units = append(units, ParagraphUnit{
				ID:    ParagraphID(book, chapter, order),
				Order: order,
				Text:  seg,
			})
			order++
		}
	}
	sourceID := strings.TrimSpace(sec.ID)
	if sourceID == "" && sec.Order > 0 {
		sourceID = fmt.Sprintf("section-%04d", sec.Order)
	}
	return ChapterDoc{
		ID:              ChapterID(book, chapter),
		Order:           sec.Order,
		Book:            book,
		Chapter:         chapter,
		Heading:         strings.TrimSpace(sec.Heading),
		SourceSectionID: sourceID,
		Paragraphs:      units,
	}
}

// BuildParagraphIndex assembles index.json from derived chapters (sorted by order).
func BuildParagraphIndex(sourceSha256, sourceEdition string, chapters []ChapterDoc) ParagraphIndex {
	sorted := append([]ChapterDoc(nil), chapters...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Order < sorted[j].Order
	})
	entries := make([]ParagraphIndexEntry, 0, len(sorted))
	paraCount := 0
	for _, ch := range sorted {
		n := len(ch.Paragraphs)
		paraCount += n
		entries = append(entries, ParagraphIndexEntry{
			ID:              ch.ID,
			Order:           ch.Order,
			Book:            ch.Book,
			Chapter:         ch.Chapter,
			Heading:         ch.Heading,
			SourceSectionID: ch.SourceSectionID,
			ParagraphCount:  n,
			URL:             ChapterObjectURL(ch.Book, ch.Chapter),
		})
	}
	return ParagraphIndex{
		SchemaVersion:  1,
		SourceSha256:   sourceSha256,
		SourceEdition:  sourceEdition,
		Derivation:     ParagraphDerivation,
		ChapterCount:   len(entries),
		ParagraphCount: paraCount,
		Chapters:       entries,
	}
}

// ValidateParagraphIndex enforces the parallel-pack readiness contract.
func ValidateParagraphIndex(idx ParagraphIndex) (bool, string) {
	if strings.TrimSpace(idx.SourceSha256) != ParagraphExpectedSourceSha256 {
		return false, "sourceSha256 mismatch"
	}
	if strings.TrimSpace(idx.Derivation) != ParagraphDerivation {
		return false, "derivation mismatch"
	}
	if idx.ChapterCount != ParagraphExpectedChapterCount {
		return false, fmt.Sprintf("chapterCount=%d want %d", idx.ChapterCount, ParagraphExpectedChapterCount)
	}
	if len(idx.Chapters) != ParagraphExpectedChapterCount {
		return false, fmt.Sprintf("chapters len=%d want %d", len(idx.Chapters), ParagraphExpectedChapterCount)
	}
	return true, ""
}
