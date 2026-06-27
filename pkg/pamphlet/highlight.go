package pamphlet

import (
	"html"
	"strings"
)

// RenderHighlightedText returns escaped text with bold spans for highlight ranges.
func RenderHighlightedText(text string, highlights []HighlightRange) string {
	ranges := normalizeRanges(text, highlights)
	if len(ranges) == 0 {
		return html.EscapeString(text)
	}
	var b strings.Builder
	cursor := 0
	for _, pair := range ranges {
		if pair[0] > cursor {
			b.WriteString(html.EscapeString(text[cursor:pair[0]]))
		}
		b.WriteString(`<strong class="content-highlight">`)
		b.WriteString(html.EscapeString(text[pair[0]:pair[1]]))
		b.WriteString(`</strong>`)
		cursor = pair[1]
	}
	if cursor < len(text) {
		b.WriteString(html.EscapeString(text[cursor:]))
	}
	return b.String()
}

func normalizeRanges(text string, highlights []HighlightRange) [][2]int {
	length := len(text)
	out := make([][2]int, 0, len(highlights))
	for _, item := range highlights {
		start := item.Start
		end := item.End
		if start < 0 {
			start = 0
		}
		if start > length {
			start = length
		}
		if end < start {
			end = start
		}
		if end > length {
			end = length
		}
		if end > start {
			out = append(out, [2]int{start, end})
		}
	}
	return out
}
