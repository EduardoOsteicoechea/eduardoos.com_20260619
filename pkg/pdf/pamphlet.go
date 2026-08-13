package pdf

import (
	"fmt"
	"strings"
	"unicode"
)

// Letter landscape page size used by the pamphlet sheet (exact CSS mm).
const (
	PamphletPageWidthMm  = 279.4
	PamphletPageHeightMm = 215.9
	PamphletMarginMm     = 10.0
	PamphletGutterNarrow = 4.0
	PamphletGutterWide   = 10.0
	PamphletColWidthMm   = 60.35
	PamphletHeaderHMm    = 14.0
	PamphletFooterHMm    = 37.5
	PamphletPage1BodyMm  = 136.4
	PamphletPage2BodyMm  = 195.9
	PamphletItemGapMm    = 2.0
)

// PamphletDocument mirrors the frontend .epam pamphlet_single_sheet JSON body.
type PamphletDocument struct {
	Type   string         `json:"type"`
	Header PamphletHeader `json:"header"`
	Footer PamphletFooter `json:"footer"`
	Column1 []PamphletItem `json:"column_1"`
	Column2 []PamphletItem `json:"column_2"`
	Column3 []PamphletItem `json:"column_3"`
	Column4 []PamphletItem `json:"column_4"`
	Column5 []PamphletItem `json:"column_5"`
	Column6 []PamphletItem `json:"column_6"`
	Column7 []PamphletItem `json:"column_7"`
	Column8 []PamphletItem `json:"column_8"`
}

type PamphletHeader struct {
	Title         string `json:"title"`
	Subtitle      string `json:"subtitle"`
	Author        string `json:"author"`
	Series        string `json:"series"`
	SeriesChapter string `json:"series_chapter"`
	Date          string `json:"date"`
}

type PamphletFooter struct {
	Items []PamphletItem `json:"items"`
}

type PamphletItem struct {
	Type         string     `json:"type"`
	Content      string     `json:"content"`
	StyleIndexes [][]int    `json:"style_indexes"`
	HeightMm     float64    `json:"height_mm"`
}

type pdfBuilder struct {
	objects []string
}

func (b *pdfBuilder) add(obj string) int {
	b.objects = append(b.objects, obj)
	return len(b.objects)
}

func (b *pdfBuilder) bytes() []byte {
	pdf := "%PDF-1.4\n"
	offsets := make([]int, 0, len(b.objects)+1)
	offsets = append(offsets, 0)
	for _, obj := range b.objects {
		offsets = append(offsets, len(pdf))
		pdf += obj
	}
	xref := len(pdf)
	pdf += fmt.Sprintf("xref\n0 %d\n", len(b.objects)+1)
	pdf += "0000000000 65535 f \n"
	for _, off := range offsets[1:] {
		pdf += fmt.Sprintf("%010d 00000 n \n", off)
	}
	pdf += fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(b.objects)+1, xref)
	return []byte(pdf)
}

// BuildPamphletPDF renders a two-page US Letter landscape PDF using the same
// mm geometry as the frontend pamphlet sheet (279.4 × 215.9 mm per page).
func BuildPamphletPDF(doc PamphletDocument) []byte {
	pageW := MmToPoints(PamphletPageWidthMm)
	pageH := MmToPoints(PamphletPageHeightMm)

	var b pdfBuilder
	// 1 Catalog, 2 Pages, 3 Font Helvetica, 4 Font Helvetica-Bold
	b.add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
	b.add("2 0 obj\n<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>\nendobj\n")
	b.add("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n")
	b.add("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n")

	content1 := buildPage1Content(doc)
	content2 := buildPage2Content(doc)

	b.add(fmt.Sprintf("5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents 6 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n", pageW, pageH))
	b.add(fmt.Sprintf("6 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n", len(content1), content1))
	b.add(fmt.Sprintf("7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents 8 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n", pageW, pageH))
	b.add(fmt.Sprintf("8 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n", len(content2), content2))

	return b.bytes()
}

func colX(track int) float64 {
	// CSS grid content tracks 2,4,6,8 → columns left→right
	switch track {
	case 2:
		return PamphletMarginMm
	case 4:
		return PamphletMarginMm + PamphletColWidthMm + PamphletGutterNarrow
	case 6:
		return PamphletMarginMm + PamphletColWidthMm + PamphletGutterNarrow + PamphletColWidthMm + PamphletGutterWide
	case 8:
		return PamphletMarginMm + PamphletColWidthMm + PamphletGutterNarrow + PamphletColWidthMm + PamphletGutterWide + PamphletColWidthMm + PamphletGutterNarrow
	default:
		return PamphletMarginMm
	}
}

func buildPage1Content(doc PamphletDocument) string {
	var s strings.Builder
	// Header over cols 1–2 (tracks 6–8), top band
	headerX := colX(6)
	headerTop := PamphletPageHeightMm - PamphletMarginMm
	drawHeader(&s, doc.Header, headerX, headerTop, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletHeaderHMm)

	// Cols 7–8 under/near header on left: top after margin
	leftTop := PamphletPageHeightMm - PamphletMarginMm
	drawColumn(&s, doc.Column7, colX(2), leftTop, PamphletColWidthMm, 154.4)
	drawColumn(&s, doc.Column8, colX(4), leftTop, PamphletColWidthMm, 154.4)

	// Cols 1–2 on right under header
	rightTop := PamphletPageHeightMm - PamphletMarginMm - PamphletHeaderHMm - PamphletGutterNarrow
	drawColumn(&s, doc.Column1, colX(6), rightTop, PamphletColWidthMm, 177.9)
	drawColumn(&s, doc.Column2, colX(8), rightTop, PamphletColWidthMm, 177.9)

	// Footer under cols 7–8
	footerTop := PamphletMarginMm + PamphletFooterHMm
	drawFooter(&s, doc.Footer.Items, colX(2), footerTop, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletFooterHMm)
	return s.String()
}

func buildPage2Content(doc PamphletDocument) string {
	var s strings.Builder
	top := PamphletPageHeightMm - PamphletMarginMm
	h := PamphletPage2BodyMm
	drawColumn(&s, doc.Column3, colX(2), top, PamphletColWidthMm, h)
	drawColumn(&s, doc.Column4, colX(4), top, PamphletColWidthMm, h)
	drawColumn(&s, doc.Column5, colX(6), top, PamphletColWidthMm, h)
	drawColumn(&s, doc.Column6, colX(8), top, PamphletColWidthMm, h)
	return s.String()
}

func drawHeader(s *strings.Builder, h PamphletHeader, x, top, width, heightMm float64) {
	y := top - 4.5
	writeText(s, "F2", 14, x, y, width, h.Title)
	y -= 3.5
	meta := strings.TrimSpace(strings.Join([]string{
		nonEmpty(h.Subtitle),
		nonEmpty(h.Author),
		nonEmpty(h.Series),
		nonEmpty(h.SeriesChapter),
		nonEmpty(h.Date),
	}, "  ·  "))
	if meta != "" {
		writeText(s, "F1", 7, x, y, width, meta)
	}
	_ = heightMm
}

func drawFooter(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64) {
	y := top - 3
	for _, item := range items {
		if item.Type == "image" {
			y -= maxFloat(item.HeightMm, 10) + PamphletItemGapMm
			continue
		}
		size := 7.0
		font := "F1"
		if item.Type == "heading_1" {
			size = 9
			font = "F2"
		}
		used := writeWrapped(s, font, size, x, y, width, item.Content, top-heightMm)
		y -= used + PamphletItemGapMm
		if y < top-heightMm {
			break
		}
	}
}

func drawColumn(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64) {
	y := top - 2.5
	floor := top - heightMm
	for _, item := range items {
		if y <= floor {
			break
		}
		if item.Type == "image" {
			h := item.HeightMm
			if h < 10 {
				h = 10
			}
			// Placeholder frame for images (exact height reservation).
			bx := MmToPoints(x)
			by := MmToPoints(y - h)
			bw := MmToPoints(width)
			bh := MmToPoints(h)
			s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f re S\n", bx, by, bw, bh))
			writeText(s, "F1", 7, x+1, y-4, width-2, "[imagen]")
			y -= h + PamphletItemGapMm
			continue
		}
		size := 7.1 // ~2.5mm body
		font := "F1"
		if item.Type == "heading_1" {
			size = 10.6 // ~3.75mm
			font = "F2"
		}
		// Bold range: if style_indexes[0] spans full/partial, still same size (F2 for whole line if any bold).
		if hasBold(item) && item.Type != "heading_1" {
			font = "F2"
			size = 7.1
		}
		used := writeWrapped(s, font, size, x, y, width, item.Content, floor)
		y -= used + PamphletItemGapMm
	}
}

func hasBold(item PamphletItem) bool {
	if len(item.StyleIndexes) == 0 || len(item.StyleIndexes[0]) < 2 {
		return false
	}
	a, b := item.StyleIndexes[0][0], item.StyleIndexes[0][1]
	return b > a
}

func writeText(s *strings.Builder, font string, sizePt float64, xMm, yMm, widthMm float64, text string) {
	_ = widthMm
	text = sanitizePDFText(text)
	if text == "" {
		return
	}
	s.WriteString(fmt.Sprintf("BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n",
		font, sizePt, MmToPoints(xMm), MmToPoints(yMm), escape(text)))
}

func writeWrapped(s *strings.Builder, font string, sizePt float64, xMm, yMm, widthMm float64, text string, floorMm float64) float64 {
	text = strings.TrimSpace(sanitizePDFText(text))
	if text == "" {
		return 0
	}
	// Approx char width ~0.5 * size in points → convert to mm budget.
	maxChars := int(widthMm / (sizePt * 0.35 * 25.4 / 72.0))
	if maxChars < 8 {
		maxChars = 8
	}
	lines := wrapWords(text, maxChars)
	lineH := sizePt * 1.25 * 25.4 / 72.0 // mm
	used := 0.0
	y := yMm
	for _, line := range lines {
		if y-lineH < floorMm {
			break
		}
		s.WriteString(fmt.Sprintf("BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n",
			font, sizePt, MmToPoints(xMm), MmToPoints(y), escape(line)))
		y -= lineH
		used += lineH
	}
	return used
}

func wrapWords(text string, maxChars int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	var cur strings.Builder
	for _, w := range words {
		if cur.Len() == 0 {
			cur.WriteString(w)
			continue
		}
		if cur.Len()+1+len(w) > maxChars {
			lines = append(lines, cur.String())
			cur.Reset()
			cur.WriteString(w)
			continue
		}
		cur.WriteByte(' ')
		cur.WriteString(w)
	}
	if cur.Len() > 0 {
		lines = append(lines, cur.String())
	}
	return lines
}

func sanitizePDFText(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			b.WriteByte(' ')
		case r > 255:
			// Drop unsupported glyphs for WinAnsi Type1 path.
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				b.WriteByte('?')
			}
		default:
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func nonEmpty(s string) string {
	return strings.TrimSpace(s)
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
