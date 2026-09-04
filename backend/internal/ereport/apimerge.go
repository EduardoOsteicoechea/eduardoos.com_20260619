package ereport

import (
	"encoding/json"
	"fmt"
	"strings"
)

// MergeAPIPayload applies additive-only API writes (spec 070).
// Existing sections/groups/items (by id) cannot be modified or removed.
// New items require non-empty incidencia and status "reprobado".
// Non-sections root fields are taken from incoming when present.
func MergeAPIPayload(stored, incoming map[string]any) (map[string]any, error) {
	if incoming == nil {
		return nil, fmt.Errorf("payload required")
	}
	base := stored
	if base == nil {
		base = EmptyPayload()
	}
	out := deepCloneMap(base)

	for k, v := range incoming {
		if k == "sections" {
			continue
		}
		out[k] = deepCloneAny(v)
	}

	storedSecs := asMapSlice(base["sections"])
	incomingSecs := asMapSlice(incoming["sections"])
	storedSecByID := indexByID(storedSecs)

	resultSecs := make([]any, 0, len(storedSecs)+len(incomingSecs))
	for _, s := range storedSecs {
		resultSecs = append(resultSecs, deepCloneMap(s))
	}
	resultSecByID := indexByID(asMapSlice(resultSecs))

	for _, inSec := range incomingSecs {
		sid := strings.TrimSpace(asString(inSec["id"]))
		if sid == "" {
			return nil, fmt.Errorf("section id required")
		}
		storedSec, exists := storedSecByID[sid]
		if !exists {
			if err := validateNewSection(inSec); err != nil {
				return nil, err
			}
			resultSecs = append(resultSecs, deepCloneMap(inSec))
			resultSecByID[sid] = inSec
			continue
		}
		if err := assertUnchangedMeta(storedSec, inSec, []string{"title", "kind"}, "section "+sid); err != nil {
			return nil, err
		}
		mergedSec := resultSecByID[sid]
		if mergedSec == nil {
			return nil, fmt.Errorf("internal: missing section %s", sid)
		}
		mergedGroups, err := mergeGroups(asMapSlice(storedSec["groups"]), asMapSlice(inSec["groups"]), asMapSlice(mergedSec["groups"]))
		if err != nil {
			return nil, err
		}
		mergedSec["groups"] = mergedGroups
	}

	out["sections"] = resultSecs
	return out, nil
}

func mergeGroups(storedGroups, incomingGroups, resultGroups []map[string]any) ([]any, error) {
	storedByID := indexByID(storedGroups)
	resultByID := indexByID(resultGroups)
	out := make([]any, 0, len(resultGroups)+len(incomingGroups))
	for _, g := range resultGroups {
		out = append(out, g)
	}

	for _, inGrp := range incomingGroups {
		gid := strings.TrimSpace(asString(inGrp["id"]))
		if gid == "" {
			return nil, fmt.Errorf("group id required")
		}
		storedGrp, exists := storedByID[gid]
		if !exists {
			if err := validateNewGroup(inGrp); err != nil {
				return nil, err
			}
			out = append(out, deepCloneMap(inGrp))
			resultByID[gid] = inGrp
			continue
		}
		if err := assertUnchangedMeta(storedGrp, inGrp, []string{"title"}, "group "+gid); err != nil {
			return nil, err
		}
		mergedGrp := resultByID[gid]
		if mergedGrp == nil {
			return nil, fmt.Errorf("internal: missing group %s", gid)
		}
		mergedItems, err := mergeItems(asMapSlice(storedGrp["items"]), asMapSlice(inGrp["items"]), asMapSlice(mergedGrp["items"]))
		if err != nil {
			return nil, err
		}
		mergedGrp["items"] = mergedItems
	}
	return out, nil
}

func mergeItems(storedItems, incomingItems, resultItems []map[string]any) ([]any, error) {
	storedByID := indexByID(storedItems)
	resultByID := indexByID(resultItems)
	out := make([]any, 0, len(resultItems)+len(incomingItems))
	for _, it := range resultItems {
		out = append(out, it)
	}

	for _, inItem := range incomingItems {
		iid := strings.TrimSpace(asString(inItem["id"]))
		if iid == "" {
			return nil, fmt.Errorf("item id required")
		}
		storedItem, exists := storedByID[iid]
		if !exists {
			if err := validateNewAPIItem(inItem); err != nil {
				return nil, err
			}
			if _, dup := resultByID[iid]; dup {
				return nil, fmt.Errorf("duplicate new item id %s", iid)
			}
			out = append(out, deepCloneMap(inItem))
			resultByID[iid] = inItem
			continue
		}
		if !jsonEqual(storedItem, inItem) {
			return nil, fmt.Errorf("cannot modify existing issue %s (API posts are additive only)", iid)
		}
	}
	return out, nil
}

func validateNewAPIItem(it map[string]any) error {
	text := strings.TrimSpace(asString(it["incidencia"]))
	if text == "" {
		return fmt.Errorf("new issues require non-empty incidencia text")
	}
	if asString(it["status"]) != "reprobado" {
		return fmt.Errorf("new issues must have status reprobado")
	}
	return nil
}

func validateNewSection(sec map[string]any) error {
	for _, g := range asMapSlice(sec["groups"]) {
		if err := validateNewGroup(g); err != nil {
			return err
		}
	}
	return nil
}

func validateNewGroup(g map[string]any) error {
	items := asMapSlice(g["items"])
	for _, it := range items {
		if err := validateNewAPIItem(it); err != nil {
			return err
		}
	}
	return nil
}

func assertUnchangedMeta(stored, incoming map[string]any, keys []string, label string) error {
	for _, k := range keys {
		if _, ok := incoming[k]; !ok {
			continue
		}
		if asString(stored[k]) != asString(incoming[k]) {
			return fmt.Errorf("cannot modify %s field %s (API posts are additive only)", label, k)
		}
	}
	return nil
}

func indexByID(rows []map[string]any) map[string]map[string]any {
	out := make(map[string]map[string]any, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(asString(row["id"]))
		if id != "" {
			out[id] = row
		}
	}
	return out
}

func asMapSlice(v any) []map[string]any {
	arr, ok := v.([]any)
	if !ok {
		// already []map from clone edge cases
		if typed, ok2 := v.([]map[string]any); ok2 {
			return typed
		}
		return nil
	}
	out := make([]map[string]any, 0, len(arr))
	for _, el := range arr {
		if m, ok := el.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}

func deepCloneMap(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	b, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func deepCloneAny(v any) any {
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

func jsonEqual(a, b map[string]any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}
