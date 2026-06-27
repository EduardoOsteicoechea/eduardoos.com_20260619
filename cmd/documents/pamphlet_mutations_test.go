package main

import (
	"strings"
	"testing"

	"eduardoos/pkg/pamphlet"
)

func TestInsertSubideaBelowCreatesVisibleParagraph(t *testing.T) {
	doc := pamphlet.DefaultDocument()
	if len(doc.Content.Ideas) == 0 || len(doc.Content.Ideas[0].Subideas) == 0 {
		t.Fatal("default document missing subideas")
	}
	before := len(doc.Content.Ideas[0].Subideas)
	newRef, err := insertSubideaBelow(&doc, "0:subidea:0", "")
	if err != nil {
		t.Fatalf("insertSubideaBelow: %v", err)
	}
	if newRef != "0:subidea:1" {
		t.Fatalf("expected newRef 0:subidea:1, got %q", newRef)
	}
	if len(doc.Content.Ideas[0].Subideas) != before+1 {
		t.Fatalf("expected %d subideas, got %d", before+1, len(doc.Content.Ideas[0].Subideas))
	}
	if strings.TrimSpace(doc.Content.Ideas[0].Subideas[1].Content) == "" {
		t.Fatal("inserted paragraph content should not be empty")
	}
	html := pamphlet.RenderPreviewSheets(pamphlet.DefaultLayoutConfig(), doc)
	if !strings.Contains(html, `data-content-ref="0:subidea:1"`) {
		t.Fatalf("preview HTML missing new ref %q", newRef)
	}
	if !strings.Contains(html, defaultInsertParagraphText) {
		t.Fatalf("preview HTML missing placeholder text %q", defaultInsertParagraphText)
	}
}

func TestApplyContentMutationInsertReturnsNewRef(t *testing.T) {
	doc := pamphlet.DefaultDocument()
	updated, newRef, err := applyContentMutation(&doc, contentMutationRequest{
		Op:  "insert_below",
		Ref: "0:subidea:0",
	})
	if err != nil {
		t.Fatalf("applyContentMutation: %v", err)
	}
	if newRef != "0:subidea:1" {
		t.Fatalf("expected newRef, got %q", newRef)
	}
	if len(updated.Content.Ideas) == 0 {
		t.Fatal("expected ideas in updated document")
	}
}
