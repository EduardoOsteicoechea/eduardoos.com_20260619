package pamphlet

import (
	"strings"
	"testing"
)

func TestComputePage1LayoutHeightsSum(t *testing.T) {
	cfg := DefaultLayoutConfig()
	doc := DefaultDocument()
	p1 := ComputePage1Layout(cfg, doc.Header, doc.Footer)

	if p1.HeaderHeightMM <= 0 {
		t.Fatalf("expected positive header height, got %.4f", p1.HeaderHeightMM)
	}
	if p1.HalvesHeightMM <= 0 {
		t.Fatalf("expected positive halves height, got %.4f", p1.HalvesHeightMM)
	}

	sum := p1.HeaderHeightMM + p1.HFGapMM + p1.HalvesHeightMM
	if diff := sum - p1.ContentHeightMM; diff < -0.01 || diff > 0.01 {
		t.Fatalf("header+gap+halves should equal content height: got %.4f vs %.4f", sum, p1.ContentHeightMM)
	}

	backStack := p1.BackBodyHeightMM + p1.HFGapMM + p1.FooterHeightMM
	if diff := backStack - p1.HalvesHeightMM; diff < -0.01 || diff > 0.01 {
		t.Fatalf("back body+gap+footer should equal halves height: got %.4f vs %.4f", backStack, p1.HalvesHeightMM)
	}

	if p1.FrontBodyHeightMM != p1.HalvesHeightMM {
		t.Fatalf("front body should fill halves row: %.4f vs %.4f", p1.FrontBodyHeightMM, p1.HalvesHeightMM)
	}
}

func TestRenderSheet1FullWidthHeader(t *testing.T) {
	cfg := DefaultLayoutConfig()
	doc := DefaultDocument()
	html := RenderPreviewSheets(cfg, doc)

	if !strings.Contains(html, `class="sheet sheet-page-1"`) {
		t.Fatal("expected sheet-page-1 class on sheet 1")
	}
	if !strings.Contains(html, `class="zone-header sheet-page-header"`) {
		t.Fatal("expected full-width sheet-page-header")
	}
	if strings.Contains(html, `block right sheet1-right`) && strings.Contains(html, `zone-header`) {
		rightIdx := strings.Index(html, `block right sheet1-right`)
		headerIdx := strings.Index(html, `id="zone-header"`)
		if headerIdx > rightIdx {
			t.Fatal("header should appear before the right half block")
		}
	}
	if !strings.Contains(html, `sheet-page-halves`) {
		t.Fatal("expected sheet-page-halves row")
	}
	if !strings.Contains(html, `height:`) {
		t.Fatal("expected explicit height styles on page 1 zones")
	}
}
