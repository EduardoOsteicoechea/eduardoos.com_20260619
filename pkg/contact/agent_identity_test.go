package contact

import (
	"strings"
	"testing"
)

func TestProfileQASystemPromptRejectsImpersonation(t *testing.T) {
	p := ProfileQASystemPrompt
	mustContain := []string{
		"AI agent",
		"NOT Eduardo",
		"never impersonate",
		"third person",
		"professional, relaxed, concrete, and didactic",
		"[[CONTACT_EMAIL",
		"[[CONTACT_WHATSAPP]]",
	}
	for _, s := range mustContain {
		if !strings.Contains(p, s) {
			t.Fatalf("ProfileQASystemPrompt missing %q", s)
		}
	}
	forbidden := []string{
		"Speak in first person as Eduardo",
		"as Eduardo when natural",
	}
	for _, s := range forbidden {
		if strings.Contains(p, s) {
			t.Fatalf("ProfileQASystemPrompt still allows impersonation phrase %q", s)
		}
	}
}

func TestWelcomeMessagesDiscloseAgentRole(t *testing.T) {
	for _, msg := range []string{DefaultWelcomeMessage, HomeWelcomeMessage} {
		if !strings.Contains(msg, "AI agent") {
			t.Fatalf("welcome must disclose AI agent role: %q", msg)
		}
		if !strings.Contains(msg, "not Eduardo") {
			t.Fatalf("welcome must deny being Eduardo: %q", msg)
		}
		lower := strings.ToLower(msg)
		if strings.Contains(lower, "i am eduardo osteicoechea") {
			t.Fatalf("welcome must not claim to be Eduardo: %q", msg)
		}
	}
}
