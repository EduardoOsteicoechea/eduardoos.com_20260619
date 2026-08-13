package pdf

// Pamphlet PDF builder — raw PDF 1.4 byte streams (no external PDF libraries).
//
// Geometry matches the frontend sheet CSS exactly:
//   page  279.4mm × 215.9mm (US Letter landscape)
//   cols  60.35mm wide, gutters 4mm / 10mm, margins 10mm
//   page1 left  cols 7–8 (154.4mm tall) + footer; right header + cols 1–2
//   page2       cols 3–6 full body height
//
// Text uses Helvetica / Helvetica-Bold with WinAnsiEncoding. Spanish and other
// Latin-1 glyphs are mapped to single WinAnsi bytes (never raw UTF-8 — that
// produced the Ã¡ / Â¿ mojibake). Images from data:image/*;base64,… items are
// decoded via stdlib image/jpeg+png, re-encoded as JPEG, and embedded as
// /XObject image streams.

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
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
	// Extra space above heading_1 when it follows another item (PDF looks flush without this).
	PamphletHeadingMarginTopMm = 3.0
	// Helvetica average glyph width ≈ 0.50 × size. Using 0.35 let wrapped lines
	// spill into the next column (visible overlap in the downloaded PDF).
	helveticaAvgGlyph = 0.50
	// Body / heading sizes used when compensating image→text spacing (PDF y is baseline).
	pamphletBodySizePt    = 7.1
	pamphletHeadingSizePt = 10.6
	pamphletFooterBodyPt  = 7.0
	pamphletFooterHeadPt  = 9.0
)

// PamphletDocument mirrors the frontend .epam pamphlet_single_sheet JSON body.
type PamphletDocument struct {
	Type    string         `json:"type"`
	Header  PamphletHeader `json:"header"`
	Footer  PamphletFooter `json:"footer"`
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
	Type         string  `json:"type"`
	Content      string  `json:"content"`
	StyleIndexes [][]int `json:"style_indexes"`
	HeightMm     float64 `json:"height_mm"`
}

// pdfImage is one embedded JPEG XObject collected while walking the document.
type pdfImage struct {
	key    string // original item content (data URL) for lookup
	name   string // Im1, Im2, …
	jpeg   []byte
	width  int
	height int
	objNum int
}

// pdfBuilder accumulates PDF objects as raw byte slices so JPEG streams stay binary-safe.
type pdfBuilder struct {
	objects [][]byte
}

func (b *pdfBuilder) add(obj []byte) int {
	b.objects = append(b.objects, obj)
	return len(b.objects)
}

func (b *pdfBuilder) addString(obj string) int {
	return b.add([]byte(obj))
}

func (b *pdfBuilder) bytes() []byte {
	var out bytes.Buffer
	out.WriteString("%PDF-1.4\n")
	offsets := make([]int, 0, len(b.objects)+1)
	offsets = append(offsets, 0)
	for _, obj := range b.objects {
		offsets = append(offsets, out.Len())
		out.Write(obj)
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n", len(b.objects)+1)
	out.WriteString("0000000000 65535 f \n")
	for _, off := range offsets[1:] {
		fmt.Fprintf(&out, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(b.objects)+1, xref)
	return out.Bytes()
}

// BuildPamphletPDF renders a two-page US Letter landscape PDF using the same
// mm geometry as the frontend pamphlet sheet (279.4 × 215.9 mm per page).
func BuildPamphletPDF(doc PamphletDocument) []byte {
	pageW := MmToPoints(PamphletPageWidthMm)
	pageH := MmToPoints(PamphletPageHeightMm)

	images := collectPamphletImages(doc)

	var b pdfBuilder
	b.addString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
	b.addString("2 0 obj\n<< /Type /Pages /Kids [] /Count 2 >>\nendobj\n") // patched below
	b.addString("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n")
	b.addString("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n")

	xObjDecl := strings.Builder{}
	for i := range images {
		objNum := len(b.objects) + 1
		images[i].objNum = objNum
		b.add(buildJPEGXObject(objNum, images[i]))
		fmt.Fprintf(&xObjDecl, "/%s %d 0 R ", images[i].name, objNum)
	}

	imgByContent := make(map[string]*pdfImage, len(images))
	for i := range images {
		imgByContent[images[i].key] = &images[i]
	}

	content1 := buildPage1Content(doc, imgByContent)
	content2 := buildPage2Content(doc, imgByContent)

	resources := "/Font << /F1 3 0 R /F2 4 0 R >>"
	if xObjDecl.Len() > 0 {
		resources += " /XObject << " + xObjDecl.String() + ">>"
	}

	page1Num := len(b.objects) + 1
	content1Num := page1Num + 1
	b.addString(fmt.Sprintf(
		"%d 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents %d 0 R /Resources << %s >> >>\nendobj\n",
		page1Num, pageW, pageH, content1Num, resources,
	))
	b.add(buildStreamObject(content1Num, content1))

	page2Num := len(b.objects) + 1
	content2Num := page2Num + 1
	b.addString(fmt.Sprintf(
		"%d 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents %d 0 R /Resources << %s >> >>\nendobj\n",
		page2Num, pageW, pageH, content2Num, resources,
	))
	b.add(buildStreamObject(content2Num, content2))

	b.objects[1] = []byte(fmt.Sprintf(
		"2 0 obj\n<< /Type /Pages /Kids [%d 0 R %d 0 R] /Count 2 >>\nendobj\n",
		page1Num, page2Num,
	))

	return b.bytes()
}

func collectPamphletImages(doc PamphletDocument) []pdfImage {
	var out []pdfImage
	seen := map[string]bool{}
	add := func(item PamphletItem) {
		if item.Type != "image" || strings.TrimSpace(item.Content) == "" {
			return
		}
		if seen[item.Content] {
			return
		}
		jpegBytes, w, h, ok := decodeToJPEG(item.Content)
		if !ok {
			return
		}
		seen[item.Content] = true
		out = append(out, pdfImage{
			key:    item.Content,
			name:   fmt.Sprintf("Im%d", len(out)+1),
			jpeg:   jpegBytes,
			width:  w,
			height: h,
		})
	}
	for _, col := range [][]PamphletItem{
		doc.Column1, doc.Column2, doc.Column3, doc.Column4,
		doc.Column5, doc.Column6, doc.Column7, doc.Column8,
		doc.Footer.Items,
	} {
		for _, it := range col {
			add(it)
		}
	}
	return out
}

func decodeToJPEG(content string) (jpegBytes []byte, w, h int, ok bool) {
	payload, err := dataURLPayload(content)
	if err != nil || len(payload) == 0 {
		return nil, 0, 0, false
	}
	if isJPEG(payload) {
		cw, ch, okCfg := jpegSize(payload)
		if okCfg {
			return payload, cw, ch, true
		}
	}
	img, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		return nil, 0, 0, false
	}
	bounds := img.Bounds()
	w, h = bounds.Dx(), bounds.Dy()
	if w < 1 || h < 1 {
		return nil, 0, 0, false
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, 0, 0, false
	}
	return buf.Bytes(), w, h, true
}

func dataURLPayload(content string) ([]byte, error) {
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "data:") {
		comma := strings.IndexByte(content, ',')
		if comma < 0 {
			return nil, fmt.Errorf("bad data url")
		}
		meta := content[5:comma]
		data := content[comma+1:]
		if strings.Contains(meta, ";base64") {
			return base64.StdEncoding.DecodeString(data)
		}
		return []byte(data), nil
	}
	if decoded, err := base64.StdEncoding.DecodeString(content); err == nil && (isJPEG(decoded) || len(decoded) > 8) {
		return decoded, nil
	}
	return nil, fmt.Errorf("unsupported image content")
}

func isJPEG(b []byte) bool {
	return len(b) > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF
}

func jpegSize(b []byte) (w, h int, ok bool) {
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return 0, 0, false
	}
	return cfg.Width, cfg.Height, true
}

func buildJPEGXObject(objNum int, img pdfImage) []byte {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%d 0 obj\n", objNum)
	fmt.Fprintf(&buf, "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\n",
		img.width, img.height, len(img.jpeg))
	buf.WriteString("stream\n")
	buf.Write(img.jpeg)
	buf.WriteString("\nendstream\nendobj\n")
	return buf.Bytes()
}

func buildStreamObject(objNum int, content string) []byte {
	body := []byte(content)
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%d 0 obj\n<< /Length %d >>\nstream\n", objNum, len(body))
	buf.Write(body)
	buf.WriteString("\nendstream\nendobj\n")
	return buf.Bytes()
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

func buildPage1Content(doc PamphletDocument, images map[string]*pdfImage) string {
	var s strings.Builder
	headerX := colX(6)
	headerTop := PamphletPageHeightMm - PamphletMarginMm
	drawHeader(&s, doc.Header, headerX, headerTop, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletHeaderHMm)

	leftTop := PamphletPageHeightMm - PamphletMarginMm
	drawColumn(&s, doc.Column7, colX(2), leftTop, PamphletColWidthMm, 154.4, images)
	drawColumn(&s, doc.Column8, colX(4), leftTop, PamphletColWidthMm, 154.4, images)

	rightTop := PamphletPageHeightMm - PamphletMarginMm - PamphletHeaderHMm - PamphletGutterNarrow
	drawColumn(&s, doc.Column1, colX(6), rightTop, PamphletColWidthMm, 177.9, images)
	drawColumn(&s, doc.Column2, colX(8), rightTop, PamphletColWidthMm, 177.9, images)

	footerTop := PamphletMarginMm + PamphletFooterHMm
	drawFooter(&s, doc.Footer.Items, colX(2), footerTop, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletFooterHMm, images)
	return s.String()
}

func buildPage2Content(doc PamphletDocument, images map[string]*pdfImage) string {
	var s strings.Builder
	top := PamphletPageHeightMm - PamphletMarginMm
	h := PamphletPage2BodyMm
	drawColumn(&s, doc.Column3, colX(2), top, PamphletColWidthMm, h, images)
	drawColumn(&s, doc.Column4, colX(4), top, PamphletColWidthMm, h, images)
	drawColumn(&s, doc.Column5, colX(6), top, PamphletColWidthMm, h, images)
	drawColumn(&s, doc.Column6, colX(8), top, PamphletColWidthMm, h, images)
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

func drawFooter(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64, images map[string]*pdfImage) {
	y := top - 3
	floor := top - heightMm
	for i, item := range items {
		if y <= floor {
			break
		}
		if item.Type == "image" {
			h := item.HeightMm
			if h < 10 {
				h = 10
			}
			drawImageOrPlaceholder(s, item, x, y, width, h, images)
			y -= h + gapAfterImage(items, i, pamphletFooterBodyPt, pamphletFooterHeadPt)
			continue
		}
		size := pamphletFooterBodyPt
		font := "F1"
		if item.Type == "heading_1" {
			size = pamphletFooterHeadPt
			font = "F2"
			if i > 0 {
				y -= PamphletHeadingMarginTopMm
			}
		}
		gap := 0.0
		if i < len(items)-1 {
			gap = PamphletItemGapMm
		}
		used := writeWrapped(s, font, size, x, y, width, item.Content, floor)
		y -= used + gap
	}
}

func drawColumn(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64, images map[string]*pdfImage) {
	y := top - 2.5
	floor := top - heightMm
	for i, item := range items {
		if y <= floor {
			break
		}
		if item.Type == "image" {
			h := item.HeightMm
			if h < 10 {
				h = 10
			}
			drawImageOrPlaceholder(s, item, x, y, width, h, images)
			// Item gap + ascent so the next line is not flush under the bitmap
			// (PDF text operators place the baseline, not the glyph top).
			y -= h + gapAfterImage(items, i, pamphletBodySizePt, pamphletHeadingSizePt)
			continue
		}
		size := pamphletBodySizePt
		font := "F1"
		if item.Type == "heading_1" {
			size = pamphletHeadingSizePt
			font = "F2"
			// Headings need top margin when not the first block (editor spacer alone looks flush in PDF).
			if i > 0 {
				y -= PamphletHeadingMarginTopMm
			}
		}
		// Bold range keeps paragraph size; Helvetica-Bold for the whole item when any bold span exists.
		if hasBold(item) && item.Type != "heading_1" {
			font = "F2"
			size = pamphletBodySizePt
		}
		gap := 0.0
		if i < len(items)-1 {
			gap = PamphletItemGapMm
		}
		used := writeWrapped(s, font, size, x, y, width, item.Content, floor)
		y -= used + gap
	}
}

// gapAfterImage returns space under an image before the next item.
// Last item: 0 (no trailing spacer). Next text: item gap + font ascent so the
// visual margin matches the 2mm spacer in the editor.
func gapAfterImage(items []PamphletItem, i int, bodyPt, headingPt float64) float64 {
	if i >= len(items)-1 {
		return 0
	}
	gap := PamphletItemGapMm
	next := items[i+1]
	if next.Type == "image" {
		return gap
	}
	size := bodyPt
	if next.Type == "heading_1" {
		size = headingPt
	}
	// ~0.8 of em ≈ capital height sitting above the baseline.
	gap += size * 0.8 * 25.4 / 72.0
	return gap
}

func drawImageOrPlaceholder(s *strings.Builder, item PamphletItem, x, y, width, heightMm float64, images map[string]*pdfImage) {
	bx := MmToPoints(x)
	by := MmToPoints(y - heightMm)
	bw := MmToPoints(width)
	bh := MmToPoints(heightMm)

	if img, ok := images[item.Content]; ok && img != nil && len(img.jpeg) > 0 {
		// Fit image into the reserved frame (object-fit: cover → scale to fill, clip via clip rect).
		s.WriteString("q\n")
		s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f re W n\n", bx, by, bw, bh))
		iw, ih := float64(img.width), float64(img.height)
		if iw < 1 {
			iw = 1
		}
		if ih < 1 {
			ih = 1
		}
		scale := bw / iw
		if bh/ih > scale {
			scale = bh / ih
		}
		dw, dh := iw*scale, ih*scale
		dx := bx + (bw-dw)/2
		dy := by + (bh-dh)/2
		s.WriteString(fmt.Sprintf("%.2f 0 0 %.2f %.2f %.2f cm /%s Do\n", dw, dh, dx, dy, img.name))
		s.WriteString("Q\n")
		return
	}

	s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f re S\n", bx, by, bw, bh))
	writeText(s, "F1", 7, x+1, y-4, width-2, "[imagen]")
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
	text = toWinAnsi(text)
	if text == "" {
		return
	}
	s.WriteString(fmt.Sprintf("BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n",
		font, sizePt, MmToPoints(xMm), MmToPoints(yMm), escape(text)))
}

func writeWrapped(s *strings.Builder, font string, sizePt float64, xMm, yMm, widthMm float64, text string, floorMm float64) float64 {
	text = strings.TrimSpace(toWinAnsi(text))
	if text == "" {
		return 0
	}
	maxWidthPt := MmToPoints(widthMm)
	lines := wrapWordsToWidth(text, sizePt, maxWidthPt)
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

func wrapWordsToWidth(text string, sizePt, maxWidthPt float64) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	charW := sizePt * helveticaAvgGlyph
	if charW < 0.1 {
		charW = 0.1
	}
	var lines []string
	var cur strings.Builder
	curWidth := 0.0
	for _, w := range words {
		ww := float64(len(w)) * charW
		if cur.Len() == 0 {
			// Hard-break overlong single words so they cannot paint into the next column.
			if ww > maxWidthPt {
				lines = append(lines, splitLongWord(w, maxWidthPt, charW)...)
				cur.Reset()
				curWidth = 0
				continue
			}
			cur.WriteString(w)
			curWidth = ww
			continue
		}
		space := charW
		if curWidth+space+ww > maxWidthPt {
			lines = append(lines, cur.String())
			cur.Reset()
			if ww > maxWidthPt {
				lines = append(lines, splitLongWord(w, maxWidthPt, charW)...)
				curWidth = 0
				continue
			}
			cur.WriteString(w)
			curWidth = ww
			continue
		}
		cur.WriteByte(' ')
		cur.WriteString(w)
		curWidth += space + ww
	}
	if cur.Len() > 0 {
		lines = append(lines, cur.String())
	}
	return lines
}

func splitLongWord(word string, maxWidthPt, charW float64) []string {
	maxChars := int(maxWidthPt / charW)
	if maxChars < 1 {
		maxChars = 1
	}
	var lines []string
	for len(word) > 0 {
		n := maxChars
		if n > len(word) {
			n = len(word)
		}
		lines = append(lines, word[:n])
		word = word[n:]
	}
	return lines
}

// toWinAnsi converts Unicode text to a single-byte WinAnsi string suitable for
// Helvetica + /WinAnsiEncoding. Writing UTF-8 multi-byte sequences into the PDF
// string (via WriteRune) was the source of Ã¡ / Â¿ mojibake.
func toWinAnsi(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			b.WriteByte(' ')
		case r < 128:
			b.WriteByte(byte(r))
		case r <= 0xFF:
			// Latin-1 / WinAnsi overlap for Western European (áéíóúñ¿¡· etc.).
			b.WriteByte(byte(r))
		default:
			if mapped, ok := winAnsiExtras[r]; ok {
				b.WriteByte(mapped)
			} else if unicode.IsLetter(r) || unicode.IsDigit(r) {
				b.WriteByte('?')
			}
			// drop other unsupported glyphs
		}
	}
	return strings.TrimSpace(b.String())
}

// Common typography outside Latin-1 that still appears in pamphlets.
var winAnsiExtras = map[rune]byte{
	'\u2018': 0x91, // ‘
	'\u2019': 0x92, // ’
	'\u201C': 0x93, // “
	'\u201D': 0x94, // ”
	'\u2013': 0x96, // –
	'\u2014': 0x97, // —
	'\u2026': 0x85, // …
	'\u20AC': 0x80, // €
}

func nonEmpty(s string) string {
	return strings.TrimSpace(s)
}
