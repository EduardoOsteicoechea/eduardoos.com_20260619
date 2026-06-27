package pamphlet

// selectionHasHighlight reports whether every character in [start,end) is already bold.
func selectionHasHighlight(highlights []HighlightRange, start, end int) bool {
	if end <= start {
		return false
	}
	covered := make([]bool, end-start)
	for _, h := range highlights {
		s := h.Start
		e := h.End
		if s < start {
			s = start
		}
		if e > end {
			e = end
		}
		for i := s; i < e; i++ {
			covered[i-start] = true
		}
	}
	for _, ok := range covered {
		if !ok {
			return false
		}
	}
	return true
}

// addHighlightRange merges a new span into existing highlight ranges.
func addHighlightRange(highlights []HighlightRange, start, end int) []HighlightRange {
	if end <= start {
		return highlights
	}
	merged := append(highlights, HighlightRange{Start: start, End: end})
	return mergeHighlightRanges(merged)
}

// subtractHighlightRange removes bold coverage inside [start,end).
func subtractHighlightRange(highlights []HighlightRange, start, end int) []HighlightRange {
	if end <= start || len(highlights) == 0 {
		return highlights
	}
	var out []HighlightRange
	for _, h := range highlights {
		if h.End <= start || h.Start >= end {
			out = append(out, h)
			continue
		}
		if h.Start < start {
			out = append(out, HighlightRange{Start: h.Start, End: start})
		}
		if h.End > end {
			out = append(out, HighlightRange{Start: end, End: h.End})
		}
	}
	return mergeHighlightRanges(out)
}

// ToggleTextHighlight toggles bold on the selected character span.
func ToggleTextHighlight(highlights []HighlightRange, start, end int) []HighlightRange {
	if end <= start {
		return highlights
	}
	if selectionHasHighlight(highlights, start, end) {
		return subtractHighlightRange(highlights, start, end)
	}
	return addHighlightRange(highlights, start, end)
}

func mergeHighlightRanges(ranges []HighlightRange) []HighlightRange {
	if len(ranges) == 0 {
		return nil
	}
	// Sort and merge overlapping spans without requiring source text length.
	pairs := make([][2]int, 0, len(ranges))
	for _, h := range ranges {
		if h.End > h.Start {
			pairs = append(pairs, [2]int{h.Start, h.End})
		}
	}
	if len(pairs) == 0 {
		return nil
	}
	for i := 0; i < len(pairs)-1; i++ {
		for j := i + 1; j < len(pairs); j++ {
			if pairs[j][0] < pairs[i][0] {
				pairs[i], pairs[j] = pairs[j], pairs[i]
			}
		}
	}
	merged := [][2]int{pairs[0]}
	for _, pair := range pairs[1:] {
		last := &merged[len(merged)-1]
		if pair[0] <= last[1] {
			if pair[1] > last[1] {
				last[1] = pair[1]
			}
			continue
		}
		merged = append(merged, pair)
	}
	out := make([]HighlightRange, len(merged))
	for i, pair := range merged {
		out[i] = HighlightRange{Start: pair[0], End: pair[1]}
	}
	return out
}

func ClampHighlights(node *[]HighlightRange, textLen int) {
	if node == nil || len(*node) == 0 {
		return
	}
	filtered := make([]HighlightRange, 0, len(*node))
	for _, h := range *node {
		start := h.Start
		end := h.End
		if start < 0 {
			start = 0
		}
		if start > textLen {
			start = textLen
		}
		if end < start {
			end = start
		}
		if end > textLen {
			end = textLen
		}
		if end > start {
			filtered = append(filtered, HighlightRange{Start: start, End: end})
		}
	}
	*node = filtered
}
