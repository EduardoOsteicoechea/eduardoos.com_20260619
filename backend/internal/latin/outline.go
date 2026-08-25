// Chapter outline: collapse noisy OCR page headings into Liber · Caput entries
// sorted in canonical Institutes order (see specs/032-calvins-institutes).
package latin

import (
	"regexp"
	"sort"
	"strings"
)

var (
	liberTertiusRe   = regexp.MustCompile(`(?i)^\s*LIBER\s+(TERTIUS|III)\b`)
	liberQuartusRe   = regexp.MustCompile(`(?i)^\s*LIBER\s+(QUARTUS|IV|IY|4)\b`)
	caputHeadingRe   = regexp.MustCompile(`(?i)^\s*CAPUT\s+([A-Za-z0-9\.\s]+)`)
	argumentumOnlyRe = regexp.MustCompile(`(?i)^\s*ARGUMENTUM\.?\s*$`)
)

// romanValues maps canonical Caput numerals used in this corpus.
var romanValues = map[string]int{
	"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
	"XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15, "XVI": 16, "XVII": 17, "XVIII": 18, "XIX": 19, "XX": 20,
	"XXI": 21, "XXII": 22, "XXIII": 23, "XXIV": 24, "XXV": 25,
}

type outlineKey struct {
	liber string
	caput string
}

// buildChapterOutline turns filtered Latin page rows into one entry per Caput.
func buildChapterOutline(latin institutesIndex) institutesIndex {
	type bucket struct {
		pages []institutesIndexEntry
	}

	groups := map[outlineKey]*bucket{}
	var orderKeys []outlineKey

	liber := ""
	caput := "" // current Caput roman, or "Argumentum"

	appendPage := func(k outlineKey, s institutesIndexEntry) {
		b, ok := groups[k]
		if !ok {
			b = &bucket{}
			groups[k] = b
			orderKeys = append(orderKeys, k)
		}
		b.pages = append(b.pages, s)
	}

	for _, s := range latin.Sections {
		h := strings.TrimSpace(s.Heading)
		switch {
		case liberTertiusRe.MatchString(h):
			if liber != "III" {
				liber = "III"
				caput = ""
				continue
			}
			if caput != "" {
				appendPage(outlineKey{liber, caput}, s)
			}
			continue
		case liberQuartusRe.MatchString(h):
			if liber != "IV" {
				liber = "IV"
				caput = ""
				continue
			}
			// Running header mid-book — do not reset Caput; keep page with current chapter.
			if caput != "" {
				appendPage(outlineKey{liber, caput}, s)
			}
			continue
		case argumentumOnlyRe.MatchString(h):
			if liber == "" {
				continue
			}
			caput = "Argumentum"
			appendPage(outlineKey{liber, caput}, s)
			continue
		}

		if m := caputHeadingRe.FindStringSubmatch(h); m != nil {
			roman := normalizeRomanOCR(m[1])
			if roman == "" || liber == "" {
				if liber != "" && caput != "" {
					appendPage(outlineKey{liber, caput}, s)
				}
				continue
			}
			if !acceptCaputAdvance(caput, roman) {
				if caput != "" {
					appendPage(outlineKey{liber, caput}, s)
				}
				continue
			}
			caput = roman
			appendPage(outlineKey{liber, caput}, s)
			continue
		}

		if liber != "" && caput != "" {
			appendPage(outlineKey{liber, caput}, s)
		}
	}

	sort.SliceStable(orderKeys, func(i, j int) bool {
		return outlineLess(orderKeys[i], orderKeys[j])
	})

	out := institutesIndex{
		SchemaVersion: latin.SchemaVersion,
		SourceSha256:  latin.SourceSha256,
		Sections:      make([]institutesIndexEntry, 0, len(orderKeys)),
	}
	for _, k := range orderKeys {
		pages := groups[k].pages
		if len(pages) == 0 {
			continue
		}
		first := pages[0]
		book := k.liber
		first.Book = &book
		first.Heading = outlineHeading(k.liber, k.caput)
		pageIDs := make([]string, 0, len(pages))
		for _, p := range pages {
			pageIDs = append(pageIDs, p.ID)
		}
		first.Pages = pageIDs
		out.Sections = append(out.Sections, first)
	}
	out.SectionCount = len(out.Sections)
	return out
}

func outlineHeading(liber, caput string) string {
	if caput == "Argumentum" {
		return "Liber " + liber + " · Argumentum"
	}
	return "Liber " + liber + " · Caput " + caput
}

func outlineLess(a, b outlineKey) bool {
	la, lb := liberRank(a.liber), liberRank(b.liber)
	if la != lb {
		return la < lb
	}
	return caputRank(a.caput) < caputRank(b.caput)
}

func liberRank(liber string) int {
	switch liber {
	case "III":
		return 0
	case "IV":
		return 1
	default:
		return 9
	}
}

func caputRank(caput string) int {
	if caput == "Argumentum" {
		return 0
	}
	if n, ok := romanValues[caput]; ok {
		return n
	}
	return 999
}

// acceptCaputAdvance allows same Caput, +1 Caput, or first Caput after liber/argumentum.
func acceptCaputAdvance(current, next string) bool {
	if current == "" || current == "Argumentum" {
		return true
	}
	if current == next {
		return true
	}
	curN, okC := romanValues[current]
	nextN, okN := romanValues[next]
	if !okC || !okN {
		return false
	}
	return nextN == curN+1
}

// normalizeRomanOCR repairs common OCR mangling of Caput numerals.
func normalizeRomanOCR(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, "Y", "V")
	// "caput in" is a frequent OCR of Caput III.
	if s == "IN" {
		return "III"
	}
	replacements := []struct{ bad, good string }{
		{"XXTIT", "XXIII"},
		{"XXIIL", "XXIII"},
		{"XXII1", "XXIII"},
		{"VIL", "VII"},
		{"XIY", "XIV"},
		{"IY", "IV"},
		{"IT", "II"},
	}
	for _, r := range replacements {
		if strings.HasPrefix(s, r.bad) {
			s = r.good + s[len(r.bad):]
			break
		}
	}
	var b strings.Builder
	for _, r := range s {
		if strings.ContainsRune("IVXLC", r) {
			b.WriteRune(r)
			continue
		}
		break
	}
	out := b.String()
	if _, ok := romanValues[out]; ok {
		return out
	}
	return ""
}
