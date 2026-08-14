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
	if PamphletHeaderTitleMetaGapMm != 5.0 {
		t.Fatalf("header title→meta gap want 5mm, got %v", PamphletHeaderTitleMetaGapMm)
	}
	var s strings.Builder
	drawHeader(&s, PamphletHeader{
		Title:  "Titulo corto",
		Author: "Eduardo",
		Series: "Serie",
	}, 100, 200, PamphletColWidthMm*2+PamphletGutterNarrow, PamphletHeaderHMm)
	out := s.String()
	if !strings.Contains(out, "Titulo corto") {
		t.Fatalf("missing title in stream: %q", out)
	}
	if !strings.Contains(out, "Eduardo") {
		t.Fatalf("missing meta in stream: %q", out)
	}
	// Two text objects: title then meta — both must appear.
	if strings.Count(out, "Tj") < 2 {
		t.Fatalf("expected title + meta text ops, got %q", out)
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
