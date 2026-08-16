// Package content — series tree helpers for pamphlet organization.
//
// Pamphlets (EPAMs) group as series → chapters → pamphlet without a new
// Dynamo table. BuildSeriesTree walks ListByUser metadata and nests rows.
package content

import (
	"sort"
	"strings"
)

const (
	// UnassignedSeriesLabel is the bucket for pamphlets with empty series meta.
	UnassignedSeriesLabel = "(sin serie)"
	// UnassignedChapterLabel is the bucket for empty seriesChapter meta.
	UnassignedChapterLabel = "(sin capítulo)"
)

// SeriesTreeItem is one pamphlet leaf in the series tree.
type SeriesTreeItem struct {
	EpamID        string `json:"epamId"`
	Title         string `json:"title"`
	FileName      string `json:"fileName,omitempty"`
	Series        string `json:"series,omitempty"`
	SeriesChapter string `json:"seriesChapter,omitempty"`
	UpdatedAt     string `json:"updatedAt,omitempty"`
}

// SeriesTreeChapter holds pamphlets under one chapter name.
type SeriesTreeChapter struct {
	Name  string           `json:"name"`
	Items []SeriesTreeItem `json:"items"`
}

// SeriesTreeNode is one series with nested chapters.
type SeriesTreeNode struct {
	Name     string              `json:"name"`
	Chapters []SeriesTreeChapter `json:"chapters"`
}

// SeriesTreeResponse is the GET /api/epams/series-tree payload.
type SeriesTreeResponse struct {
	Count  int              `json:"count"`
	Series []SeriesTreeNode `json:"series"`
}

func seriesKey(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return UnassignedSeriesLabel
	}
	return s
}

func chapterKey(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return UnassignedChapterLabel
	}
	return s
}

// BuildSeriesTree groups epam metadata into series → chapters → items.
// Sorting is stable: series/chapter names ascending; items by title then epamId.
func BuildSeriesTree(records []EpamRecord) SeriesTreeResponse {
	type chapterBucket struct {
		items []SeriesTreeItem
	}
	seriesMap := map[string]map[string]*chapterBucket{}

	for _, rec := range records {
		sk := seriesKey(rec.Series)
		ck := chapterKey(rec.SeriesChapter)
		if seriesMap[sk] == nil {
			seriesMap[sk] = map[string]*chapterBucket{}
		}
		if seriesMap[sk][ck] == nil {
			seriesMap[sk][ck] = &chapterBucket{}
		}
		title := strings.TrimSpace(rec.Title)
		if title == "" {
			title = strings.TrimSpace(rec.FileName)
		}
		if title == "" {
			title = rec.EpamID
		}
		seriesMap[sk][ck].items = append(seriesMap[sk][ck].items, SeriesTreeItem{
			EpamID:        rec.EpamID,
			Title:         title,
			FileName:      rec.FileName,
			Series:        rec.Series,
			SeriesChapter: rec.SeriesChapter,
			UpdatedAt:     rec.UpdatedAt,
		})
	}

	seriesNames := make([]string, 0, len(seriesMap))
	for name := range seriesMap {
		seriesNames = append(seriesNames, name)
	}
	sort.Strings(seriesNames)

	out := make([]SeriesTreeNode, 0, len(seriesNames))
	total := 0
	for _, sName := range seriesNames {
		chaptersMap := seriesMap[sName]
		chapterNames := make([]string, 0, len(chaptersMap))
		for name := range chaptersMap {
			chapterNames = append(chapterNames, name)
		}
		sort.Strings(chapterNames)

		chapters := make([]SeriesTreeChapter, 0, len(chapterNames))
		for _, cName := range chapterNames {
			items := chaptersMap[cName].items
			sort.SliceStable(items, func(i, j int) bool {
				if items[i].Title != items[j].Title {
					return items[i].Title < items[j].Title
				}
				return items[i].EpamID < items[j].EpamID
			})
			total += len(items)
			chapters = append(chapters, SeriesTreeChapter{Name: cName, Items: items})
		}
		out = append(out, SeriesTreeNode{Name: sName, Chapters: chapters})
	}

	return SeriesTreeResponse{Count: total, Series: out}
}
