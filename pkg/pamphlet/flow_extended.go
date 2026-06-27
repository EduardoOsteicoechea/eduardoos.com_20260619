package pamphlet

import "math"

// DistributeBlocksFlow fills columns in reading order and appends 4-column overflow pages.
func DistributeBlocksFlow(
	blocks []LayoutBlock,
	cfg LayoutConfig,
	header HeaderPayload,
	footer FooterPayload,
) [][]LayoutBlock {
	rects := EightColumnRects(cfg, header, footer)
	slots := make([]*ColumnSlot, len(rects))
	for i, r := range rects {
		label := EightColumnFlowLabels[i]
		slots[i] = &ColumnSlot{Label: label, WidthMM: r.WidthMM, HeightMM: r.HeightMM}
	}
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	pending := append([]LayoutBlock(nil), blocks...)
	colIdx := 0
	for len(pending) > 0 {
		if colIdx >= len(slots) {
			bodyH := contentHeightMM(cfg)
			colW := columnWidthMM(cfg)
			for c := 0; c < 4; c++ {
				_ = c
				slots = append(slots, &ColumnSlot{
					Label: "overflow", WidthMM: colW, HeightMM: bodyH,
				})
			}
		}
		slot := slots[colIdx]
		if slot.RemainingMM() <= 0 {
			colIdx++
			continue
		}
		block := pending[0]
		leading := trailingBlockSeparation(slot, paraSep)
		needed := leading + MeasureBlockHeightMM(block, slot.WidthMM, cfg.FontSizePt, cfg.LineHeightFactor, cfg.IdeaHeadingBottomMarginMM)
		if needed <= slot.RemainingMM() {
			pending = pending[1:]
			slot.Blocks = append(slot.Blocks, block)
			slot.UsedMM += needed
			continue
		}
		if block.Kind == BlockParagraph {
			fit, rest := SplitParagraph(block.Text, math.Max(0, slot.RemainingMM()-leading), slot.WidthMM, cfg.FontSizePt, cfg.LineHeightFactor)
			if fit != "" {
				pending = pending[1:]
				fitLen := len(fit)
				fullLen := len(block.Text)
				part := LayoutBlock{
					Kind: BlockParagraph, Text: fit, ContentRef: block.ContentRef,
					Highlights: HighlightsForFragment(block.Highlights, 0, fitLen),
				}
				slot.Blocks = append(slot.Blocks, part)
				slot.UsedMM += leading + MeasureBlockHeightMM(part, slot.WidthMM, cfg.FontSizePt, cfg.LineHeightFactor, cfg.IdeaHeadingBottomMarginMM)
				if rest != "" {
					pending = append([]LayoutBlock{{
						Kind: BlockParagraph, Text: rest, ContentRef: block.ContentRef,
						Highlights: HighlightsForFragment(block.Highlights, fitLen, fullLen),
					}}, pending...)
					nextLead := trailingBlockSeparation(slot, paraSep)
					restNeeded := nextLead + MeasureBlockHeightMM(pending[0], slot.WidthMM, cfg.FontSizePt, cfg.LineHeightFactor, cfg.IdeaHeadingBottomMarginMM)
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
	out := make([][]LayoutBlock, len(slots))
	for i, slot := range slots {
		out[i] = slot.Blocks
	}
	return out
}

func columnHasBlocks(blocks []LayoutBlock) bool {
	return len(blocks) > 0
}

func columnIsFull(blocks []LayoutBlock, heightMM, widthMM, fontSizePt, lh, paraSep, headingGap float64) bool {
	if !columnHasBlocks(blocks) {
		return false
	}
	used := 0.0
	slot := &ColumnSlot{WidthMM: widthMM, HeightMM: heightMM}
	for _, b := range blocks {
		lead := trailingBlockSeparation(slot, paraSep)
		need := lead + MeasureBlockHeightMM(b, widthMM, fontSizePt, lh, headingGap)
		used += need
		slot.Blocks = append(slot.Blocks, b)
	}
	return used >= heightMM*0.92
}

// sheet1RightFull reports when both sheet-1-right columns (0 and 1) are saturated.
func sheet1RightFull(distributed [][]LayoutBlock, heights []float64, cfg LayoutConfig) bool {
	if len(distributed) < 2 || len(heights) < 2 {
		return false
	}
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	colW := columnWidthMM(cfg)
	full0 := columnIsFull(distributed[0], heights[0], colW, cfg.FontSizePt, cfg.LineHeightFactor, paraSep, cfg.IdeaHeadingBottomMarginMM)
	full1 := columnIsFull(distributed[1], heights[1], colW, cfg.FontSizePt, cfg.LineHeightFactor, paraSep, cfg.IdeaHeadingBottomMarginMM)
	return full0 && full1
}

// sheet2HasContent reports when any sheet-2 column (indices 2–5) received blocks.
func sheet2HasContent(distributed [][]LayoutBlock) bool {
	for i := 2; i <= 5 && i < len(distributed); i++ {
		if columnHasBlocks(distributed[i]) {
			return true
		}
	}
	return false
}

// sheet1LeftHasContent reports when sheet-1-left columns (6–7) have blocks.
func sheet1LeftHasContent(distributed [][]LayoutBlock) bool {
	for i := 6; i <= 7 && i < len(distributed); i++ {
		if columnHasBlocks(distributed[i]) {
			return true
		}
	}
	return false
}

// overflowPageGroups returns groups of 4 column slices starting at index 8.
func overflowPageGroups(distributed [][]LayoutBlock) [][][]LayoutBlock {
	if len(distributed) <= 8 {
		return nil
	}
	groups := make([][][]LayoutBlock, 0)
	for i := 8; i < len(distributed); i += 4 {
		end := i + 4
		if end > len(distributed) {
			end = len(distributed)
		}
		group := make([][]LayoutBlock, 0, 4)
		for j := i; j < end; j++ {
			group = append(group, distributed[j])
		}
		for len(group) < 4 {
			group = append(group, nil)
		}
		groups = append(groups, group)
	}
	return groups
}
