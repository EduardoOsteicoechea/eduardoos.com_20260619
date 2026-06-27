package pamphlet

import (
	"strings"
	"testing"
)

func TestPreviewParagraphSpacingInline(t *testing.T) {
	cfg := DefaultLayoutConfig()
	doc := DefaultDocument()
	html := RenderPreviewSheets(cfg, doc)
	if !strings.Contains(html, `margin-bottom:`) {
		t.Fatalf("expected margin-bottom inline styles in preview HTML")
	}
	count := strings.Count(html, `margin-bottom:`)
	if count < 3 {
		t.Fatalf("expected multiple margin-bottom declarations, got %d", count)
	}
}

func TestPreviewParagraphSpacingAfterDelete(t *testing.T) {
	cfg := DefaultLayoutConfig()
	doc := DefaultDocument()
	if len(doc.Content.Ideas) == 0 || len(doc.Content.Ideas[0].Subideas) < 2 {
		t.Fatal("default document missing subideas")
	}
	idea := &doc.Content.Ideas[0]
	idea.Subideas = append(idea.Subideas[:1], idea.Subideas[2:]...)
	html := RenderPreviewSheets(cfg, doc)
	if !strings.Contains(html, `margin-bottom:`) {
		t.Fatalf("after delete: expected margin-bottom inline styles, got none")
	}
	if !strings.Contains(html, `--para-sep-mm:`) {
		t.Fatalf("after delete: expected --para-sep-mm CSS variable on sheet")
	}
}
