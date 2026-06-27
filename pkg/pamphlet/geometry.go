package pamphlet

import "math"

func contentWidthMM(cfg LayoutConfig) float64 {
	return cfg.pageWidthMM() - (2 * cfg.MarginLateralMM)
}

func contentHeightMM(cfg LayoutConfig) float64 {
	return cfg.pageHeightMM() - (2 * cfg.MarginVerticalMM)
}

func blockWidthMM(cfg LayoutConfig) float64 {
	return (contentWidthMM(cfg) - cfg.MidSeparationMM) / 2
}

func columnWidthMM(cfg LayoutConfig) float64 {
	gaps := math.Max(float64(cfg.ColumnsPerBlock-1), 0)
	return (blockWidthMM(cfg) - gaps*cfg.ColumnGapMM) / float64(cfg.ColumnsPerBlock)
}

func headerHeightMM(cfg LayoutConfig) float64 {
	return contentHeightMM(cfg) * cfg.HeaderFraction
}

func footerHeightMM(cfg LayoutConfig) float64 {
	return contentHeightMM(cfg) * cfg.FinalInfoFraction
}

func sheet1RightBodyHeightMM(cfg LayoutConfig, header HeaderPayload) float64 {
	contentH := contentHeightMM(cfg)
	maxHeader := headerHeightMM(cfg)
	gap := cfg.HeaderFooterGapMM
	usedHeader := math.Min(maxHeader, MeasureHeaderZoneHeightMM(header, blockWidthMM(cfg), cfg.FontSizePt, cfg.LineHeightFactor))
	return contentH - usedHeader - gap
}

func sheet1LeftBodyHeightMM(cfg LayoutConfig, footer FooterPayload) float64 {
	contentH := contentHeightMM(cfg)
	maxFooter := footerHeightMM(cfg)
	gap := cfg.HeaderFooterGapMM
	usedFooter := math.Min(maxFooter, MeasureFooterZoneHeightMM(footer, blockWidthMM(cfg), cfg.FontSizePt, cfg.LineHeightFactor))
	return contentH - usedFooter - gap
}

func contentBottomYMM(cfg LayoutConfig) float64 {
	return cfg.MarginVerticalMM
}

func leftBlockXMM(cfg LayoutConfig) float64 {
	return cfg.MarginLateralMM
}

func rightBlockXMM(cfg LayoutConfig) float64 {
	return cfg.MarginLateralMM + blockWidthMM(cfg) + cfg.MidSeparationMM
}

func columnX(blockX float64, col int, cfg LayoutConfig) float64 {
	return blockX + float64(col)*(columnWidthMM(cfg)+cfg.ColumnGapMM)
}

// EightColumnRects returns all eight body column rects in V5 content-flow order.
func EightColumnRects(cfg LayoutConfig, header HeaderPayload, footer FooterPayload) []RegionRect {
	colW := columnWidthMM(cfg)
	rects := make([]RegionRect, 0, 8)

	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(rightBlockXMM(cfg), col, cfg), YMM: contentBottomYMM(cfg),
			WidthMM: colW, HeightMM: sheet1RightBodyHeightMM(cfg, header),
			Label: EightColumnFlowLabels[col],
		})
	}
	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(leftBlockXMM(cfg), col, cfg), YMM: contentBottomYMM(cfg),
			WidthMM: colW, HeightMM: contentHeightMM(cfg),
			Label: EightColumnFlowLabels[2+col],
		})
	}
	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(rightBlockXMM(cfg), col, cfg), YMM: contentBottomYMM(cfg),
			WidthMM: colW, HeightMM: contentHeightMM(cfg),
			Label: EightColumnFlowLabels[4+col],
		})
	}
	footerBand := footerHeightMM(cfg)
	if footer.Heading != "" || len(footer.ContactItems) > 0 {
		footerBand = math.Min(footerBand, MeasureFooterZoneHeightMM(footer, blockWidthMM(cfg), cfg.FontSizePt, cfg.LineHeightFactor))
	}
	yLeft := contentBottomYMM(cfg) + footerBand + cfg.HeaderFooterGapMM
	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(leftBlockXMM(cfg), col, cfg), YMM: yLeft,
			WidthMM: colW, HeightMM: sheet1LeftBodyHeightMM(cfg, footer),
			Label: EightColumnFlowLabels[6+col],
		})
	}
	return rects
}
