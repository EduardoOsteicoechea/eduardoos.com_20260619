package pamphlet

import (
	"math"
	"strings"
)

// SplitParagraph splits text at the last visible word that fits within maxHeightMM.
func SplitParagraph(text string, maxHeightMM, columnWidthMM, fontSizePt, lineHeightFactor float64) (fit, rest string) {
	if text == "" || maxHeightMM <= 0 {
		return "", text
	}
	if MeasureTextHeightMM(text, columnWidthMM, fontSizePt, lineHeightFactor) <= maxHeightMM {
		return text, ""
	}
	chars := CharsPerLineForWidth(columnWidthMM, fontSizePt)
	lineH := LineHeightMM(fontSizePt, lineHeightFactor)
	maxLines := 0
	if lineH > 0 {
		maxLines = int(math.Floor(maxHeightMM / lineH))
	}
	if maxLines < 1 {
		return "", text
	}
	words := strings.Fields(strings.ReplaceAll(text, "\n", " "))
	if len(words) == 0 {
		return "", ""
	}
	lines := make([]string, 0, maxLines)
	idx := 0
	for idx < len(words) && len(lines) < maxLines {
		current := words[idx]
		idx++
		for idx < len(words) {
			candidate := current + " " + words[idx]
			if len(candidate) <= chars {
				current = candidate
				idx++
				continue
			}
			break
		}
		lines = append(lines, current)
	}
	fit = strings.Join(lines, " ")
	if idx < len(words) {
		rest = strings.Join(words[idx:], " ")
	}
	return fit, rest
}

// HighlightsForFragment maps highlight ranges onto a substring fragment.
func HighlightsForFragment(highlights []HighlightRange, offset, end int) []HighlightRange {
	out := make([]HighlightRange, 0)
	for _, h := range highlights {
		start := h.Start - offset
		stop := h.End - offset
		if stop <= 0 || start >= end-offset {
			continue
		}
		if start < 0 {
			start = 0
		}
		if stop > end-offset {
			stop = end - offset
		}
		if stop > start {
			out = append(out, HighlightRange{Start: start, End: stop})
		}
	}
	return out
}

// DistributeBlocksEightColumns flows layout objects through eight columns with paragraph breaks.
func DistributeBlocksEightColumns(
	blocks []LayoutBlock,
	columnWidthsMM, columnHeightsMM []float64,
	fontSizePt, lineHeightFactor, paragraphSeparationMM, headingBottomMarginMM float64,
) [][]LayoutBlock {
	if len(columnWidthsMM) != 8 || len(columnHeightsMM) != 8 {
		panic("pamphlet: eight column dimensions required")
	}
	slots := make([]*ColumnSlot, 8)
	for i := 0; i < 8; i++ {
		slots[i] = &ColumnSlot{
			Label: EightColumnFlowLabels[i], WidthMM: columnWidthsMM[i], HeightMM: columnHeightsMM[i],
		}
	}
	pending := append([]LayoutBlock(nil), blocks...)
	colIdx := 0
	for len(pending) > 0 && colIdx < 8 {
		slot := slots[colIdx]
		if slot.RemainingMM() <= 0 {
			colIdx++
			continue
		}
		block := pending[0]
		leading := trailingBlockSeparation(slot, paragraphSeparationMM)
		needed := leading + MeasureBlockHeightMM(block, slot.WidthMM, fontSizePt, lineHeightFactor, headingBottomMarginMM)
		if needed <= slot.RemainingMM() {
			pending = pending[1:]
			slot.Blocks = append(slot.Blocks, block)
			slot.UsedMM += needed
			continue
		}
		if block.Kind == BlockParagraph {
			fit, rest := SplitParagraph(block.Text, math.Max(0, slot.RemainingMM()-leading), slot.WidthMM, fontSizePt, lineHeightFactor)
			if fit != "" {
				pending = pending[1:]
				fitLen := len(fit)
				fullLen := len(block.Text)
				part := LayoutBlock{
					Kind: BlockParagraph, Text: fit, ContentRef: block.ContentRef,
					Highlights: HighlightsForFragment(block.Highlights, 0, fitLen),
				}
				slot.Blocks = append(slot.Blocks, part)
				slot.UsedMM += leading + MeasureBlockHeightMM(part, slot.WidthMM, fontSizePt, lineHeightFactor, headingBottomMarginMM)
				if rest != "" {
					pending = append([]LayoutBlock{{
						Kind: BlockParagraph, Text: rest, ContentRef: block.ContentRef,
						Highlights: HighlightsForFragment(block.Highlights, fitLen, fullLen),
					}}, pending...)
					nextLead := trailingBlockSeparation(slot, paragraphSeparationMM)
					restNeeded := nextLead + MeasureBlockHeightMM(pending[0], slot.WidthMM, fontSizePt, lineHeightFactor, headingBottomMarginMM)
					if restNeeded <= slot.RemainingMM() {
						continue
					}
				} else if slot.RemainingMM() > 0 {
					continue
				}
			}
		}
		colIdx++
	}
	out := make([][]LayoutBlock, 8)
	for i, slot := range slots {
		out[i] = slot.Blocks
	}
	return out
}
