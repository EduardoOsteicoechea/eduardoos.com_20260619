package pdf

// Pamphlet PDF builder — raw PDF 1.4 byte streams (no external PDF libraries).
//
// Geometry matches the frontend sheet CSS exactly:
//   page  279.4mm × 215.9mm (US Letter landscape)
//   cols  57.85mm wide, gutters 4mm / 20mm (center), margins 10mm
//   page1 left  cols 7–8 (159.9mm tall) + footer; right header + cols 1–2
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
)

// Letter landscape page size used by the pamphlet sheet (exact CSS mm).
const (
	PamphletPageWidthMm  = 279.4
	PamphletPageHeightMm = 215.9
	PamphletMarginMm     = 10.0
	PamphletGutterNarrow = 4.0
	// Gap only between cols 7–8 and the footer (--footer-body-gutter).
	PamphletFooterBodyGutterMm = 6.0
	// Center fold gutter (page 1 left↔right and page 2 left↔right).
	PamphletGutterWide = 20.0
	// (279.4 − 10 − 4 − 20 − 4 − 10) / 4 = 57.85mm
	PamphletColWidthMm = 57.85
	// Header band: title + title_pad_bottom + title divider + title_meta_gap + meta + frame.
	// Overridden by header_layout.height from frontend when present.
	PamphletHeaderHMm = 35.0
	// Gap under the header band before cols 1–2 — CSS --header-body-gutter.
	PamphletHeaderBodyGutterMm = 5.0
	PamphletFooterHMm          = 30.0 // default; overridden by footer_layout.height from frontend
	// 215.9 − 10 − 35 − 5 − 6 − 30 − 10
	PamphletPage1BodyMm = 119.9
	PamphletPage2BodyMm = 195.9
	PamphletItemGapMm   = 2.5
	// Clear space under subtitle → meta (PAMPHLET_HEADER_LAYOUT_MM.title_meta_gap).
	PamphletHeaderTitleMetaGapMm = 1.6
	// CSS .pamphlet-header-meta-bar { row-gap }.
	PamphletHeaderMetaRowGapMm = 1.8
	// Right-side cols 1–2: 195.9 − 35 − 5
	PamphletPage1RightColMm = 155.9
	// Left-side cols 7–8 above footer: 195.9 − 6 − 30 (default layout.height)
	PamphletPage1LeftColMm = 159.9
	// Exact CSS type sizes on the sheet (defaults; print may override via header_layout).
	pamphletTitleSizeMm = 6.75 // .pamphlet-header-title p — 1.35× of 5mm; band fits title + meta + rule
	pamphletTitleLH     = 1.1
	pamphletMetaSizeMm  = 2.5 // .pamphlet-header-meta-label { font-size: 2.5mm; line-height: 1.2 }
	pamphletMetaLH      = 1.2
	pamphletBodySizeMm  = 3.0 // paragraph { font-size: 3mm; line-height: 1.25 }
	pamphletBodyLH      = 1.25
	pamphletHeadingSizeMm = 4.25 // h1 { font-size: 4.25mm; line-height: 1.2 }
	pamphletHeadingLH     = 1.2
	pamphletBodySizePt    = 8.503937007874016 // 3mm
	pamphletHeadingSizePt = 12.04724409448819 // 4.25mm
)

// PamphletDocument mirrors the frontend .epam pamphlet_single_sheet JSON body.
type PamphletDocument struct {
	Type         string               `json:"type"`
	Header       PamphletHeader       `json:"header"`
	Footer       PamphletFooter       `json:"footer"`
	HeaderLayout PamphletHeaderLayout `json:"header_layout,omitempty"`
	FooterLayout PamphletFooterLayout `json:"footer_layout,omitempty"`
	Column1      []PamphletItem       `json:"column_1"`
	Column2      []PamphletItem       `json:"column_2"`
	Column3      []PamphletItem       `json:"column_3"`
	Column4      []PamphletItem       `json:"column_4"`
	Column5      []PamphletItem       `json:"column_5"`
	Column6      []PamphletItem       `json:"column_6"`
	Column7      []PamphletItem       `json:"column_7"`
	Column8      []PamphletItem       `json:"column_8"`
}

// PamphletHeaderLayout is the exact mm type/spacing from the frontend sheet CSS
// (PAMPHLET_HEADER_LAYOUT_MM). Print POSTs these; PDF must not invent sizes.
type PamphletHeaderLayout struct {
	Height              float64 `json:"height"`
	BodyGutter          float64 `json:"body_gutter"`
	Pad                 float64 `json:"pad"`
	PadX                float64 `json:"pad_x"`
	Radius              float64 `json:"radius"`
	Stroke              float64 `json:"stroke"`
	InnerInset          float64 `json:"inner_inset"`
	InnerStroke         float64 `json:"inner_stroke"`
	InnerRadius         float64 `json:"inner_radius"`
	TitleSize           float64 `json:"title_size"`
	TitleLH             float64 `json:"title_lh"`
	TitlePadBottom      float64 `json:"title_pad_bottom"`
	TitleMetaGap        float64 `json:"title_meta_gap"`
	DividerOuterStroke  float64 `json:"divider_outer_stroke"`
	DividerGap          float64 `json:"divider_gap"`
	DividerInnerStroke  float64 `json:"divider_inner_stroke"`
	SubtitleSize        float64 `json:"subtitle_size"`
	SubtitleLH          float64 `json:"subtitle_lh"`
	SubtitlePadX        float64 `json:"subtitle_pad_x"`
	SubtitlePadY        float64 `json:"subtitle_pad_y"`
	SubtitleMinH        float64 `json:"subtitle_min_h"`
	MetaSize            float64 `json:"meta_size"`
	MetaLH              float64 `json:"meta_lh"`
	MetaRowGap          float64 `json:"meta_row_gap"`
	MetaColGap          float64 `json:"meta_col_gap"`
}

// PamphletFooterLayout is the exact mm chrome from the frontend sheet CSS
// (PAMPHLET_FOOTER_LAYOUT_MM). Print POSTs these; PDF must not invent sizes.
type PamphletFooterLayout struct {
	Height               float64 `json:"height"`
	Width                float64 `json:"width"`
	Pad                  float64 `json:"pad"`
	Radius               float64 `json:"radius"`
	Stroke               float64 `json:"stroke"`
	InnerInset           float64 `json:"inner_inset"`
	InnerStroke          float64 `json:"inner_stroke"`
	InnerRadius          float64 `json:"inner_radius"`
	ChromeGap            float64 `json:"chrome_gap"`
	DividerOuterStroke   float64 `json:"divider_outer_stroke"`
	DividerGap           float64 `json:"divider_gap"`
	DividerInnerStroke   float64 `json:"divider_inner_stroke"`
	ActionSize           float64 `json:"action_size"`
	ActionLH             float64 `json:"action_lh"`
	ActionPadX           float64 `json:"action_pad_x"`
	ActionPadY           float64 `json:"action_pad_y"`
	ActionMinH           float64 `json:"action_min_h"`
	MessageSize          float64 `json:"message_size"`
	MessageLH            float64 `json:"message_lh"`
	MessagePadX          float64 `json:"message_pad_x"`
	MessagePadY          float64 `json:"message_pad_y"`
	MessageMinH          float64 `json:"message_min_h"`
	MetaGap              float64 `json:"meta_gap"`
	MetaColGap           float64 `json:"meta_col_gap"`
	MetaRowH             float64 `json:"meta_row_h"`
	MetaValueRowH        float64 `json:"meta_value_row_h"`
	MetaSize             float64 `json:"meta_size"`
	MetaLH               float64 `json:"meta_lh"`
	MetaPadX             float64 `json:"meta_pad_x"`
	MetaPadY             float64 `json:"meta_pad_y"`
	MetaValuePadY        float64 `json:"meta_value_pad_y"`
	CellStroke           float64 `json:"cell_stroke"`
	// Legacy: older clients sent action_message_gap; ignored when divider_* present.
	ActionMessageGap float64 `json:"action_message_gap"`
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
	Action  string `json:"action"`
	Message string `json:"message"`
	Label1  string `json:"label1"`
	Value1  string `json:"value1"`
	Label2  string `json:"label2"`
	Value2  string `json:"value2"`
	Label3  string `json:"label3"`
	Value3  string `json:"value3"`
	Label4  string `json:"label4"`
	Value4  string `json:"value4"`
	// Legacy keys (migrated into labelN/valueN when present).
	Whatsapp   string         `json:"whatsapp,omitempty"`
	Phone      string         `json:"phone,omitempty"`
	Address    string         `json:"address,omitempty"`
	Activities string         `json:"activities,omitempty"`
	Items      []PamphletItem `json:"items,omitempty"`
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
	headerLayout := normalizeHeaderLayout(doc.HeaderLayout)
	footerLayout := normalizeFooterLayout(doc.FooterLayout)
	headerH := headerLayout.Height
	bodyGutter := headerLayout.BodyGutter
	footerH := footerLayout.Height
	leftColH := PamphletPage2BodyMm - PamphletFooterBodyGutterMm - footerH
	rightColH := PamphletPage2BodyMm - headerH - bodyGutter

	headerX := colX(6)
	headerTop := PamphletPageHeightMm - PamphletMarginMm
	// Same vertical tracks as CSS grid: margin → header → gutter → cols.
	_ = drawHeader(&s, doc.Header, headerLayout, headerX, headerTop, PamphletColWidthMm*2+PamphletGutterNarrow)

	leftTop := PamphletPageHeightMm - PamphletMarginMm
	drawColumn(&s, doc.Column7, colX(2), leftTop, PamphletColWidthMm, leftColH, images)
	drawColumn(&s, doc.Column8, colX(4), leftTop, PamphletColWidthMm, leftColH, images)

	rightTop := headerTop - headerH - bodyGutter
	drawColumn(&s, doc.Column1, colX(6), rightTop, PamphletColWidthMm, rightColH, images)
	drawColumn(&s, doc.Column2, colX(8), rightTop, PamphletColWidthMm, rightColH, images)

	footerTop := PamphletMarginMm + footerH
	drawFooter(&s, normalizeFooter(doc.Footer), footerLayout, colX(2), footerTop, PamphletColWidthMm*2+PamphletGutterNarrow)
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

// drawHeader paints footer-style double frame, title, title double-divider,
// subtitle, then 2x2 gray meta. Type sizes and chrome come from header_layout (FE mm).
func drawHeader(s *strings.Builder, h PamphletHeader, layout PamphletHeaderLayout, x, top, width float64) float64 {
	layout = normalizeHeaderLayout(layout)
	heightMm := layout.Height
	floor := top - heightMm

	// Outer + inner frame (same path math as drawFooter).
	strokeRoundedRectMm(s, x, top, width, heightMm, layout.Radius, layout.Stroke)
	if layout.InnerInset > 0 && layout.InnerStroke > 0 {
		clear := layout.InnerInset
		pathInset := layout.Stroke/2 + clear + layout.InnerStroke/2
		ix := x + pathInset
		it := top - pathInset
		iw := width - 2*pathInset
		ih := heightMm - 2*pathInset
		if iw > 0 && ih > 0 {
			strokeRoundedRectMm(s, ix, it, iw, ih, layout.InnerRadius, layout.InnerStroke)
		}
	}

	padY := layout.Pad
	padX := layout.PadX
	innerX := x + padX
	innerTop := top - padY
	innerW := width - 2*padX
	textFloor := floor + padY

	titleSizeMm := layout.TitleSize
	titleLH := layout.TitleLH
	titleSizePt := MmToPoints(titleSizeMm)
	titleLineHMm := titleSizeMm * titleLH
	y := innerTop - cssBaselineOffsetMm(titleSizeMm, titleLH)
	used := writeWrapped(s, "F2", titleSizePt, titleLH, innerX, y, innerW, h.Title, textFloor)
	nTitle := 1
	if used > 0 {
		nTitle = int(used/titleLineHMm + 0.5)
		if nTitle < 1 {
			nTitle = 1
		}
	} else if strings.TrimSpace(h.Title) == "" {
		return floor
	}
	titleBoxBottom := innerTop - float64(nTitle)*titleLineHMm

	// Double rule under title (same strokes as footer Acción→Mensaje divider).
	cursorTop := titleBoxBottom - layout.TitlePadBottom
	dividerH := layout.DividerOuterStroke + layout.DividerGap + layout.DividerInnerStroke
	if dividerH > 0 {
		strokeHorizontalRuleMm(s, innerX, cursorTop, innerW, layout.DividerOuterStroke)
		cursorTop -= layout.DividerOuterStroke + layout.DividerGap
		strokeHorizontalRuleMm(s, innerX, cursorTop, innerW, layout.DividerInnerStroke)
		cursorTop -= layout.DividerInnerStroke
	}

	// Subtitle / key metadata (footer Mensaje analogue).
	subSize := layout.SubtitleSize
	subLH := layout.SubtitleLH
	if subSize <= 0 {
		subSize = 2.469
	}
	if subLH <= 0 {
		subLH = 1.25
	}
	subTextW := innerW - 2*layout.SubtitlePadX
	if subTextW < 4 {
		subTextW = innerW
	}
	subTextH := measureWrappedHeightMm(h.Subtitle, subSize, subLH, subTextW)
	subBoxH := layout.SubtitlePadY*2 + subTextH
	if subBoxH < layout.SubtitleMinH {
		subBoxH = layout.SubtitleMinH
	}
	if cursorTop-subBoxH < textFloor {
		subBoxH = cursorTop - textFloor
	}
	if subBoxH > 0 {
		if strings.TrimSpace(h.Subtitle) != "" {
			textTop := cursorTop - layout.SubtitlePadY
			sy := textTop - cssBaselineOffsetMm(subSize, subLH)
			subFloor := cursorTop - subBoxH + layout.SubtitlePadY
			writeWrapped(s, "F1", MmToPoints(subSize), subLH,
				innerX+layout.SubtitlePadX, sy, subTextW, h.Subtitle, subFloor)
		}
		cursorTop -= subBoxH
	}

	metaLineTop := cursorTop - layout.TitleMetaGap
	metaSectionTop := metaLineTop

	metaSizeMm := layout.MetaSize
	metaLH := layout.MetaLH
	metaSizePt := MmToPoints(metaSizeMm)
	metaLineHMm := metaSizeMm * metaLH
	metaY := metaLineTop - cssBaselineOffsetMm(metaSizeMm, metaLH)

	colGapMm := layout.MetaColGap
	half := (innerW - colGapMm) / 2
	if half < 10 {
		half = innerW / 2
	}
	rightX := innerX + half + colGapMm

	left1 := labeledMeta("Serie", h.Series)
	right1 := labeledMeta("Capítulo", h.SeriesChapter)
	left2 := labeledMeta("Autor", h.Author)
	right2 := labeledMeta("Fecha", h.Date)

	contentBottom := titleBoxBottom
	drewMeta := false
	if (left1 != "" || right1 != "") && metaY > textFloor {
		if left1 != "" {
			writeGrayText(s, "F1", metaSizePt, innerX, metaY, half, left1)
		}
		if right1 != "" {
			writeGrayText(s, "F1", metaSizePt, rightX, metaY, half, right1)
		}
		contentBottom = metaLineTop - metaLineHMm
		drewMeta = true
		metaLineTop -= metaLineHMm + layout.MetaRowGap
		metaY = metaLineTop - cssBaselineOffsetMm(metaSizeMm, metaLH)
	}
	if (left2 != "" || right2 != "") && metaY > textFloor {
		if left2 != "" {
			writeGrayText(s, "F1", metaSizePt, innerX, metaY, half, left2)
		}
		if right2 != "" {
			writeGrayText(s, "F1", metaSizePt, rightX, metaY, half, right2)
		}
		contentBottom = metaLineTop - metaLineHMm
		drewMeta = true
	}

	// Double gray cross on meta (vertical + mid horizontal) — no outer frame.
	if drewMeta && metaSectionTop > contentBottom {
		strokeGrayMetaCrossMm(s, innerX, metaSectionTop, innerW, metaSectionTop-contentBottom, false)
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

var pamphletFooterDefaultLabels = [4]string{"WhatsApp", "Teléfono", "Dirección", "Actividades"}

// defaultHeaderLayout mirrors frontend PAMPHLET_HEADER_LAYOUT_MM / style.css.
func defaultHeaderLayout() PamphletHeaderLayout {
	return PamphletHeaderLayout{
		Height:             PamphletHeaderHMm,
		BodyGutter:         PamphletHeaderBodyGutterMm,
		Pad:                1.2,
		PadX:               2.2,
		Radius:             1,
		Stroke:             0.2,
		InnerInset:         0.45,
		InnerStroke:        0.1,
		InnerRadius:        0.6,
		TitleSize:          pamphletTitleSizeMm,
		TitleLH:            pamphletTitleLH,
		TitlePadBottom:     1,
		TitleMetaGap:       PamphletHeaderTitleMetaGapMm,
		DividerOuterStroke: 0.2,
		DividerGap:         0.45,
		DividerInnerStroke: 0.1,
		SubtitleSize:       2.469,
		SubtitleLH:         1.25,
		SubtitlePadX:       1.0,
		SubtitlePadY:       0.5,
		SubtitleMinH:       4.0,
		MetaSize:           pamphletMetaSizeMm,
		MetaLH:             pamphletMetaLH,
		MetaRowGap:         PamphletHeaderMetaRowGapMm,
		MetaColGap:         2.5,
	}
}

// normalizeHeaderLayout fills zero fields from the frontend defaults so older
// print clients without header_layout still render a coherent header band.
func normalizeHeaderLayout(l PamphletHeaderLayout) PamphletHeaderLayout {
	d := defaultHeaderLayout()
	pick := func(v, def float64) float64 {
		if v > 0 {
			return v
		}
		return def
	}
	return PamphletHeaderLayout{
		Height:             pick(l.Height, d.Height),
		BodyGutter:         pick(l.BodyGutter, d.BodyGutter),
		Pad:                pick(l.Pad, d.Pad),
		PadX:               pick(l.PadX, d.PadX),
		Radius:             pick(l.Radius, d.Radius),
		Stroke:             pick(l.Stroke, d.Stroke),
		InnerInset:         pick(l.InnerInset, d.InnerInset),
		InnerStroke:        pick(l.InnerStroke, d.InnerStroke),
		InnerRadius:        pick(l.InnerRadius, d.InnerRadius),
		TitleSize:          pick(l.TitleSize, d.TitleSize),
		TitleLH:            pick(l.TitleLH, d.TitleLH),
		TitlePadBottom:     pick(l.TitlePadBottom, d.TitlePadBottom),
		TitleMetaGap:       pick(l.TitleMetaGap, d.TitleMetaGap),
		DividerOuterStroke: pick(l.DividerOuterStroke, d.DividerOuterStroke),
		DividerGap:         pick(l.DividerGap, d.DividerGap),
		DividerInnerStroke: pick(l.DividerInnerStroke, d.DividerInnerStroke),
		SubtitleSize:       pick(l.SubtitleSize, d.SubtitleSize),
		SubtitleLH:         pick(l.SubtitleLH, d.SubtitleLH),
		SubtitlePadX:       pick(l.SubtitlePadX, d.SubtitlePadX),
		SubtitlePadY:       pick(l.SubtitlePadY, d.SubtitlePadY),
		SubtitleMinH:       pick(l.SubtitleMinH, d.SubtitleMinH),
		MetaSize:           pick(l.MetaSize, d.MetaSize),
		MetaLH:             pick(l.MetaLH, d.MetaLH),
		MetaRowGap:         pick(l.MetaRowGap, d.MetaRowGap),
		MetaColGap:         pick(l.MetaColGap, d.MetaColGap),
	}
}

// defaultFooterLayout mirrors frontend PAMPHLET_FOOTER_LAYOUT_MM / style.css.
func defaultFooterLayout() PamphletFooterLayout {
	return PamphletFooterLayout{
		Height:             PamphletFooterHMm,
		Width:              PamphletColWidthMm*2 + PamphletGutterNarrow,
		Pad:                1.2,
		Radius:             1.0,
		Stroke:             0.2,
		InnerInset:         0.45,
		InnerStroke:        0.1,
		InnerRadius:        0.6,
		ChromeGap:          0.6,
		DividerOuterStroke: 0.2,
		DividerGap:         0.45,
		DividerInnerStroke: 0.1,
		ActionSize:         3.175,
		ActionLH:           1.25,
		ActionPadX:         1.4,
		ActionPadY:         0.7,
		ActionMinH:         4.5,
		MessageSize:        2.469,
		MessageLH:          1.25,
		MessagePadX:        1.4,
		MessagePadY:        0.7,
		MessageMinH:        4.5,
		MetaGap:            0.4,
		MetaColGap:         2.0,
		MetaRowH:           5.5,
		MetaValueRowH:      1.5,
		MetaSize:           2.8,
		MetaLH:             1.25,
		MetaPadX:           1.0,
		MetaPadY:           0.7,
		MetaValuePadY:      0.2,
		CellStroke:         0.15,
	}
}

// normalizeFooterLayout fills zero fields from the frontend defaults so older
// print clients without footer_layout still render a coherent chrome band.
func normalizeFooterLayout(l PamphletFooterLayout) PamphletFooterLayout {
	d := defaultFooterLayout()
	pick := func(v, def float64) float64 {
		if v > 0 {
			return v
		}
		return def
	}
	return PamphletFooterLayout{
		Height:             pick(l.Height, d.Height),
		Width:              pick(l.Width, d.Width),
		Pad:                pick(l.Pad, d.Pad),
		Radius:             pick(l.Radius, d.Radius),
		Stroke:             pick(l.Stroke, d.Stroke),
		InnerInset:         pick(l.InnerInset, d.InnerInset),
		InnerStroke:        pick(l.InnerStroke, d.InnerStroke),
		InnerRadius:        pick(l.InnerRadius, d.InnerRadius),
		ChromeGap:          pick(l.ChromeGap, d.ChromeGap),
		DividerOuterStroke: pick(l.DividerOuterStroke, d.DividerOuterStroke),
		DividerGap:         pick(l.DividerGap, d.DividerGap),
		DividerInnerStroke: pick(l.DividerInnerStroke, d.DividerInnerStroke),
		ActionSize:         pick(l.ActionSize, d.ActionSize),
		ActionLH:           pick(l.ActionLH, d.ActionLH),
		ActionPadX:         pick(l.ActionPadX, d.ActionPadX),
		ActionPadY:         pick(l.ActionPadY, d.ActionPadY),
		ActionMinH:         pick(l.ActionMinH, d.ActionMinH),
		MessageSize:        pick(l.MessageSize, d.MessageSize),
		MessageLH:          pick(l.MessageLH, d.MessageLH),
		MessagePadX:        pick(l.MessagePadX, d.MessagePadX),
		MessagePadY:        pick(l.MessagePadY, d.MessagePadY),
		MessageMinH:        pick(l.MessageMinH, d.MessageMinH),
		MetaGap:            pick(l.MetaGap, d.MetaGap),
		MetaColGap:         pick(l.MetaColGap, d.MetaColGap),
		MetaRowH:           pick(l.MetaRowH, d.MetaRowH),
		MetaValueRowH:      pick(l.MetaValueRowH, d.MetaValueRowH),
		MetaSize:           pick(l.MetaSize, d.MetaSize),
		MetaLH:             pick(l.MetaLH, d.MetaLH),
		MetaPadX:           pick(l.MetaPadX, d.MetaPadX),
		MetaPadY:           pick(l.MetaPadY, d.MetaPadY),
		MetaValuePadY:      pick(l.MetaValuePadY, d.MetaValuePadY),
		CellStroke:         pick(l.CellStroke, d.CellStroke),
	}
}

// strokeRoundedRectMm strokes a rounded rectangle. x/top/width/height are mm;
// top is the CSS box top (PDF y increases upward). radius and strokeMm are mm.
func strokeRoundedRectMm(s *strings.Builder, x, top, width, height, radius, strokeMm float64) {
	if width <= 0 || height <= 0 {
		return
	}
	r := radius
	if r < 0 {
		r = 0
	}
	maxR := width / 2
	if height/2 < maxR {
		maxR = height / 2
	}
	if r > maxR {
		r = maxR
	}

	bx := MmToPoints(x)
	by := MmToPoints(top - height) // bottom-left
	bw := MmToPoints(width)
	bh := MmToPoints(height)
	rp := MmToPoints(r)
	// Cubic Bézier kappa for quarter-circle approximation.
	const k = 0.5522847498
	rk := rp * k

	left, right := bx, bx+bw
	bottom, topPt := by, by+bh

	s.WriteString("q\n")
	s.WriteString("0 0 0 RG\n")
	s.WriteString(fmt.Sprintf("%.3f w\n", MmToPoints(strokeMm)))
	// Start at bottom edge just after left radius, go counter-clockwise.
	s.WriteString(fmt.Sprintf("%.2f %.2f m\n", left+rp, bottom))
	s.WriteString(fmt.Sprintf("%.2f %.2f l\n", right-rp, bottom))
	s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f %.2f %.2f c\n",
		right-rp+rk, bottom, right, bottom+rp-rk, right, bottom+rp))
	s.WriteString(fmt.Sprintf("%.2f %.2f l\n", right, topPt-rp))
	s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f %.2f %.2f c\n",
		right, topPt-rp+rk, right-rp+rk, topPt, right-rp, topPt))
	s.WriteString(fmt.Sprintf("%.2f %.2f l\n", left+rp, topPt))
	s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f %.2f %.2f c\n",
		left+rp-rk, topPt, left, topPt-rp+rk, left, topPt-rp))
	s.WriteString(fmt.Sprintf("%.2f %.2f l\n", left, bottom+rp))
	s.WriteString(fmt.Sprintf("%.2f %.2f %.2f %.2f %.2f %.2f c\n",
		left, bottom+rp-rk, left+rp-rk, bottom, left+rp, bottom))
	s.WriteString("S\n")
	s.WriteString("Q\n")
}

// normalizeFooter upgrades legacy footer shapes into labelN/valueN chrome fields.
func normalizeFooter(f PamphletFooter) PamphletFooter {
	// Prior fixed chrome used whatsapp/phone/address/activities as values only.
	if strings.TrimSpace(f.Value1) == "" && strings.TrimSpace(f.Whatsapp) != "" {
		f.Value1 = f.Whatsapp
	}
	if strings.TrimSpace(f.Value2) == "" && strings.TrimSpace(f.Phone) != "" {
		f.Value2 = f.Phone
	}
	if strings.TrimSpace(f.Value3) == "" && strings.TrimSpace(f.Address) != "" {
		f.Value3 = f.Address
	}
	if strings.TrimSpace(f.Value4) == "" && strings.TrimSpace(f.Activities) != "" {
		f.Value4 = f.Activities
	}

	hasStructured := strings.TrimSpace(f.Action) != "" ||
		strings.TrimSpace(f.Message) != "" ||
		strings.TrimSpace(f.Value1) != "" ||
		strings.TrimSpace(f.Value2) != "" ||
		strings.TrimSpace(f.Value3) != "" ||
		strings.TrimSpace(f.Value4) != "" ||
		strings.TrimSpace(f.Label1) != "" ||
		strings.TrimSpace(f.Label2) != "" ||
		strings.TrimSpace(f.Label3) != "" ||
		strings.TrimSpace(f.Label4) != ""
	if !hasStructured && len(f.Items) > 0 {
		textAt := func(i int) string {
			if i < 0 || i >= len(f.Items) {
				return ""
			}
			return f.Items[i].Content
		}
		f.Action = textAt(0)
		f.Message = textAt(1)
		f.Value1 = textAt(2)
		f.Value2 = textAt(3)
		f.Value3 = textAt(4)
		f.Value4 = textAt(5)
	}

	labels := []*string{&f.Label1, &f.Label2, &f.Label3, &f.Label4}
	for i, p := range labels {
		if strings.TrimSpace(*p) == "" {
			*p = pamphletFooterDefaultLabels[i]
		}
	}
	return f
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

// measureWrappedHeightMm returns how many mm of line-box height text needs.
func measureWrappedHeightMm(text string, sizeMm, lh, widthMm float64) float64 {
	text = strings.TrimSpace(text)
	lineH := sizeMm * lh
	if text == "" {
		return lineH
	}
	lines := wrapWordsToWidth(toWinAnsi(text), MmToPoints(sizeMm), MmToPoints(widthMm), false)
	n := len(lines)
	if n < 1 {
		n = 1
	}
	return float64(n) * lineH
}

// drawFooter paints fixed chrome using frontend footer_layout mm: outer frame,
// Acción/Mensaje text, then a 4×2 meta grid. Inner input cell borders are
// desktop edit chrome only — never stroked in the PDF print.
func drawFooter(s *strings.Builder, f PamphletFooter, layout PamphletFooterLayout, x, top, width float64) {
	f = normalizeFooter(f)
	layout = normalizeFooterLayout(layout)
	heightMm := layout.Height
	// Prefer exhaustive FE footer_layout.width when posted; caller width is fallback only.
	if layout.Width > 0 {
		width = layout.Width
	}

	strokeRoundedRectMm(s, x, top, width, heightMm, layout.Radius, layout.Stroke)
	// Thinner second frame: CSS ::after inset is from the padding edge (inner face
	// of the outer border). PDF strokes are centered on the path, so inset the
	// inner path by stroke/2 + clear_inset + inner_stroke/2.
	if layout.InnerInset > 0 && layout.InnerStroke > 0 {
		clear := layout.InnerInset
		pathInset := layout.Stroke/2 + clear + layout.InnerStroke/2
		ix := x + pathInset
		it := top - pathInset
		iw := width - 2*pathInset
		ih := heightMm - 2*pathInset
		if iw > 0 && ih > 0 {
			strokeRoundedRectMm(s, ix, it, iw, ih, layout.InnerRadius, layout.InnerStroke)
		}
	}

	pad := layout.Pad
	innerX := x + pad
	innerTop := top - pad
	innerW := width - 2*pad
	floor := top - heightMm + pad
	cursorTop := innerTop

	dividerH := layout.DividerOuterStroke + layout.DividerGap + layout.DividerInnerStroke

	// Acción — box height from FE layout only; no cell border in print.
	actionTextW := innerW - 2*layout.ActionPadX
	if actionTextW < 4 {
		actionTextW = innerW
	}
	actionTextH := measureWrappedHeightMm(f.Action, layout.ActionSize, layout.ActionLH, actionTextW)
	actionBoxH := layout.ActionPadY*2 + actionTextH
	if actionBoxH < layout.ActionMinH {
		actionBoxH = layout.ActionMinH
	}
	if cursorTop-actionBoxH < floor {
		actionBoxH = cursorTop - floor
	}
	if actionBoxH > 0 {
		if strings.TrimSpace(f.Action) != "" {
			textTop := cursorTop - layout.ActionPadY
			y := textTop - cssBaselineOffsetMm(layout.ActionSize, layout.ActionLH)
			textFloor := cursorTop - actionBoxH + layout.ActionPadY
			writeWrapped(s, "F2", MmToPoints(layout.ActionSize), layout.ActionLH,
				innerX+layout.ActionPadX, y, actionTextW, f.Action, textFloor)
		}
		cursorTop -= actionBoxH
	}

	// Double horizontal rule (same language as footer outer/inner frame).
	if dividerH > 0 && cursorTop-dividerH > floor {
		strokeHorizontalRuleMm(s, innerX, cursorTop, innerW, layout.DividerOuterStroke)
		cursorTop -= layout.DividerOuterStroke + layout.DividerGap
		strokeHorizontalRuleMm(s, innerX, cursorTop, innerW, layout.DividerInnerStroke)
		cursorTop -= layout.DividerInnerStroke
	}

	// Mensaje
	msgTextW := innerW - 2*layout.MessagePadX
	if msgTextW < 4 {
		msgTextW = innerW
	}
	msgTextH := measureWrappedHeightMm(f.Message, layout.MessageSize, layout.MessageLH, msgTextW)
	msgBoxH := layout.MessagePadY*2 + msgTextH
	if msgBoxH < layout.MessageMinH {
		msgBoxH = layout.MessageMinH
	}
	if cursorTop-msgBoxH < floor {
		msgBoxH = cursorTop - floor
	}
	if msgBoxH > 0 {
		if strings.TrimSpace(f.Message) != "" {
			textTop := cursorTop - layout.MessagePadY
			y := textTop - cssBaselineOffsetMm(layout.MessageSize, layout.MessageLH)
			textFloor := cursorTop - msgBoxH + layout.MessagePadY
			writeWrapped(s, "F1", MmToPoints(layout.MessageSize), layout.MessageLH,
				innerX+layout.MessagePadX, y, msgTextW, f.Message, textFloor)
		}
		cursorTop -= msgBoxH + layout.ChromeGap
	}

	half := (innerW - layout.MetaColGap) / 2
	if half < 8 {
		half = innerW / 2
	}
	rightX := innerX + half + layout.MetaColGap

	type metaRow struct {
		left, right string
		isLabel     bool
	}
	allRows := []metaRow{
		{f.Label1, f.Label2, true},
		{f.Value1, f.Value2, false},
		{f.Label3, f.Label4, true},
		{f.Value3, f.Value4, false},
	}
	metaPt := MmToPoints(layout.MetaSize)
	metaSizeMm := layout.MetaSize
	metaLH := layout.MetaLH
	if metaLH <= 0 {
		metaLH = 1.25
	}
	cellW := half - layout.MetaPadX
	if cellW < 4 {
		cellW = half
	}

	drawn := 0
	metaSectionTop := cursorTop
	metaSectionBottom := cursorTop
	for _, row := range allRows {
		if !row.isLabel {
			if strings.TrimSpace(row.left) == "" && strings.TrimSpace(row.right) == "" {
				continue // hide empty value rows (spec 008)
			}
		}
		rowH := layout.MetaRowH
		padY := layout.MetaPadY
		if !row.isLabel {
			rowH = layout.MetaValueRowH
			padY = layout.MetaValuePadY
		}
		if cursorTop-rowH < floor-0.01 {
			break
		}
		if drawn > 0 {
			cursorTop -= layout.MetaGap
		}

		metaY := cursorTop - padY - cssBaselineOffsetMm(metaSizeMm, metaLH)
		font := "F1"
		if row.isLabel {
			font = "F2"
		}
		if strings.TrimSpace(row.left) != "" {
			writeGrayText(s, font, metaPt, innerX+layout.MetaPadX*0.5, metaY, cellW, row.left)
		}
		if strings.TrimSpace(row.right) != "" {
			writeGrayText(s, font, metaPt, rightX+layout.MetaPadX*0.5, metaY, cellW, row.right)
		}
		cursorTop -= rowH
		metaSectionBottom = cursorTop
		drawn++
	}
	if drawn > 0 && metaSectionTop > metaSectionBottom {
		// Top double rule + cross (matches footer orange sketch).
		strokeGrayMetaCrossMm(s, innerX, metaSectionTop, innerW, metaSectionTop-metaSectionBottom, true)
	}
}

// strokeGrayMetaCrossMm paints single gray hairlines: optional top, mid horizontal, center vertical.
// Matches CSS meta ::before/::after overlays — does not affect layout math.
func strokeGrayMetaCrossMm(s *strings.Builder, x, top, width, height float64, includeTop bool) {
	if width <= 0 || height <= 0 {
		return
	}
	const stroke = 0.2
	if includeTop {
		strokeHorizontalRuleGrayMm(s, x, top, width, stroke)
	}
	midY := top - height/2
	strokeHorizontalRuleGrayMm(s, x, midY, width, stroke)
	cx := x + width/2
	strokeVerticalRuleGrayMm(s, cx, top, height, stroke)
}

func strokeHorizontalRuleGrayMm(s *strings.Builder, x, top, width, strokeMm float64) {
	if width <= 0 || strokeMm <= 0 {
		return
	}
	y := MmToPoints(top)
	s.WriteString("q\n")
	s.WriteString("0.4 0.4 0.4 RG\n")
	s.WriteString(fmt.Sprintf("%.3f w\n", MmToPoints(strokeMm)))
	s.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n",
		MmToPoints(x), y, MmToPoints(x+width), y))
	s.WriteString("Q\n")
}

func strokeVerticalRuleGrayMm(s *strings.Builder, x, top, height, strokeMm float64) {
	if height <= 0 || strokeMm <= 0 {
		return
	}
	xp := MmToPoints(x)
	s.WriteString("q\n")
	s.WriteString("0.4 0.4 0.4 RG\n")
	s.WriteString(fmt.Sprintf("%.3f w\n", MmToPoints(strokeMm)))
	s.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n",
		xp, MmToPoints(top), xp, MmToPoints(top-height)))
	s.WriteString("Q\n")
}

// strokeHorizontalRuleMm draws a hairline across the footer (divider outer/inner).
func strokeHorizontalRuleMm(s *strings.Builder, x, top, width, strokeMm float64) {
	if width <= 0 || strokeMm <= 0 {
		return
	}
	y := MmToPoints(top)
	s.WriteString("q\n")
	s.WriteString("0 0 0 RG\n")
	s.WriteString(fmt.Sprintf("%.3f w\n", MmToPoints(strokeMm)))
	s.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n",
		MmToPoints(x), y, MmToPoints(x+width), y))
	s.WriteString("Q\n")
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
