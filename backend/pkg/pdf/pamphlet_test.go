package pdf

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

func TestRobotoWidthsCoverSpanish(t *testing.T) {
	if robotoRegular == nil || robotoBold == nil {
		t.Fatal("Roboto faces not loaded")
	}
	for _, b := range []byte{'A', 'a', 'n', 0xF1, 0xE1, 0xBF} { // n, ñ, á, ¿
		if robotoRegular.widths[b] < 100 {
			t.Fatalf("regular width[%d]=%d too small", b, robotoRegular.widths[b])
		}
		if robotoBold.widths[b] < 100 {
			t.Fatalf("bold width[%d]=%d too small", b, robotoBold.widths[b])
		}
	}
}

func TestBuildPamphletPDFEmbedsRoboto(t *testing.T) {
	data := BuildPamphletPDF(PamphletDocument{
		Type:   "pamphlet_single_sheet",
		Header: PamphletHeader{Title: "Prueba"},
	})
	s := string(data)
	if !strings.Contains(s, "/Subtype /TrueType") || !strings.Contains(s, "/Roboto-Regular") || !strings.Contains(s, "/Roboto-Bold") {
		t.Fatalf("expected embedded Roboto TrueType fonts")
	}
	if strings.Contains(s, "/BaseFont /Helvetica") {
		t.Fatalf("pamphlet PDF should not use built-in Helvetica")
	}
}

func TestMmToPointsLetterLandscape(t *testing.T) {
	w := MmToPoints(PamphletPageWidthMm)
	h := MmToPoints(PamphletPageHeightMm)
	// 279.4mm * 72/25.4 ≈ 792.0 (US Letter long side in landscape)
	if w < 790 || w > 794 {
		t.Fatalf("width points=%v", w)
	}
	if h < 610 || h > 614 {
		t.Fatalf("height points=%v", h)
	}
}

func TestBuildPamphletPDFHasHeaderAndEOF(t *testing.T) {
	data := BuildPamphletPDF(PamphletDocument{
		Type: "pamphlet_single_sheet",
		Header: PamphletHeader{
			Title:  "Prueba",
			Author: "Eduardo",
		},
		Column1: []PamphletItem{{Type: "paragraph", Content: "Hola mundo"}},
		Column3: []PamphletItem{{Type: "heading_1", Content: "Capitulo"}},
	})
	if len(data) < 200 {
		t.Fatalf("pdf too small: %d", len(data))
	}
	s := string(data)
	if !containsAll(s, "%PDF-1.4", "MediaBox", "%%EOF", "/Kids") {
		t.Fatalf("missing pdf markers")
	}
}

func TestToWinAnsiSpanish(t *testing.T) {
	got := toWinAnsi("¿Por qué más críticos?")
	// Must be single-byte WinAnsi, not UTF-8 mojibake (Â¿ / Ã¡).
	if strings.Contains(got, "Â") || strings.Contains(got, "Ã") {
		t.Fatalf("mojibake in %q", got)
	}
	if !strings.Contains(got, "Por qu") {
		t.Fatalf("unexpected %q", got)
	}
	// ¿ = 0xBF, é = 0xE9, á = 0xE1 in WinAnsi/Latin-1
	if !bytes.Contains([]byte(got), []byte{0xBF}) {
		t.Fatalf("missing inverted question mark byte in %q bytes=%v", got, []byte(got))
	}
	if !bytes.Contains([]byte(got), []byte{0xE9}) {
		t.Fatalf("missing e-acute byte in %q bytes=%v", got, []byte(got))
	}
}

func TestDrawHeaderTitleMetaGapMm(t *testing.T) {
	if PamphletHeaderTitleMetaGapMm < 0.5 || PamphletHeaderTitleMetaGapMm > 1.0 {
		t.Fatalf("header title→meta CSS gap want ~0.6mm, got %v", PamphletHeaderTitleMetaGapMm)
	}
	if PamphletHeaderMetaRowGapMm < 0.6 || PamphletHeaderMetaRowGapMm > 1.0 {
		t.Fatalf("header meta row-gap want ~0.8mm, got %v", PamphletHeaderMetaRowGapMm)
	}
	var s strings.Builder
	bottom := drawHeader(&s, PamphletHeader{
		Title:         "Titulo corto",
		Author:        "Eduardo",
		Series:        "Serie X",
		SeriesChapter: "1",
		Date:          "2026-08-14",
	}, 100, 200, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletHeaderHMm)
	out := s.String()
	if !strings.Contains(out, "Titulo corto") {
		t.Fatalf("missing title in stream: %q", out)
	}
	if !strings.Contains(out, "Serie:") || !strings.Contains(out, "Autor:") {
		t.Fatalf("missing labeled meta rows in stream: %q", out)
	}
	if !strings.Contains(out, "0.4 0.4 0.4 rg") {
		t.Fatalf("expected gray meta color ops, got %q", out)
	}
	if strings.Count(out, "Tj") < 3 {
		t.Fatalf("expected title + 2 meta lines, got %q", out)
	}
	// Parse baselines: title must sit above first meta with clearance (no overlap).
	re := regexp.MustCompile(`([\d.]+)\s+([\d.]+)\s+Td`)
	var ys []float64
	for _, m := range re.FindAllStringSubmatch(out, -1) {
		y, _ := strconv.ParseFloat(m[2], 64)
		ys = append(ys, y)
	}
	if len(ys) < 3 {
		t.Fatalf("expected ≥3 Td ops, got %v", ys)
	}
	sort.Float64s(ys)
	titleY := ys[len(ys)-1]
	metaY := ys[len(ys)-2]
	gapMm := (titleY - metaY) * 25.4 / 72.0
	// Title baseline → meta baseline includes descent + 0.6mm gap + meta ascent ≈ 3mm+
	if gapMm < 2.5 {
		t.Fatalf("title→meta baseline gap=%.2fmm too tight (overlap risk); ys=%v", gapMm, ys)
	}
	bandFloor := 200.0 - PamphletHeaderHMm
	if bottom <= bandFloor+0.5 {
		t.Fatalf("header content bottom=%.2f should be above band floor %.2f", bottom, bandFloor)
	}
}

func TestDesktopTitleWrapsTwoLinesLikeSheet(t *testing.T) {
	title := toWinAnsi("¿Cómo sabemos que interpretamos correctamente?")
	sizePt := MmToPoints(pamphletTitleSizeMm)
	maxW := MmToPoints(PamphletColWidthMm*2 + PamphletGutterNarrow)
	lines := wrapWordsToWidth(title, sizePt, maxW, true)
	if len(lines) < 2 {
		t.Fatalf("enlarged title must wrap to at least 2 lines, got %d %q", len(lines), lines)
	}
}

func TestLongTitleFillsHeaderBandLikeDesktop(t *testing.T) {
	var s strings.Builder
	top := 200.0
	width := PamphletColWidthMm*2 + PamphletGutterNarrow
	bottom := drawHeader(&s, PamphletHeader{
		Title:         "¿Cómo sabemos que interpretamos correctamente?",
		Author:        "Eduardo Osteicoechea",
		Series:        "Descubriendo el libro de Romanos",
		SeriesChapter: "1",
		Date:          "2026-08-10",
	}, 100, top, width, PamphletHeaderHMm)
	used := top - bottom
	if used < 21.0 || used > PamphletHeaderHMm {
		t.Fatalf("header content height=%.2fmm must fill the 23mm band (title + both meta rows), got vs cap %v", used, PamphletHeaderHMm)
	}
	out := s.String()
	for _, needle := range []string{"Serie:", "Cap", "Autor:", "Fecha:"} {
		if !strings.Contains(out, needle) {
			t.Fatalf("header clipped meta %q in stream: %q", needle, out)
		}
	}
}

func TestPamphletPage1BodyMatchesSheetBand(t *testing.T) {
	data := BuildPamphletPDF(PamphletDocument{
		Type: "pamphlet_single_sheet",
		Header: PamphletHeader{
			Title:         "Como sabemos",
			Author:        "Eduardo",
			Series:        "Romanos",
			SeriesChapter: "1",
			Date:          "2024-08-10",
		},
		Column1: []PamphletItem{{Type: "paragraph", Content: "Primera linea del cuerpo"}},
	})
	s := string(data)
	re := regexp.MustCompile(`([\d.]+)\s+([\d.]+)\s+Td`)
	var rightYs []float64
	for _, m := range re.FindAllStringSubmatch(s, -1) {
		x, _ := strconv.ParseFloat(m[1], 64)
		y, _ := strconv.ParseFloat(m[2], 64)
		if x > 400 && y > 480 {
			rightYs = append(rightYs, y)
		}
	}
	if len(rightYs) < 3 {
		t.Fatalf("expected title/meta/body Td ops on right half, got %v", rightYs)
	}
	sort.Float64s(rightYs)
	bodyY := rightYs[0]
	// Sheet: rightTop = pageH − margin − header − gutter; first baseline = CSS 3mm × 1.25 strut.
	wantTop := PamphletPageHeightMm - PamphletMarginMm - PamphletHeaderHMm - PamphletHeaderBodyGutterMm
	wantBody := MmToPoints(wantTop - cssBaselineOffsetMm(pamphletBodySizeMm, pamphletBodyLH))
	if bodyY < wantBody-2 || bodyY > wantBody+2 {
		t.Fatalf("body baseline=%.2fpt want ~%.2fpt (sheet band); ys=%v", bodyY, wantBody, rightYs)
	}
}

func TestDrawFooterStructuredChrome(t *testing.T) {
	var s strings.Builder
	drawFooter(&s, PamphletFooter{
		Action:  "Creamos estos materiales",
		Message: "Si deseas conocer más de la Biblia",
		Label1:  "WhatsApp",
		Value1:  "+58 412",
		Label2:  "Teléfono",
		Value2:  "0212-555",
		Label3:  "Dirección",
		Value3:  "Caracas",
		Label4:  "Actividades",
		Value4:  "Domingo 10am",
	}, 10, 58, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletFooterHMm)
	out := s.String()
	for _, want := range []string{"Creamos", "conocer", "WhatsApp", "Tel", "Direcci", "Actividades"} {
		if !strings.Contains(out, want) && !strings.Contains(toWinAnsi(want), want) {
			// WinAnsi may rewrite accents; at least require Latin stems.
			stem := want
			if len(stem) > 6 {
				stem = stem[:6]
			}
			if !strings.Contains(out, stem) {
				t.Fatalf("footer missing %q in stream: %q", want, out)
			}
		}
	}
}

func TestNormalizeFooterMigratesLegacyItems(t *testing.T) {
	got := normalizeFooter(PamphletFooter{
		Items: []PamphletItem{
			{Type: "heading_1", Content: "Acción legacy"},
			{Type: "paragraph", Content: "Mensaje legacy"},
			{Type: "paragraph", Content: "wa"},
			{Type: "paragraph", Content: "tel"},
			{Type: "paragraph", Content: "dir"},
			{Type: "paragraph", Content: "act"},
		},
	})
	if got.Action != "Acción legacy" || got.Message != "Mensaje legacy" || got.Value1 != "wa" {
		t.Fatalf("migrate failed: %+v", got)
	}
	if got.Label1 != "WhatsApp" || got.Label2 != "Teléfono" {
		t.Fatalf("default labels missing: %+v", got)
	}
}

func TestNormalizeFooterMigratesWhatsappKeys(t *testing.T) {
	got := normalizeFooter(PamphletFooter{
		Action:     "A",
		Message:    "M",
		Whatsapp:   "wa",
		Phone:      "ph",
		Address:    "ad",
		Activities: "ac",
	})
	if got.Value1 != "wa" || got.Value2 != "ph" || got.Value3 != "ad" || got.Value4 != "ac" {
		t.Fatalf("whatsapp-key migrate failed: %+v", got)
	}
}

func TestPamphletPageGeometrySums(t *testing.T) {
	// Horizontal: margin + 4 cols + 2 narrow + 1 wide + margin = page width
	sum := PamphletMarginMm*2 +
		PamphletColWidthMm*4 +
		PamphletGutterNarrow*2 +
		PamphletGutterWide
	if sum < PamphletPageWidthMm-0.01 || sum > PamphletPageWidthMm+0.01 {
		t.Fatalf("horizontal sum=%.2f want %.2f", sum, PamphletPageWidthMm)
	}
	// Right cols under header
	right := PamphletPage2BodyMm - PamphletHeaderHMm - PamphletHeaderBodyGutterMm
	if right != PamphletPage1RightColMm {
		t.Fatalf("right col height=%.2f want %.2f", PamphletPage1RightColMm, right)
	}
	// Page 1 vertical stack: margin + header + header-body gutter + body + footer gutter + footer + margin
	vSum := PamphletMarginMm + PamphletHeaderHMm + PamphletHeaderBodyGutterMm +
		PamphletPage1BodyMm + PamphletGutterNarrow + PamphletFooterHMm + PamphletMarginMm
	if vSum < PamphletPageHeightMm-0.01 || vSum > PamphletPageHeightMm+0.01 {
		t.Fatalf("page1 vertical sum=%.2f want %.2f", vSum, PamphletPageHeightMm)
	}
}

func TestWriteWrappedKeepsLastLineAboveFloor(t *testing.T) {
	var s strings.Builder
	floor := 10.0
	// Baseline only 1.5mm above the floor — the old y-lineH gate needed ~3.75mm
	// of clearance and dropped this last sheet line.
	used := writeWrapped(&s, "F1", pamphletBodySizePt, pamphletBodyLH, 10, 11.5, PamphletColWidthMm, "salvacion, todo es gracia.", floor)
	if used <= 0 || !strings.Contains(s.String(), "gracia") {
		t.Fatalf("last line above floor was clipped: used=%v stream=%q", used, s.String())
	}
}

func TestWriteWrappedPaintsOverflowVisibleLastLine(t *testing.T) {
	floor := 10.0
	offset := cssBaselineOffsetMm(pamphletBodySizeMm, pamphletBodyLH)
	// Line box starts 1mm below the column floor (inside the page margin), matching desktop.
	cursorTop := floor - 1.0
	y := cursorTop - offset
	var s strings.Builder
	used := writeWrapped(&s, "F1", pamphletBodySizePt, pamphletBodyLH, 10, y, PamphletColWidthMm, "para santificae", floor)
	if used <= 0 || !strings.Contains(s.String(), "santificae") {
		t.Fatalf("overflow-visible last line clipped: cursor=%.2f y=%.2f used=%v %q", cursorTop, y, used, s.String())
	}
}

func TestDrawColumnKeepsParagraphInPageMargin(t *testing.T) {
	// Heading sits on the column floor; CSS still shows the next paragraph in the margin.
	const top = 40.0
	headLine := pamphletHeadingSizeMm * pamphletHeadingLH
	height := headLine + 0.2
	items := []PamphletItem{
		{Type: "heading_1", Content: "1. Un libro para afianzar"},
		{Type: "paragraph", Content: "Mira como dice Romanos"},
	}
	var s strings.Builder
	drawColumn(&s, items, 10, top, PamphletColWidthMm, height, nil)
	out := s.String()
	if !strings.Contains(out, "afianzar") {
		t.Fatalf("heading missing: %q", out)
	}
	if !strings.Contains(out, "Romanos") {
		t.Fatalf("margin paragraph clipped: %q", out)
	}
}

func TestDrawColumnKeepsTrailingHeadingAndParagraph(t *testing.T) {
	// Desktop CSS: only 2.5mm item gap, heading lh 1.2, no extra heading margin.
	// A packed column must still paint the last heading + following line (the
	// band the PDF used to eat at the page bottom).
	const top = 40.0
	bodyLine := pamphletBodySizeMm * pamphletBodyLH
	headLine := pamphletHeadingSizeMm * pamphletHeadingLH
	// 3 one-line paras + heading + para + 4 gaps
	height := 3*bodyLine + headLine + bodyLine + 4*PamphletItemGapMm + 0.4
	items := []PamphletItem{
		{Type: "paragraph", Content: "aaa"},
		{Type: "paragraph", Content: "bbb"},
		{Type: "paragraph", Content: "ccc"},
		{Type: "heading_1", Content: "1. Un libro para afianzar"},
		{Type: "paragraph", Content: "Mira como dice Romanos"},
	}
	var s strings.Builder
	drawColumn(&s, items, 10, top, PamphletColWidthMm, height, nil)
	out := s.String()
	if !strings.Contains(out, "afianzar") {
		t.Fatalf("trailing heading clipped: %q", out)
	}
	if !strings.Contains(out, "Romanos") {
		t.Fatalf("trailing paragraph clipped: %q", out)
	}
}

func TestWrapWordsStaysInsideColumn(t *testing.T) {
	text := toWinAnsi("Ignorar el enfoque correcto puede hacer que destruyas tu vida con la Biblia.")
	sizePt := 8.5
	maxW := MmToPoints(PamphletColWidthMm)
	lines := wrapWordsToWidth(text, sizePt, maxW, false)
	for _, line := range lines {
		if stringWidthPt(line, sizePt, false) > maxW+0.5 {
			t.Fatalf("line too wide: %q width=%.1f max=%.1f", line, stringWidthPt(line, sizePt, false), maxW)
		}
	}
}

func TestBuildPamphletPDFEmbedsJPEG(t *testing.T) {
	dataURL := tinyJPEGDataURL(t)
	data := BuildPamphletPDF(PamphletDocument{
		Type: "pamphlet_single_sheet",
		Header: PamphletHeader{
			Title: "Con imagen",
		},
		Column1: []PamphletItem{{
			Type:     "image",
			Content:  dataURL,
			HeightMm: 40,
		}},
	})
	s := string(data)
	if !strings.Contains(s, "/Subtype /Image") || !strings.Contains(s, "/DCTDecode") {
		t.Fatalf("expected embedded JPEG XObject")
	}
	if !strings.Contains(s, "/Im1 Do") {
		t.Fatalf("expected image paint operator")
	}
	if strings.Contains(s, "[imagen]") {
		t.Fatalf("should not fall back to placeholder when JPEG decodes")
	}
}

func TestDrawImageAppliesPanDownOffset(t *testing.T) {
	dataURL := tinyJPEGDataURL(t)
	base := BuildPamphletPDF(PamphletDocument{
		Type:   "pamphlet_single_sheet",
		Header: PamphletHeader{Title: "Pan"},
		Column1: []PamphletItem{{
			Type:     "image",
			Content:  dataURL,
			HeightMm: 40,
			StyleIndexes: [][]int{
				{0, 0},
				{0, 0},
				{100, 0},
			},
		}},
	})
	panned := BuildPamphletPDF(PamphletDocument{
		Type:   "pamphlet_single_sheet",
		Header: PamphletHeader{Title: "Pan"},
		Column1: []PamphletItem{{
			Type:     "image",
			Content:  dataURL,
			HeightMm: 40,
			StyleIndexes: [][]int{
				{0, 0},
				{0, 1000}, // +10mm CSS down → PDF y decreases
				{100, 0},
			},
		}},
	})
	if string(base) == string(panned) {
		t.Fatal("expected pan-down style_indexes to change PDF content stream")
	}
	if !strings.Contains(string(panned), "cm /Im1 Do") {
		t.Fatal("expected image paint in panned PDF")
	}
}

func tinyJPEGDataURL(t *testing.T) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 40, B: 40, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

func containsAll(haystack string, needles ...string) bool {
	for _, n := range needles {
		if !strings.Contains(haystack, n) {
			return false
		}
	}
	return true
}
