package aps

// ExtractDataList pulls Autodesk Design Automation / Data Management list
// payloads into a flat []any for JSON clients.
//
// DA endpoints (/appbundles, /activities, /engines) return objects like:
//
//	{ "data": [ ... ], "pagination": { ... } }
//
// Historically Registry forwarded those maps verbatim. The APS admin UI then
// called .map on the objects, threw, and React blanked the whole page.
// Always return a real array (possibly empty) so clients can iterate safely.
func ExtractDataList(payload map[string]any) []any {
	if payload == nil {
		return []any{}
	}
	if data, ok := payload["data"].([]any); ok {
		return data
	}
	if items, ok := payload["items"].([]any); ok {
		return items
	}
	// Unexpected shape: do not invent entries; empty list keeps the UI alive.
	return []any{}
}
