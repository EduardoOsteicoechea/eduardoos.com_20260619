package pdf

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

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
	if PamphletHeaderTitleMetaGapMm < 1.0 || PamphletHeaderTitleMetaGapMm > 2.0 {
		t.Fatalf("header title→meta gap want ~1.2mm (match desktop), got %v", PamphletHeaderTitleMetaGapMm)
	}
	var s strings.Builder
	drawHeader(&s, PamphletHeader{
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
	// Title + at least two meta text ops
	if strings.Count(out, "Tj") < 3 {
		t.Fatalf("expected title + 2 meta lines, got %q", out)
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

func TestWrapWordsStaysInsideColumn(t *testing.T) {
	text := toWinAnsi("Ignorar el enfoque correcto puede hacer que destruyas tu vida con la Biblia.")
	sizePt := 8.5
	maxW := MmToPoints(PamphletColWidthMm)
	lines := wrapWordsToWidth(text, sizePt, maxW)
	charW := sizePt * helveticaAvgGlyph
	for _, line := range lines {
		if float64(len(line))*charW > maxW+charW {
			t.Fatalf("line too wide: %q width≈%.1f max=%.1f", line, float64(len(line))*charW, maxW)
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
