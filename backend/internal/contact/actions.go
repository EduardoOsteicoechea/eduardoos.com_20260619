package contact

import (
	"regexp"
	"strings"
)

// Action is a structured handoff the UI / server should execute after a chat turn.
type Action struct {
	Type        string `json:"type"` // email_notify | whatsapp
	Name        string `json:"name,omitempty"`
	Email       string `json:"email,omitempty"`
	Phone       string `json:"phone,omitempty"`
	Note        string `json:"note,omitempty"`
	WhatsAppURL string `json:"whatsappUrl,omitempty"`
	// URL mirrors WhatsAppURL for clients that only read url/href.
	URL string `json:"url,omitempty"`
}

var (
	reEmailMarker = regexp.MustCompile(`(?i)\[\[CONTACT_EMAIL\s+([^\]]*)\]\]`)
	reWAMarker    = regexp.MustCompile(`(?i)\[\[CONTACT_WHATSAPP\s*\]\]`)
	reAttr        = regexp.MustCompile(`(?i)(email|phone|name|note)\s*=\s*"([^"]*)"`)
)

// StripAndParse removes contact markers from assistant text and returns actions.
func StripAndParse(raw string) (clean string, actions []Action) {
	clean = raw
	for _, m := range reEmailMarker.FindAllStringSubmatch(raw, -1) {
		attrs := parseAttrs(m[1])
		actions = append(actions, Action{
			Type:  "email_notify",
			Name:  attrs["name"],
			Email: attrs["email"],
			Phone: attrs["phone"],
			Note:  attrs["note"],
		})
		clean = strings.ReplaceAll(clean, m[0], "")
	}
	for _, m := range reWAMarker.FindAllString(raw, -1) {
		actions = append(actions, Action{
			Type:        "whatsapp",
			WhatsAppURL: WhatsAppURL,
			URL:         WhatsAppURL,
		})
		clean = strings.ReplaceAll(clean, m, "")
	}
	clean = strings.TrimSpace(clean)
	return clean, actions
}

func parseAttrs(blob string) map[string]string {
	out := map[string]string{}
	for _, m := range reAttr.FindAllStringSubmatch(blob, -1) {
		out[strings.ToLower(m[1])] = strings.TrimSpace(m[2])
	}
	return out
}
