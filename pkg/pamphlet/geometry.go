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
	return ComputePage1Layout(cfg, header, FooterPayload{}).FrontBodyHeightMM
}

func sheet1LeftBodyHeightMM(cfg LayoutConfig, footer FooterPayload) float64 {
	return ComputePage1Layout(cfg, HeaderPayload{}, footer).BackBodyHeightMM
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
	p1 := ComputePage1Layout(cfg, header, footer)
	rects := make([]RegionRect, 0, 8)

	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(rightBlockXMM(cfg), col, cfg), YMM: p1.BodyTopYMM,
			WidthMM: colW, HeightMM: p1.FrontBodyHeightMM,
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
	yBack := p1.BodyTopYMM
	for col := 0; col < cfg.ColumnsPerBlock; col++ {
		rects = append(rects, RegionRect{
			XMM: columnX(leftBlockXMM(cfg), col, cfg), YMM: yBack,
			WidthMM: colW, HeightMM: p1.BackBodyHeightMM,
			Label: EightColumnFlowLabels[6+col],
		})
	}
	return rects
}
