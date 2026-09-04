package ereport

import (
	"strings"
	"testing"
)

func TestMergeAPIPayload_AddItemRejectsMutation(t *testing.T) {
	stored := EmptyPayload()
	incoming := deepCloneMap(stored)
	incoming["reportNumber"] = "N-1"
	secs := asMapSlice(incoming["sections"])
	grps := asMapSlice(secs[0]["groups"])
	items := asMapSlice(grps[0]["items"])
	items = append(items, map[string]any{
		"id":         "new-1",
		"nombre":     "Door",
		"incidencia": "False positive",
		"status":     "reprobado",
		"solucion":   "",
	})
	grps[0]["items"] = toAnySlice(items)
	secs[0]["groups"] = toAnySlice(grps)
	incoming["sections"] = toAnySlice(secs)

	out, err := MergeAPIPayload(stored, incoming)
	if err != nil {
		t.Fatal(err)
	}
	outItems := asMapSlice(asMapSlice(asMapSlice(out["sections"])[0]["groups"])[0]["items"])
	if len(outItems) != 2 {
		t.Fatalf("want 2 items got %d", len(outItems))
	}
	if out["reportNumber"] != "N-1" {
		t.Fatalf("reportNumber=%v", out["reportNumber"])
	}

	// Mutate existing empty item text → reject
	bad := deepCloneMap(out)
	badSecs := asMapSlice(bad["sections"])
	badGrps := asMapSlice(badSecs[0]["groups"])
	badItems := asMapSlice(badGrps[0]["items"])
	badItems[0]["incidencia"] = "changed"
	badGrps[0]["items"] = toAnySlice(badItems)
	badSecs[0]["groups"] = toAnySlice(badGrps)
	bad["sections"] = toAnySlice(badSecs)
	if _, err := MergeAPIPayload(out, bad); err == nil || !strings.Contains(err.Error(), "cannot modify") {
		t.Fatalf("want modify error, got %v", err)
	}
}

func TestMergeAPIPayload_NewItemRequiresTextAndReprobado(t *testing.T) {
	stored := EmptyPayload()
	incoming := map[string]any{
		"sections": []any{
			map[string]any{
				"id": "section-a",
				"groups": []any{
					map[string]any{
						"id": "group-1",
						"items": []any{
							map[string]any{"id": "x1", "incidencia": "", "status": "reprobado"},
						},
					},
				},
			},
		},
	}
	if _, err := MergeAPIPayload(stored, incoming); err == nil || !strings.Contains(err.Error(), "incidencia") {
		t.Fatalf("want text error, got %v", err)
	}
	incoming2 := map[string]any{
		"sections": []any{
			map[string]any{
				"id": "section-a",
				"groups": []any{
					map[string]any{
						"id": "group-1",
						"items": []any{
							map[string]any{"id": "x2", "incidencia": "oops", "status": "aprobado"},
						},
					},
				},
			},
		},
	}
	if _, err := MergeAPIPayload(stored, incoming2); err == nil || !strings.Contains(err.Error(), "reprobado") {
		t.Fatalf("want reprobado error, got %v", err)
	}
}

func TestMergeAPIPayload_NewSection(t *testing.T) {
	stored := EmptyPayload()
	incoming := map[string]any{
		"sections": []any{
			map[string]any{
				"id":    "section-new",
				"title": "2. Added",
				"kind":  "funcionalidades",
				"groups": []any{
					map[string]any{
						"id":    "g-new",
						"title": "Bugs",
						"items": []any{
							map[string]any{
								"id":         "i-new",
								"incidencia": "Leak",
								"status":     "reprobado",
							},
						},
					},
				},
			},
		},
	}
	out, err := MergeAPIPayload(stored, incoming)
	if err != nil {
		t.Fatal(err)
	}
	secs := asMapSlice(out["sections"])
	if len(secs) != 2 {
		t.Fatalf("want 2 sections got %d", len(secs))
	}
}

func toAnySlice(rows []map[string]any) []any {
	out := make([]any, len(rows))
	for i := range rows {
		out[i] = rows[i]
	}
	return out
}
