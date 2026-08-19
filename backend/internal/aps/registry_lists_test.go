package aps

import (
	"encoding/json"
	"testing"
)

func TestExtractDataList_DAShape(t *testing.T) {
	raw := []byte(`{
		"pagination": {"limit": 100, "offset": 0, "totalResults": 2},
		"data": ["Nick.Bundle+prod", "Nick.Other+prod"]
	}`)
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	got := ExtractDataList(payload)
	if len(got) != 2 {
		t.Fatalf("len=%d want 2 got=%v", len(got), got)
	}
	if got[0] != "Nick.Bundle+prod" {
		t.Fatalf("got[0]=%v", got[0])
	}
}

func TestExtractDataList_NilAndEmpty(t *testing.T) {
	if len(ExtractDataList(nil)) != 0 {
		t.Fatal("nil payload must yield empty slice")
	}
	if len(ExtractDataList(map[string]any{"pagination": map[string]any{}})) != 0 {
		t.Fatal("object without data must yield empty slice")
	}
}

func TestExtractDataList_ItemsKey(t *testing.T) {
	got := ExtractDataList(map[string]any{
		"items": []any{map[string]any{"id": "1"}},
	})
	if len(got) != 1 {
		t.Fatalf("len=%d", len(got))
	}
}
