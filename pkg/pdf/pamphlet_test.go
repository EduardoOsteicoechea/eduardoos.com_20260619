package pdf

import "testing"

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

func containsAll(haystack string, needles ...string) bool {
	for _, n := range needles {
		if !stringContains(haystack, n) {
			return false
		}
	}
	return true
}

func stringContains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
