package pamphlet

import "testing"

func TestSplitParagraphPreservesWords(t *testing.T) {
	text := "one two three four five six seven eight nine ten"
	fit, rest := SplitParagraph(text, 8, 40, 10, 1.2)
	if fit == "" {
		t.Fatal("expected fit chunk")
	}
	if fit+rest != text && rest != "" {
		combined := fit
		if rest != "" {
			combined += " " + rest
		}
		if combined != text {
			t.Fatalf("words lost: fit=%q rest=%q", fit, rest)
		}
	}
}

func TestFlattenDefaultDocument(t *testing.T) {
	blocks := FlattenContent(DefaultDocument().Content, DefaultDocument().Header)
	if len(blocks) == 0 {
		t.Fatal("expected flattened blocks from default document")
	}
}

func TestEightColumnDistribution(t *testing.T) {
	cfg := DefaultLayoutConfig()
	doc := DefaultDocument()
	rects := EightColumnRects(cfg, doc.Header, doc.Footer)
	widths := make([]float64, 8)
	heights := make([]float64, 8)
	for i, r := range rects {
		widths[i] = r.WidthMM
		heights[i] = r.HeightMM
	}
	blocks := FlattenContent(doc.Content, doc.Header)
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	distributed := DistributeBlocksEightColumns(blocks, widths, heights, cfg.FontSizePt, cfg.LineHeightFactor, paraSep, cfg.IdeaHeadingBottomMarginMM)
	if len(distributed) != 8 {
		t.Fatalf("expected 8 columns, got %d", len(distributed))
	}
	html := RenderPreviewSheets(cfg, doc)
	if html == "" || !contains(html, "sheet1") {
		t.Fatal("preview HTML missing sheet1")
	}
	if sheet1RightFull(distributed, heights, cfg) && sheet2HasContent(distributed) && !contains(html, "sheet2") {
		t.Fatal("expected sheet2 when first right columns are full and sheet2 has content")
	}
}

func contains(s, sub string) bool {
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
