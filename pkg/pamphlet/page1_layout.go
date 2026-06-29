package pamphlet

import "math"

// Page1Layout holds explicit mm dimensions for sheet 1 (outer face of the pamphlet).
//
// Reading order: right half = front (outside), left half = back.
// The header spans the full content width between lateral margins; body columns
// flow inside measured-height regions below (front) or above the footer (back).
type Page1Layout struct {
	ContentWidthMM    float64
	ContentHeightMM   float64
	HeaderHeightMM    float64
	FooterHeightMM    float64
	HalvesHeightMM    float64
	FrontBodyHeightMM float64
	BackBodyHeightMM  float64
	HalfWidthMM       float64
	ColumnWidthMM     float64
	HFGapMM           float64
	BodyTopYMM        float64
}

// ComputePage1Layout measures header/footer at full content width, then derives
// the remaining body heights for the two-column regions on each half.
func ComputePage1Layout(cfg LayoutConfig, header HeaderPayload, footer FooterPayload) Page1Layout {
	contentW := contentWidthMM(cfg)
	contentH := contentHeightMM(cfg)
	halfW := blockWidthMM(cfg)
	colW := columnWidthMM(cfg)
	gap := cfg.HeaderFooterGapMM

	headerH := MeasureHeaderZoneHeightMM(header, contentW, cfg.FontSizePt, cfg.LineHeightFactor)
	if headerH < 0 {
		headerH = 0
	}

	footerH := MeasureFooterZoneHeightMM(footer, contentW, cfg.FontSizePt, cfg.LineHeightFactor)
	if footerH < 0 {
		footerH = 0
	}

	halvesH := contentH - headerH - gap
	if halvesH < 0 {
		halvesH = 0
	}

	frontBodyH := halvesH
	backBodyH := halvesH - gap - footerH
	if backBodyH < 0 {
		backBodyH = 0
	}

	bodyTopY := contentBottomYMM(cfg) + headerH + gap

	return Page1Layout{
		ContentWidthMM:    contentW,
		ContentHeightMM:   contentH,
		HeaderHeightMM:    headerH,
		FooterHeightMM:    footerH,
		HalvesHeightMM:    halvesH,
		FrontBodyHeightMM: frontBodyH,
		BackBodyHeightMM:  backBodyH,
		HalfWidthMM:       halfW,
		ColumnWidthMM:     colW,
		HFGapMM:           gap,
		BodyTopYMM:        bodyTopY,
	}
}

// footerBandHeightMM returns measured footer height capped by layout fraction.
func footerBandHeightMM(cfg LayoutConfig, footer FooterPayload) float64 {
	measured := MeasureFooterZoneHeightMM(footer, contentWidthMM(cfg), cfg.FontSizePt, cfg.LineHeightFactor)
	cap := footerHeightMM(cfg)
	if measured <= 0 {
		return 0
	}
	return math.Min(cap, measured)
}
