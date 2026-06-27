package pamphlet

import "testing"

func TestToggleTextHighlightAddsThenRemoves(t *testing.T) {
	h := ToggleTextHighlight(nil, 2, 5)
	if len(h) != 1 || h[0].Start != 2 || h[0].End != 5 {
		t.Fatalf("expected highlight 2:5, got %+v", h)
	}
	h = ToggleTextHighlight(h, 2, 5)
	if len(h) != 0 {
		t.Fatalf("expected highlight removed, got %+v", h)
	}
}

func TestClampHighlightsDropsOutOfRange(t *testing.T) {
	h := []HighlightRange{{Start: 0, End: 10}}
	ClampHighlights(&h, 5)
	if len(h) != 1 || h[0].End != 5 {
		t.Fatalf("expected clamped end=5, got %+v", h)
	}
}
