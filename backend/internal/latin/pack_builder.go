// Package latin — pack builder that reads a local 032 calvin-institutes tree
// and writes the parallel paragraph pack (spec 055). Never writes the source tree.
package latin

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// InstitutesDirIndex is the on-disk shape of calvin-institutes/index.json.
type InstitutesDirIndex struct {
	SchemaVersion int                    `json:"schemaVersion"`
	SourceSha256  string                 `json:"sourceSha256"`
	SourceEdition string                 `json:"sourceEdition"`
	SectionCount  int                    `json:"sectionCount"`
	Sections      []institutesIndexEntry `json:"sections"`
}

// BuildParagraphPackFromDir reads {inDir}/index.json + section files and writes
// index.json + chapters/{book}/{chapter}.json under outDir.
func BuildParagraphPackFromDir(inDir, outDir string) (ParagraphIndex, error) {
	inDir = filepath.Clean(inDir)
	outDir = filepath.Clean(outDir)
	raw, err := os.ReadFile(filepath.Join(inDir, "index.json"))
	if err != nil {
		return ParagraphIndex{}, fmt.Errorf("read index: %w", err)
	}
	var src InstitutesDirIndex
	if err := json.Unmarshal(raw, &src); err != nil {
		return ParagraphIndex{}, fmt.Errorf("parse index: %w", err)
	}
	if ready, reason := validateLatinIndex(institutesIndex{
		SchemaVersion: src.SchemaVersion,
		SourceSha256:  src.SourceSha256,
		SourceEdition: src.SourceEdition,
		SectionCount:  src.SectionCount,
		Sections:      src.Sections,
	}); !ready {
		return ParagraphIndex{}, fmt.Errorf("source index not ready: %s", reason)
	}

	chapters := make([]ChapterDoc, 0, len(src.Sections))
	for _, entry := range src.Sections {
		secPath, err := resolveSectionPath(inDir, entry)
		if err != nil {
			return ParagraphIndex{}, err
		}
		secRaw, err := os.ReadFile(secPath)
		if err != nil {
			return ParagraphIndex{}, fmt.Errorf("read section %s: %w", entry.ID, err)
		}
		var sec SourceSection
		if err := json.Unmarshal(secRaw, &sec); err != nil {
			return ParagraphIndex{}, fmt.Errorf("parse section %s: %w", entry.ID, err)
		}
		// Prefer index metadata for book/section/order/heading when present.
		if sec.Book == "" {
			sec.Book = entry.Book
		}
		if sec.Section == "" {
			sec.Section = entry.Section
		}
		if sec.Heading == "" {
			sec.Heading = entry.Heading
		}
		if sec.Order == 0 {
			sec.Order = entry.Order
		}
		if sec.ID == "" {
			sec.ID = entry.ID
		}
		chapters = append(chapters, DeriveChapter(sec))
	}

	idx := BuildParagraphIndex(src.SourceSha256, src.SourceEdition, chapters)
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return ParagraphIndex{}, err
	}
	for _, ch := range chapters {
		rel := ChapterObjectURL(ch.Book, ch.Chapter)
		path := filepath.Join(outDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return ParagraphIndex{}, err
		}
		body, err := json.MarshalIndent(ch, "", "  ")
		if err != nil {
			return ParagraphIndex{}, err
		}
		body = append(body, '\n')
		if err := os.WriteFile(path, body, 0o644); err != nil {
			return ParagraphIndex{}, err
		}
	}
	idxBody, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return ParagraphIndex{}, err
	}
	idxBody = append(idxBody, '\n')
	if err := os.WriteFile(filepath.Join(outDir, "index.json"), idxBody, 0o644); err != nil {
		return ParagraphIndex{}, err
	}
	return idx, nil
}

func resolveSectionPath(inDir string, entry institutesIndexEntry) (string, error) {
	candidates := []string{}
	if u := strings.TrimSpace(entry.URL); u != "" {
		candidates = append(candidates, filepath.Join(inDir, filepath.FromSlash(u)))
	}
	if id := strings.TrimSpace(entry.ID); id != "" {
		if nnnn, err := normalizeSectionID(id); err == nil {
			candidates = append(candidates, filepath.Join(inDir, "sections", nnnn+".json"))
		}
	}
	if entry.Order > 0 {
		candidates = append(candidates, filepath.Join(inDir, "sections", fmt.Sprintf("%04d.json", entry.Order)))
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("section file not found for %s", entry.ID)
}
