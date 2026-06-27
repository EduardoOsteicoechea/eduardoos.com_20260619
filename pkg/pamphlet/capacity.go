package pamphlet

import (
	"fmt"
	"math"
)

func columnCapacityPX(widthMM, heightMM, fontSizePt, lineHeightFactor float64) int {
	wPx := widthMM * MmToPx
	hPx := heightMM * MmToPx
	fontPx := fontSizePt * (4.0 / 3.0)
	avgCharPx := fontPx * 0.55
	if avgCharPx <= 0 {
		return 0
	}
	chars := int(math.Floor(wPx / avgCharPx))
	linePx := fontPx * lineHeightFactor
	if linePx <= 0 {
		return 0
	}
	rows := int(math.Floor(hPx / linePx))
	return chars * rows
}

// EightColumnCapacities returns per-column character capacities for all eight flow columns.
func EightColumnCapacities(cfg LayoutConfig, header HeaderPayload, footer FooterPayload) []int {
	rects := EightColumnRects(cfg, header, footer)
	out := make([]int, len(rects))
	for i, rect := range rects {
		out[i] = columnCapacityPX(rect.WidthMM, rect.HeightMM, cfg.FontSizePt, cfg.LineHeightFactor)
	}
	return out
}

// CapacityTelemetry bundles sidebar capacity readout data for the editor UI.
type CapacityTelemetry struct {
	Characters        int    `json:"characters"`
	ContentLength     int    `json:"content_length"`
	OverflowChars     int    `json:"overflow_characters"`
	OverflowWords     int    `json:"overflow_words"`
	Columns           []int  `json:"columns"`
	Readout           string `json:"readout"`
	ReadoutHTML       string `json:"readout_html"`
	Warning           string `json:"warning"`
	ColumnSummary     string `json:"column_summary"`
}

// ComputeCapacityTelemetry calculates structural capacity vs current document content length.
func ComputeCapacityTelemetry(cfg LayoutConfig, doc Document) CapacityTelemetry {
	columns := EightColumnCapacities(cfg, doc.Header, doc.Footer)
	maxChars := 0
	for _, c := range columns {
		maxChars += c
	}
	blocks := FlattenContent(doc.Content, doc.Header)
	contentLen := ContentLength(blocks)
	excess := 0
	if contentLen > maxChars {
		excess = contentLen - maxChars
	}
	excessWords := 0
	if excess > 0 {
		excessWords = int(math.Round(float64(excess) / CharsPerWord))
	}
	words := int(math.Round(float64(maxChars) / CharsPerWord))
	readout := fmt.Sprintf("Max Capacity: ~%s characters (~%s words)", formatInt(maxChars), formatInt(words))
	currentWords := int(math.Round(float64(contentLen) / CharsPerWord))
	safeClass := "capacity-safe"
	if contentLen > maxChars {
		safeClass = "capacity-over"
	}
	readoutHTML := fmt.Sprintf(
		`<span class="capacity-max">Max: ~%s chars (~%s words)</span>`+
			`<span class="capacity-sep"> · </span>`+
			`<span class="capacity-current %s">Current: ~%s chars (~%s words)</span>`,
		formatInt(maxChars), formatInt(words), safeClass, formatInt(contentLen), formatInt(currentWords),
	)
	warning := ""
	if excess > 0 {
		warning = fmt.Sprintf("Overflow: ~%s characters (~%s words) over capacity", formatInt(excess), formatInt(excessWords))
	}
	summaryParts := make([]string, len(columns))
	for i, v := range columns {
		summaryParts[i] = fmt.Sprintf("C%d: %s", i+1, formatInt(v))
	}
	return CapacityTelemetry{
		Characters: maxChars, ContentLength: contentLen, OverflowChars: excess, OverflowWords: excessWords,
		Columns: columns, Readout: readout, ReadoutHTML: readoutHTML, Warning: warning,
		ColumnSummary: joinPipe(summaryParts),
	}
}

func formatInt(n int) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	s := fmt.Sprintf("%d", n)
	// simple thousands separator
	var out []byte
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, byte(c))
	}
	return string(out)
}

func joinPipe(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " | "
		}
		out += p
	}
	return out
}
