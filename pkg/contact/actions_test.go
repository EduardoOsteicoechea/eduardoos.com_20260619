package contact

import (
	"strings"
	"testing"
)

func TestStripAndParseEmailAndWhatsApp(t *testing.T) {
	raw := "Perfecto, te conecto.\n\n[[CONTACT_EMAIL email=\"a@b.com\" phone=\"+58412\" name=\"Ana\" note=\"Quiere BIM\"]]\n[[CONTACT_WHATSAPP]]\n"
	clean, actions := StripAndParse(raw)
	if strings.Contains(clean, "CONTACT_") {
		t.Fatalf("markers leaked into clean text: %q", clean)
	}
	if len(actions) != 2 {
		t.Fatalf("want 2 actions, got %#v", actions)
	}
	if actions[0].Type != "email_notify" || actions[0].Email != "a@b.com" {
		t.Fatalf("email action: %#v", actions[0])
	}
	if actions[1].Type != "whatsapp" || actions[1].WhatsAppURL != WhatsAppURL {
		t.Fatalf("whatsapp action: %#v", actions[1])
	}
	if WhatsAppURL != "https://wa.me/584147281033" {
		t.Fatalf("bad wa url %s", WhatsAppURL)
	}
}
