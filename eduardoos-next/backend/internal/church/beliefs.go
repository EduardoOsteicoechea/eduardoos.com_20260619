package church

import (
	"fmt"
	"strings"
)

// normalizeBeliefs cleans belief rows and drops empty heading+body+keys rows.
// Preserves caller order (register up/down).
func normalizeBeliefs(in []Belief) []Belief {
	out := make([]Belief, 0, len(in))
	for _, b := range in {
		heading := strings.TrimSpace(b.Heading)
		body := strings.TrimSpace(b.Body)
		keys := make([]string, 0, len(b.KeyTexts))
		for _, k := range b.KeyTexts {
			k = strings.TrimSpace(k)
			if k != "" {
				keys = append(keys, k)
			}
		}
		if heading == "" && body == "" && len(keys) == 0 {
			continue
		}
		if heading == "" {
			heading = "Creencia"
		}
		out = append(out, Belief{
			Heading:  heading,
			KeyTexts: keys,
			Body:     body,
		})
	}
	return out
}

// ensureBeliefs returns structured beliefs, migrating legacy beliefsDocument blob
// into a single Belief when the list is empty.
func ensureBeliefs(doc ChurchDoc) []Belief {
	if len(doc.Beliefs) > 0 {
		return normalizeBeliefs(doc.Beliefs)
	}
	blob := strings.TrimSpace(doc.BeliefsDocument)
	if blob == "" {
		return nil
	}
	return []Belief{{
		Heading: "Documento de creencias",
		Body:    blob,
	}}
}

// beliefsDocumentSummary builds a plain-text summary for legacy field / search.
func beliefsDocumentSummary(beliefs []Belief) string {
	beliefs = normalizeBeliefs(beliefs)
	if len(beliefs) == 0 {
		return ""
	}
	parts := make([]string, 0, len(beliefs))
	for _, b := range beliefs {
		block := b.Heading
		if len(b.KeyTexts) > 0 {
			block += "\n" + strings.Join(b.KeyTexts, " · ")
		}
		if b.Body != "" {
			block += "\n" + b.Body
		}
		parts = append(parts, block)
	}
	return strings.Join(parts, "\n\n")
}

// resolveBeliefsForWrite prefers structured beliefs; falls back to legacy blob.
func resolveBeliefsForWrite(beliefs []Belief, legacyBlob string) (list []Belief, summary string) {
	list = normalizeBeliefs(beliefs)
	if len(list) == 0 {
		legacyBlob = strings.TrimSpace(legacyBlob)
		if legacyBlob != "" {
			list = []Belief{{Heading: "Documento de creencias", Body: legacyBlob}}
		}
	}
	summary = beliefsDocumentSummary(list)
	if summary == "" {
		summary = strings.TrimSpace(legacyBlob)
	}
	return list, summary
}

// swapBeliefOrder moves index i up (−1) or down (+1); no-op out of bounds.
func swapBeliefOrder(in []Belief, i, delta int) ([]Belief, error) {
	if i < 0 || i >= len(in) {
		return in, fmt.Errorf("belief index out of range")
	}
	j := i + delta
	if j < 0 || j >= len(in) {
		return in, nil
	}
	out := append([]Belief(nil), in...)
	out[i], out[j] = out[j], out[i]
	return out, nil
}
