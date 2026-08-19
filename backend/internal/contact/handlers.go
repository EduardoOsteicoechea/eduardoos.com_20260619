package contact

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// Handler serves public profile/contact ask routes (no JWT).
type Handler struct {
	Mail *auth.Handler
	LLM  LLMFunc
}

// NewHandler builds a contact handler with DeepSeek when configured.
func NewHandler(mail *auth.Handler) *Handler {
	return &Handler{
		Mail: mail,
		LLM:  NewDeepSeekLLM(),
	}
}

// Routes mounts the public ask endpoints expected by the Astro ContactAgent.
//
//	POST /api/contact/ask  — contact page
//	POST /api/profile/ask  — home dock / skill chat
func (h *Handler) Routes(r chi.Router) {
	r.Post("/api/contact/ask", h.AskContact)
	r.Post("/api/profile/ask", h.AskProfile)
}

type askBody struct {
	Question   string   `json:"question"`
	Skill      string   `json:"skill"`
	History    []string `json:"history"`
	HumanToken string   `json:"humanToken"`
}

// AskContact answers visitor questions from the contact page agent.
func (h *Handler) AskContact(w http.ResponseWriter, r *http.Request) {
	h.ask(w, r, "contact.ask", "Contacto")
}

// AskProfile answers visitor questions from the home dock agent.
func (h *Handler) AskProfile(w http.ResponseWriter, r *http.Request) {
	h.ask(w, r, "profile.ask", "")
}

func (h *Handler) ask(w http.ResponseWriter, r *http.Request, flight, defaultSkill string) {
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] %s started", cid, flight)

	var body askBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !ValidHumanToken(body.HumanToken) {
		httpx.WriteError(w, http.StatusForbidden, "human verification required")
		return
	}
	q := strings.TrimSpace(body.Question)
	if q == "" {
		httpx.WriteError(w, http.StatusBadRequest, "question required")
		return
	}
	if len(q) > 2000 {
		q = q[:2000]
	}
	skill := strings.TrimSpace(body.Skill)
	if skill == "" {
		skill = defaultSkill
	}
	if h.LLM == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "DEEPSEEK_API_KEY is not configured")
		return
	}

	userPrompt := buildUserPrompt(skill, q, body.History)
	raw, err := h.LLM(r.Context(), ProfileQASystemPrompt, userPrompt)
	if err != nil {
		log.Printf("[correlation=%s] %s llm error: %v", cid, flight, err)
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	answer, actions := StripAndParse(raw)
	h.applyActions(cid, actions, q)
	log.Printf("[correlation=%s] %s success", cid, flight)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"answer":      answer,
		"actions":     actions,
		"whatsappUrl": WhatsAppURL,
		"ownerEmail":  OwnerEmail,
	})
}

func buildUserPrompt(skill, question string, history []string) string {
	var b strings.Builder
	b.WriteString("Professional profile context:\n")
	b.WriteString(professionalProfileContext)
	b.WriteString("\n\nPublic contact:\n- Email: ")
	b.WriteString(OwnerEmail)
	b.WriteString("\n- WhatsApp: ")
	b.WriteString(WhatsAppURL)
	if skill != "" {
		b.WriteString("\n\nOptional skill focus: ")
		b.WriteString(skill)
	}
	if len(history) > 0 {
		b.WriteString("\n\nRecent conversation:\n")
		start := 0
		if len(history) > 12 {
			start = len(history) - 12
		}
		for _, line := range history[start:] {
			b.WriteString(strings.TrimSpace(line))
			b.WriteString("\n")
		}
	}
	b.WriteString("\nVisitor question:\n")
	b.WriteString(question)
	return b.String()
}

func (h *Handler) applyActions(cid string, actions []Action, visitorMessage string) {
	for _, a := range actions {
		switch a.Type {
		case "email_notify":
			h.notifyLead(cid, a, visitorMessage, "email")
		case "whatsapp":
			h.notifyLead(cid, a, firstNonEmpty(a.Note, "Visitante pidió WhatsApp"), "whatsapp")
		}
	}
}

func (h *Handler) notifyLead(cid string, a Action, visitorMessage, channel string) {
	if h.Mail == nil {
		return
	}
	note := firstNonEmpty(a.Note, visitorMessage)
	var b strings.Builder
	b.WriteString("Nuevo lead de contacto\r\n\r\n")
	b.WriteString("Canal: " + channel + "\r\n")
	if a.Name != "" {
		b.WriteString("Nombre: " + a.Name + "\r\n")
	}
	if a.Email != "" {
		b.WriteString("Email visitante: " + a.Email + "\r\n")
	}
	if a.Phone != "" {
		b.WriteString("Teléfono: " + a.Phone + "\r\n")
	}
	if note != "" {
		b.WriteString("\r\nMensaje:\r\n" + note + "\r\n")
	}
	if err := h.Mail.SendOwnerMail(cid, "Eduardo OS — nuevo contacto desde el sitio", b.String()); err != nil {
		log.Printf("[correlation=%s] contact.notify smtp err=%v", cid, err)
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
