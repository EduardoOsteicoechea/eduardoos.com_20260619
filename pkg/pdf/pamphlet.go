package pdf

// Pamphlet PDF builder — raw PDF 1.4 byte streams (no external PDF libraries).
//
// Geometry matches the frontend sheet CSS exactly:
//   page  279.4mm × 215.9mm (US Letter landscape)
//   cols  57.85mm wide, gutters 4mm / 20mm (center), margins 10mm
//   page1 left  cols 7–8 (154.4mm tall) + footer; right header + cols 1–2
//   page2       cols 3–6 full body height
//
// Text uses embedded Roboto / Roboto-Bold (website font) with WinAnsiEncoding.
// Latin-1 glyphs are mapped to single WinAnsi bytes (never raw UTF-8 — that
// produced the Ã¡ / Â¿ mojibake). Images from data:image/*;base64,… items are
// decoded via stdlib image/jpeg+png, re-encoded as JPEG, and embedded as
// /XObject image streams.

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"strings"
	"unicode"

	_ "golang.org/x/image/webp"
)

// Letter landscape page size used by the pamphlet sheet (exact CSS mm).
const (
	PamphletPageWidthMm  = 279.4
	PamphletPageHeightMm = 215.9
	PamphletMarginMm     = 10.0
	PamphletGutterNarrow = 4.0
	// Center fold gutter (page 1 left↔right and page 2 left↔right).
	PamphletGutterWide = 20.0
	// (279.4 − 10 − 4 − 20 − 4 − 10) / 4 = 57.85mm
	PamphletColWidthMm = 57.85
	// Header band fits 6.75mm 2-line title + 0.6mm gap + two 2.5mm meta rows (~22.3mm).
	PamphletHeaderHMm = 23.0
	// Gap under the header band before cols 1–2 — CSS --header-body-gutter.
	PamphletHeaderBodyGutterMm = 5.0
	PamphletFooterHMm          = 37.5
	// 215.9 − 10 − 23 − 5 − 4 − 37.5 − 10
	PamphletPage1BodyMm = 126.4
	PamphletPage2BodyMm = 195.9
	PamphletItemGapMm   = 2.5
	// CSS .pamphlet-page-header { gap } between title block and meta bar.
	PamphletHeaderTitleMetaGapMm = 0.6
	// CSS .pamphlet-header-meta-bar { row-gap }.
	PamphletHeaderMetaRowGapMm = 0.8
	// Right-side cols 1–2: 195.9 − 23 − 5
	PamphletPage1RightColMm = 167.9
	// Left-side cols 7–8 above footer: 195.9 − 4 − 37.5
	PamphletPage1LeftColMm = 154.4
	// Exact CSS type sizes on the sheet (source of truth for PDF).
	pamphletTitleSizeMm = 6.75 // .pamphlet-header-title p — 1.35× of 5mm; band is 23mm so both meta rows fit
	pamphletTitleLH     = 1.1
	pamphletMetaSizeMm  = 2.5  // .pamphlet-header-meta-label { font-size: 2.5mm; line-height: 1.2 }
	pamphletMetaLH      = 1.2
	pamphletBodySizeMm  = 3.0  // paragraph { font-size: 3mm; line-height: 1.25 }
	pamphletBodyLH      = 1.25
	pamphletHeadingSizeMm = 4.25 // h1 { font-size: 4.25mm; line-height: 1.2 }
	pamphletHeadingLH     = 1.2
	pamphletBodySizePt    = 8.503937007874016 // 3mm
	pamphletHeadingSizePt = 12.04724409448819 // 4.25mm
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
	f1, f2 := buildEmbeddedFontPair(&b)

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

	resources := fmt.Sprintf("/Font << /F1 %d 0 R /F2 %d 0 R >>", f1, f2)
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
			// Strip whitespace that some serializers insert into long base64 blobs.
			compact := strings.Map(func(r rune) rune {
				if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
					return -1
				}
				return r
			}, data)
			return base64.StdEncoding.DecodeString(compact)
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
	// Same vertical tracks as CSS grid: margin → 23mm header → gutter → cols.
	_ = drawHeader(&s, doc.Header, headerX, headerTop, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletHeaderHMm)

	leftTop := PamphletPageHeightMm - PamphletMarginMm
	drawColumn(&s, doc.Column7, colX(2), leftTop, PamphletColWidthMm, PamphletPage1LeftColMm, images)
	drawColumn(&s, doc.Column8, colX(4), leftTop, PamphletColWidthMm, PamphletPage1LeftColMm, images)

	rightTop := headerTop - PamphletHeaderHMm - PamphletHeaderBodyGutterMm
	drawColumn(&s, doc.Column1, colX(6), rightTop, PamphletColWidthMm, PamphletPage1RightColMm, images)
	drawColumn(&s, doc.Column2, colX(8), rightTop, PamphletColWidthMm, PamphletPage1RightColMm, images)

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

// cssBaselineOffsetMm is the distance from the top of a CSS line box to the
// alphabetic baseline: half-leading + ~0.8em (Latin sans).
func cssBaselineOffsetMm(sizeMm, lineHeight float64) float64 {
	return sizeMm*(lineHeight-1.0)/2.0 + sizeMm*0.80
}

// drawHeader paints title + 2×2 gray meta with the same box model as the sheet:
//   title line-boxes (5mm × 1.1) → flex gap 0.6mm → meta line-boxes (2.5mm × 1.2)
//   with row-gap 0.8mm, clipped to the 23mm header track.
func drawHeader(s *strings.Builder, h PamphletHeader, x, top, width, heightMm float64) float64 {
	floor := top - heightMm
	titleSizePt := MmToPoints(pamphletTitleSizeMm)
	titleLineHMm := pamphletTitleSizeMm * pamphletTitleLH
	y := top - cssBaselineOffsetMm(pamphletTitleSizeMm, pamphletTitleLH)
	used := writeWrapped(s, "F2", titleSizePt, pamphletTitleLH, x, y, width, h.Title, floor)
	nTitle := 1
	if used > 0 {
		nTitle = int(used/titleLineHMm + 0.5)
		if nTitle < 1 {
			nTitle = 1
		}
	} else if strings.TrimSpace(h.Title) == "" {
		return floor
	}
	// Bottom of the title line-box stack (CSS flex item), then the 0.6mm gap.
	titleBoxBottom := top - float64(nTitle)*titleLineHMm
	metaLineTop := titleBoxBottom - PamphletHeaderTitleMetaGapMm

	metaSizePt := MmToPoints(pamphletMetaSizeMm)
	metaLineHMm := pamphletMetaSizeMm * pamphletMetaLH
	metaY := metaLineTop - cssBaselineOffsetMm(pamphletMetaSizeMm, pamphletMetaLH)

	const colGapMm = 2.5
	half := (width - colGapMm) / 2
	if half < 10 {
		half = width / 2
	}
	rightX := x + half + colGapMm

	left1 := labeledMeta("Serie", h.Series)
	right1 := labeledMeta("Capítulo", h.SeriesChapter)
	left2 := labeledMeta("Autor", h.Author)
	right2 := labeledMeta("Fecha", h.Date)

	contentBottom := titleBoxBottom
	if (left1 != "" || right1 != "") && metaY > floor {
		if left1 != "" {
			writeGrayText(s, "F1", metaSizePt, x, metaY, half, left1)
		}
		if right1 != "" {
			writeGrayText(s, "F1", metaSizePt, rightX, metaY, half, right1)
		}
		contentBottom = metaLineTop - metaLineHMm
		metaLineTop -= metaLineHMm + PamphletHeaderMetaRowGapMm
		metaY = metaLineTop - cssBaselineOffsetMm(pamphletMetaSizeMm, pamphletMetaLH)
	}
	if (left2 != "" || right2 != "") && metaY > floor {
		if left2 != "" {
			writeGrayText(s, "F1", metaSizePt, x, metaY, half, left2)
		}
		if right2 != "" {
			writeGrayText(s, "F1", metaSizePt, rightX, metaY, half, right2)
		}
		contentBottom = metaLineTop - metaLineHMm
	}
	if contentBottom < floor {
		return floor
	}
	return contentBottom
}

func labeledMeta(label, value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return label + ": " + value
}

// writeGrayText paints a single line in medium gray (UI meta color), clipped by width via wrap.
func writeGrayText(s *strings.Builder, font string, sizePt float64, xMm, yMm, widthMm float64, text string) {
	text = strings.TrimSpace(toWinAnsi(text))
	if text == "" {
		return
	}
	lines := wrapWordsToWidth(text, sizePt, MmToPoints(widthMm), false)
	if len(lines) == 0 {
		return
	}
	// One visual line in the meta cell (ellipsis via truncation of wrap).
	line := lines[0]
	if len(lines) > 1 && len(line) > 3 {
		runes := []rune(line)
		if len(runes) > 3 {
			line = string(runes[:len(runes)-3]) + "..."
		}
	}
	// DeviceGray ≈ #666666
	s.WriteString("0.4 0.4 0.4 rg\n")
	s.WriteString(fmt.Sprintf("BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n",
		font, sizePt, MmToPoints(xMm), MmToPoints(yMm), escape(line)))
	s.WriteString("0 0 0 rg\n")
}

func drawFooter(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64, images map[string]*pdfImage) {
	drawStackedItems(s, items, x, top, width, heightMm, images, pamphletFooterBodyPt, pamphletFooterHeadPt, 1.25, 1.25)
}

func drawColumn(s *strings.Builder, items []PamphletItem, x, top, width, heightMm float64, images map[string]*pdfImage) {
	drawStackedItems(s, items, x, top, width, heightMm, images, pamphletBodySizePt, pamphletHeadingSizePt, pamphletBodyLH, pamphletHeadingLH)
}

// drawStackedItems walks items from the CSS box top (not the first baseline).
// Desktop columns use overflow:visible and only --item-gap-height between
// blocks — no extra heading margin. Tracking the item-top cursor keeps the
// last heading+paragraph inside the band instead of eating them at the floor.
func drawStackedItems(
	s *strings.Builder,
	items []PamphletItem,
	x, top, width, heightMm float64,
	images map[string]*pdfImage,
	bodyPt, headingPt, bodyLH, headingLH float64,
) {
	cursorTop := top
	floor := top - heightMm
	for i, item := range items {
		// CSS .dumb-column { overflow: visible } — the last sheet line may start
		// just below the grid floor and still sit in the 10mm page margin.
		if cursorTop < floor-pamphletBodySizeMm*pamphletBodyLH {
			break
		}
		if item.Type == "image" {
			h := item.HeightMm
			if h < 10 {
				h = 10
			}
			drawImageOrPlaceholder(s, item, x, cursorTop, width, h, images)
			cursorTop -= h
			if i < len(items)-1 {
				cursorTop -= PamphletItemGapMm
			}
			continue
		}
		sizePt := bodyPt
		sizeMm := bodyPt * 25.4 / 72.0
		lh := bodyLH
		font := "F1"
		if item.Type == "heading_1" {
			sizePt = headingPt
			sizeMm = headingPt * 25.4 / 72.0
			lh = headingLH
			font = "F2"
		}
		if hasBold(item) && item.Type != "heading_1" {
			font = "F2"
			sizePt = bodyPt
			sizeMm = bodyPt * 25.4 / 72.0
			lh = bodyLH
		}
		y := cursorTop - cssBaselineOffsetMm(sizeMm, lh)
		used := writeWrapped(s, font, sizePt, lh, x, y, width, item.Content, floor)
		if used <= 0 {
			break
		}
		cursorTop -= used
		if i < len(items)-1 {
			cursorTop -= PamphletItemGapMm
		}
	}
}

func drawImageOrPlaceholder(s *strings.Builder, item PamphletItem, x, y, width, heightMm float64, images map[string]*pdfImage) {
	bx := MmToPoints(x)
	by := MmToPoints(y - heightMm)
	bw := MmToPoints(width)
	bh := MmToPoints(heightMm)

	if img, ok := images[item.Content]; ok && img != nil && len(img.jpeg) > 0 {
		// Fit image into the reserved frame (object-fit: cover → scale to fill, clip via clip rect).
		// Optional pan/zoom from style_indexes (mirrors frontend):
		//   [1][0] = offset_x_mm * 100 (+ right)
		//   [1][1] = offset_y_mm * 100 (+ down in CSS; PDF y is inverted)
		//   [2][0] = scale * 100 (100 = 1.0×)
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
		zoom := 1.0
		if len(item.StyleIndexes) > 2 && len(item.StyleIndexes[2]) > 0 && item.StyleIndexes[2][0] > 0 {
			zoom = float64(item.StyleIndexes[2][0]) / 100.0
			if zoom < 0.5 {
				zoom = 0.5
			}
			if zoom > 3 {
				zoom = 3
			}
		}
		scale *= zoom
		dw, dh := iw*scale, ih*scale
		dx := bx + (bw-dw)/2
		dy := by + (bh-dh)/2
		if len(item.StyleIndexes) > 1 && len(item.StyleIndexes[1]) > 0 {
			dx += MmToPoints(float64(item.StyleIndexes[1][0]) / 100.0)
			if len(item.StyleIndexes[1]) > 1 {
				// CSS +Y is down; PDF +Y is up → subtract.
				dy -= MmToPoints(float64(item.StyleIndexes[1][1]) / 100.0)
			}
		}
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

func writeWrapped(s *strings.Builder, font string, sizePt, lineHeight, xMm, yMm, widthMm float64, text string, floorMm float64) float64 {
	text = strings.TrimSpace(toWinAnsi(text))
	if text == "" {
		return 0
	}
	if lineHeight < 1.0 {
		lineHeight = 1.25
	}
	maxWidthPt := MmToPoints(widthMm)
	lines := wrapWordsToWidth(text, sizePt, maxWidthPt, font == "F2")
	lineH := sizePt * lineHeight * 25.4 / 72.0 // mm
	sizeMm := sizePt * 25.4 / 72.0
	offset := cssBaselineOffsetMm(sizeMm, lineHeight)
	used := 0.0
	y := yMm
	for _, line := range lines {
		// y is the alphabetic baseline. Desktop columns are overflow:visible, so
		// paint a line whose line-box still intersects the band or starts at most
		// one line into the page margin — that is the last sheet line the PDF
		// was dropping ("para santificae" / "Mira cómo dice Romanos…").
		lineBoxTop := y + offset
		if lineBoxTop < floorMm-lineH {
			break
		}
		s.WriteString(fmt.Sprintf("BT /%s %.2f Tf %.2f %.2f Td (%s) Tj ET\n",
			font, sizePt, MmToPoints(xMm), MmToPoints(y), escape(line)))
		y -= lineH
		used += lineH
	}
	return used
}

func wrapWordsToWidth(text string, sizePt, maxWidthPt float64, bold bool) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	spaceW := glyphWidthEm(' ', bold) * sizePt
	var lines []string
	var cur strings.Builder
	curWidth := 0.0
	for _, w := range words {
		ww := stringWidthPt(w, sizePt, bold)
		if cur.Len() == 0 {
			if ww > maxWidthPt {
				lines = append(lines, splitLongWord(w, sizePt, maxWidthPt, bold)...)
				cur.Reset()
				curWidth = 0
				continue
			}
			cur.WriteString(w)
			curWidth = ww
			continue
		}
		if curWidth+spaceW+ww > maxWidthPt {
			lines = append(lines, cur.String())
			cur.Reset()
			if ww > maxWidthPt {
				lines = append(lines, splitLongWord(w, sizePt, maxWidthPt, bold)...)
				curWidth = 0
				continue
			}
			cur.WriteString(w)
			curWidth = ww
			continue
		}
		cur.WriteByte(' ')
		cur.WriteString(w)
		curWidth += spaceW + ww
	}
	if cur.Len() > 0 {
		lines = append(lines, cur.String())
	}
	return lines
}

func splitLongWord(word string, sizePt, maxWidthPt float64, bold bool) []string {
	var lines []string
	start := 0
	w := 0.0
	for i := 0; i < len(word); i++ {
		gw := glyphWidthEm(word[i], bold) * sizePt
		if w+gw > maxWidthPt && i > start {
			lines = append(lines, word[start:i])
			start = i
			w = 0
		}
		w += gw
	}
	if start < len(word) {
		lines = append(lines, word[start:])
	}
	return lines
}

// toWinAnsi converts Unicode text to a single-byte WinAnsi string suitable for
// Roboto + /WinAnsiEncoding. Writing UTF-8 multi-byte sequences into the PDF
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
