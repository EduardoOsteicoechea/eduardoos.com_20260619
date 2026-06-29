package pamphlet

import (
	"math"
	"strings"
)

// CountWrappedLines estimates how many wrapped lines text requires.
func CountWrappedLines(text string, charsPerLine int) int {
	if text == "" || charsPerLine <= 0 {
		return 0
	}
	words := strings.Fields(strings.ReplaceAll(text, "\n", " "))
	lines := 0
	current := ""
	for _, word := range words {
		candidate := word
		if current != "" {
			candidate = current + " " + word
		}
		if len(candidate) <= charsPerLine {
			current = candidate
			continue
		}
		if current != "" {
			lines++
		}
		current = word
	}
	if current != "" {
		lines++
	}
	return lines
}

// CharsPerLineForWidth estimates characters per line from column width and font size.
func CharsPerLineForWidth(columnWidthMM, fontSizePt float64) int {
	avgCharMM := fontSizePt * 0.3528 * TextCharWidthFactor
	if avgCharMM <= 0 {
		return 0
	}
	return int(math.Floor(columnWidthMM / avgCharMM))
}

// LineHeightMM returns one line of leading expressed in millimeters.
func LineHeightMM(fontSizePt, lineHeightFactor float64) float64 {
	return fontSizePt * 0.3528 * lineHeightFactor
}

// MeasureTextHeightMM returns vertical space in mm for wrapped plain text.
func MeasureTextHeightMM(text string, columnWidthMM, fontSizePt, lineHeightFactor float64) float64 {
	chars := CharsPerLineForWidth(columnWidthMM, fontSizePt)
	lines := CountWrappedLines(text, chars)
	raw := float64(lines) * LineHeightMM(fontSizePt, lineHeightFactor)
	return raw * HeightMeasureCalibration
}

// MeasureBlockHeightMM returns total vertical mm consumed by any layout block type.
func MeasureBlockHeightMM(block LayoutBlock, columnWidthMM, fontSizePt, lineHeightFactor, headingBottomMarginMM float64) float64 {
	switch block.Kind {
	case BlockHeading:
		headingFont := fontSizePt * 1.25
		return MeasureTextHeightMM(block.Text, columnWidthMM, headingFont, lineHeightFactor) + math.Max(0, headingBottomMarginMM)
	case BlockParagraph:
		return MeasureTextHeightMM(block.Text, columnWidthMM, fontSizePt, lineHeightFactor)
	case BlockList:
		total := 0.0
		for _, item := range block.ListItems {
			total += MeasureTextHeightMM(item.Text, columnWidthMM, fontSizePt, lineHeightFactor)
		}
		return total
	case BlockQuote:
		body := MeasureTextHeightMM(block.Text, columnWidthMM, fontSizePt, lineHeightFactor)
		if len(block.References) == 0 {
			return body
		}
		refs := strings.Join(block.References, " ")
		return body + MeasureTextHeightMM(refs, columnWidthMM, fontSizePt*0.85, lineHeightFactor)
	case BlockImage:
		ratio := block.AspectRatio
		if ratio <= 0 {
			ratio = 16.0 / 9.0
		}
		return columnWidthMM / ratio
	default:
		return 0
	}
}

// ParagraphSeparationMM returns margin-bottom between blocks: one line height × factor.
func ParagraphSeparationMM(fontSizePt, lineHeightFactor, separationFactor float64) float64 {
	return LineHeightMM(fontSizePt, lineHeightFactor) * separationFactor
}

// LastParagraphIndex returns the index of the last paragraph block in a column slice.
func LastParagraphIndex(blocks []LayoutBlock) int {
	for i := len(blocks) - 1; i >= 0; i-- {
		if blocks[i].Kind == BlockParagraph {
			return i
		}
	}
	return -1
}

func trailingBlockSeparation(slot *ColumnSlot, separationMM float64) float64 {
	if len(slot.Blocks) == 0 {
		return 0
	}
	if slot.Blocks[len(slot.Blocks)-1].Kind == BlockHeading {
		return 0
	}
	return separationMM
}

// MeasureHeaderZoneHeightMM estimates header band content height in mm.
func MeasureHeaderZoneHeightMM(payload HeaderPayload, blockWidthMM, fontSizePt, lineHeightFactor float64) float64 {
	if payload.Text != "" {
		return MeasureTextHeightMM(payload.Text, blockWidthMM, fontSizePt, lineHeightFactor)
	}
	total := 0.0
	if payload.Heading != "" {
		total += MeasureTextHeightMM(payload.Heading, blockWidthMM, fontSizePt*1.15, lineHeightFactor)
	}
	if payload.Subheading != "" {
		total += MeasureTextHeightMM(payload.Subheading, blockWidthMM, fontSizePt*0.95, lineHeightFactor)
	}
	meta := make([]string, 0, 3)
	if payload.Author != "" {
		meta = append(meta, payload.Author)
	}
	if payload.Date != "" {
		meta = append(meta, payload.Date)
	}
	if payload.Category != "" {
		meta = append(meta, payload.Category)
	}
	if len(meta) > 0 {
		total += MeasureTextHeightMM(strings.Join(meta, " · "), blockWidthMM, fontSizePt*0.8, lineHeightFactor)
	}
	return total
}

// MeasureFooterZoneHeightMM estimates footer band content height in mm.
func MeasureFooterZoneHeightMM(payload FooterPayload, blockWidthMM, fontSizePt, lineHeightFactor float64) float64 {
	if payload.Text != "" {
		return MeasureTextHeightMM(payload.Text, blockWidthMM, fontSizePt, lineHeightFactor)
	}
	total := 0.0
	if payload.Heading != "" {
		total += MeasureTextHeightMM(payload.Heading, blockWidthMM, fontSizePt*1.1, lineHeightFactor)
	}
	for _, item := range payload.ContactItems {
		line := strings.TrimSpace(item.Type + ": " + item.Value)
		if line != ":" {
			total += MeasureTextHeightMM(line, blockWidthMM, fontSizePt*0.9, lineHeightFactor)
		}
	}
	if payload.AddressData.Message != "" || payload.AddressData.Address != "" {
		addr := strings.TrimSpace(payload.AddressData.Message + " " + payload.AddressData.Address)
		total += MeasureTextHeightMM(addr, blockWidthMM, fontSizePt*0.9, lineHeightFactor)
	}
	return total
}
