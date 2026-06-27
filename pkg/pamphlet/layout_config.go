package pamphlet

import (
	"net/url"
	"strconv"
)

// LayoutConfig holds user-adjustable pamphlet layout and typography parameters.
type LayoutConfig struct {
	Orientation                 string  `json:"orientation"`
	MarginLateralMM             float64 `json:"margin_lateral_mm"`
	MarginVerticalMM            float64 `json:"margin_vertical_mm"`
	MidSeparationMM             float64 `json:"mid_separation_mm"`
	ColumnGapMM                 float64 `json:"column_gap_mm"`
	HeaderFooterGapMM           float64 `json:"header_footer_gap_mm"`
	ColumnsPerBlock             int     `json:"columns_per_block"`
	FontSizePt                  float64 `json:"font_size_pt"`
	LineHeightFactor            float64 `json:"line_height_factor"`
	ParagraphSeparationFactor   float64 `json:"paragraph_separation_factor"`
	IdeaHeadingBottomMarginMM   float64 `json:"idea_heading_bottom_margin_mm"`
	FontName                    string  `json:"font_name"`
	HeaderFraction              float64 `json:"header_fraction"`
	FinalInfoFraction           float64 `json:"final_info_fraction"`
}

// DefaultLayoutConfig returns domain-default pamphlet settings.
func DefaultLayoutConfig() LayoutConfig {
	return LayoutConfig{
		Orientation:               "landscape",
		MarginLateralMM:           MarginLateralMM,
		MarginVerticalMM:          MarginVerticalMM,
		MidSeparationMM:           MidSeparationMM,
		ColumnGapMM:               ColumnGapMM,
		HeaderFooterGapMM:         HeaderFooterGapMM,
		ColumnsPerBlock:           ColumnsPerBlock,
		FontSizePt:                DefaultFontSizePt,
		LineHeightFactor:          DefaultLineHeightFactor,
		ParagraphSeparationFactor: DefaultParagraphSepFactor,
		IdeaHeadingBottomMarginMM: IdeaHeadingBottomMarginMM,
		FontName:                  "Helvetica",
		HeaderFraction:            HeaderFraction,
		FinalInfoFraction:         FinalInfoFraction,
	}
}

// LayoutConfigFromQuery parses layout fields from URL query values (camelCase keys from the editor).
func LayoutConfigFromQuery(q url.Values) LayoutConfig {
	cfg := DefaultLayoutConfig()
	if v := q.Get("marginLateral"); v != "" {
		cfg.MarginLateralMM = parseFloat(v, cfg.MarginLateralMM)
	}
	if v := q.Get("marginVertical"); v != "" {
		cfg.MarginVerticalMM = parseFloat(v, cfg.MarginVerticalMM)
	}
	if v := q.Get("midMargin"); v != "" {
		cfg.MidSeparationMM = parseFloat(v, cfg.MidSeparationMM)
	}
	if v := q.Get("colSep"); v != "" {
		cfg.ColumnGapMM = parseFloat(v, cfg.ColumnGapMM)
	}
	if v := q.Get("hfGap"); v != "" {
		cfg.HeaderFooterGapMM = parseFloat(v, cfg.HeaderFooterGapMM)
	}
	if v := q.Get("fontSize"); v != "" {
		cfg.FontSizePt = parseFloat(v, cfg.FontSizePt)
	}
	if v := q.Get("lineHeight"); v != "" {
		cfg.LineHeightFactor = parseFloat(v, cfg.LineHeightFactor)
	}
	if v := q.Get("paragraphSep"); v != "" {
		cfg.ParagraphSeparationFactor = parseFloat(v, cfg.ParagraphSeparationFactor)
	}
	if v := q.Get("headingBottomMargin"); v != "" {
		cfg.IdeaHeadingBottomMarginMM = parseFloat(v, cfg.IdeaHeadingBottomMarginMM)
	}
	return cfg
}

func parseFloat(raw string, fallback float64) float64 {
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return v
}

func (c LayoutConfig) pageWidthMM() float64 {
	if c.Orientation == "portrait" {
		return PageHeightMM
	}
	return PageWidthMM
}

func (c LayoutConfig) pageHeightMM() float64 {
	if c.Orientation == "portrait" {
		return PageWidthMM
	}
	return PageHeightMM
}
