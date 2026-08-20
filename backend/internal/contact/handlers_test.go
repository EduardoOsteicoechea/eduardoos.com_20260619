package contact

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestValidHumanToken(t *testing.T) {
	if !ValidHumanToken("h1:contact:5000") {
		t.Fatal("expected Next h1 token with 5000ms to pass")
	}
	if ValidHumanToken("h1:contact:4999") {
		t.Fatal("expected short hold to fail")
	}
	if !ValidHumanToken("ok:home:5") {
		t.Fatal("expected legacy ok token with 5s to pass")
	}
	if ValidHumanToken("ok:home:4") {
		t.Fatal("expected legacy short hold to fail")
	}
	if ValidHumanToken("bad:contact:9000") {
		t.Fatal("expected unknown prefix to fail")
	}
}

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
	if actions[1].Type != "whatsapp" || actions[1].WhatsAppURL != WhatsAppURL || actions[1].URL != WhatsAppURL {
		t.Fatalf("whatsapp action: %#v", actions[1])
	}
}

func TestProfileQASystemPromptRejectsImpersonation(t *testing.T) {
	mustContain := []string{
		"AI agent",
		"NOT Eduardo",
		"never impersonate",
		"third person",
		"same language",
		"never default to Spanish",
		"[[CONTACT_EMAIL",
		"[[CONTACT_WHATSAPP]]",
		"residing in Venezuela",
		"Never disclose family",
		"based on the provided context",
		"this individual",
		"eduardooost@gmail.com",
		"https://wa.me/584147281033",
		"mailto:eduardooost@gmail.com",
		"Open WhatsApp button",
	}
	for _, s := range mustContain {
		if !strings.Contains(ProfileQASystemPrompt, s) {
			t.Fatalf("ProfileQASystemPrompt missing %q", s)
		}
	}
}

func TestProfessionalProfileContextThirdPersonFacts(t *testing.T) {
	mustContain := []string{
		"Eduardo Osteicoechea",
		"Universidad de Los Andes",
		"Avant Leap",
		"March 2024–present",
		"eduardooost@gmail.com",
		"BIMIQs",
		"Venezuela",
	}
	for _, s := range mustContain {
		if !strings.Contains(professionalProfileContext, s) {
			t.Fatalf("professionalProfileContext missing %q", s)
		}
	}
	// Factual brief must stay third person — no first-person work claims.
	banned := []string{"I worked", "I'm developing", "I started", "my license"}
	lower := strings.ToLower(professionalProfileContext)
	for _, s := range banned {
		if strings.Contains(lower, strings.ToLower(s)) {
			t.Fatalf("professionalProfileContext must not use first person %q", s)
		}
	}
}

func TestBuildUserPromptInjectsProfile(t *testing.T) {
	got := buildUserPrompt("Architecture", "Who is Eduardo?", nil)
	if !strings.Contains(got, "Professional profile context:") {
		t.Fatal("missing profile header")
	}
	if !strings.Contains(got, professionalProfileContext) {
		t.Fatal("missing full professionalProfileContext")
	}
	if !strings.Contains(got, OwnerEmail) || !strings.Contains(got, WhatsAppURL) {
		t.Fatal("missing public contact lines")
	}
	if !strings.Contains(got, "Optional skill focus: Architecture") {
		t.Fatal("missing skill focus")
	}
	if !strings.Contains(got, "Visitor question:\nWho is Eduardo?") {
		t.Fatal("missing visitor question")
	}
}

func TestAskRoutesPublicNoJWT(t *testing.T) {
	h := &Handler{
		LLM: func(_ context.Context, _, _ string) (string, error) {
			return "Eduardo is an AEC technologist. [[CONTACT_WHATSAPP]]", nil
		},
	}
	r := chi.NewRouter()
	h.Routes(r)

	for _, path := range []string{"/api/contact/ask", "/api/profile/ask"} {
		body := `{"question":"who is eduardo","skill":"Contact","history":[],"humanToken":"h1:contact:5500"}`
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", path, rec.Code, rec.Body.String())
		}
		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("%s json: %v", path, err)
		}
		answer, _ := resp["answer"].(string)
		if !strings.Contains(answer, "AEC technologist") {
			t.Fatalf("%s answer=%q", path, answer)
		}
		if strings.Contains(answer, "CONTACT_") {
			t.Fatalf("%s markers leaked: %q", path, answer)
		}
		if resp["whatsappUrl"] != WhatsAppURL {
			t.Fatalf("%s whatsappUrl=%v", path, resp["whatsappUrl"])
		}
	}
}

func TestAskRequiresHumanToken(t *testing.T) {
	h := &Handler{
		LLM: func(_ context.Context, _, _ string) (string, error) {
			return "ok", nil
		},
	}
	r := chi.NewRouter()
	h.Routes(r)
	req := httptest.NewRequest(http.MethodPost, "/api/contact/ask",
		bytes.NewBufferString(`{"question":"hi","humanToken":"h1:contact:100"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d want 403", rec.Code)
	}
}

func TestAskMissingLLMReturns503(t *testing.T) {
	h := &Handler{}
	r := chi.NewRouter()
	h.Routes(r)
	req := httptest.NewRequest(http.MethodPost, "/api/profile/ask",
		bytes.NewBufferString(`{"question":"who is eduardo","humanToken":"ok:home:8"}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", rec.Code)
	}
}
