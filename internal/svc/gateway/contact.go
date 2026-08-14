package gateway

// Public contact routes: notify owner by email, and profile/contact chat that can
// trigger email leads or WhatsApp redirects (wa.me/584147281033).

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/contact"

	"github.com/go-chi/chi/v5"
)

func registerContactRoutes(r chi.Router, cfg config) {
	r.Post("/api/contact/notify", cfg.notifyContact())
	r.Post("/api/contact/ask", cfg.askContact())
}

func (c config) notifyContact() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.notify", "started"), cid)

		var body struct {
			VisitorName  string `json:"visitorName"`
			VisitorEmail string `json:"visitorEmail"`
			VisitorPhone string `json:"visitorPhone"`
			Message      string `json:"message"`
			Channel      string `json:"channel"`
			HumanToken   string `json:"humanToken"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !validHumanToken(body.HumanToken) {
			common.WriteError(w, http.StatusForbidden, "human verification required")
			return
		}
		if err := c.forwardContactNotify(cid, body.VisitorName, body.VisitorEmail, body.VisitorPhone, body.Message, body.Channel); err != nil {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.notify", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.notify", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"ok":           true,
			"ownerEmail":   contact.OwnerEmail,
			"whatsappUrl":  contact.WhatsAppURL,
		})
	}
}

func (c config) askContact() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.ask", "started"), cid)

		var body struct {
			Question   string   `json:"question"`
			History    []string `json:"history"`
			HumanToken string   `json:"humanToken"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !validHumanToken(body.HumanToken) {
			common.WriteError(w, http.StatusForbidden, "human verification required")
			return
		}
		q := strings.TrimSpace(body.Question)
		if q == "" {
			common.WriteError(w, http.StatusBadRequest, "question required")
			return
		}
		if len(q) > 2000 {
			q = q[:2000]
		}
		answer, actions, err := c.runProfileLLM(cid, q, "Contacto", body.History)
		if err != nil {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.ask", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		c.applyContactActions(cid, actions, q)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "contact.ask", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"answer":      answer,
			"actions":     actions,
			"whatsappUrl": contact.WhatsAppURL,
			"ownerEmail":  contact.OwnerEmail,
		})
	}
}

func (c config) runProfileLLM(cid, question, skill string, history []string) (string, []contact.Action, error) {
	if c.ChatbotURL == "" {
		return "", nil, errString("CHATBOT_URL is not configured")
	}
	payload, _ := json.Marshal(map[string]any{
		"role":        "profile_qa",
		"topic":       skill,
		"userArg":     question,
		"articleText": professionalProfileContext + "\n\nPublic contact:\n- Email: " + contact.OwnerEmail + "\n- WhatsApp: " + contact.WhatsAppURL,
		"history":     history,
	})
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(c.ChatbotURL, "/")+"/llm", bytes.NewReader(payload))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", nil, errString(string(out))
	}
	var parsed struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return "", nil, errString("invalid chatbot response")
	}
	clean, actions := contact.StripAndParse(parsed.Text)
	return clean, actions, nil
}

func (c config) applyContactActions(cid string, actions []contact.Action, visitorMessage string) {
	for _, a := range actions {
		switch a.Type {
		case "email_notify":
			_ = c.forwardContactNotify(cid, a.Name, a.Email, a.Phone, firstNonEmpty(a.Note, visitorMessage), "email")
		case "whatsapp":
			_ = c.forwardContactNotify(cid, a.Name, a.Email, a.Phone, firstNonEmpty(a.Note, "Visitante pidió WhatsApp"), "whatsapp")
		}
	}
}

func (c config) forwardContactNotify(cid, name, email, phone, message, channel string) error {
	payload, _ := json.Marshal(map[string]any{
		"visitorName":  strings.TrimSpace(name),
		"visitorEmail": strings.TrimSpace(email),
		"visitorPhone": strings.TrimSpace(phone),
		"message":      strings.TrimSpace(message),
		"channel":      strings.TrimSpace(channel),
	})
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(c.AuthenticatorURL, "/")+"/notify-contact", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[correlation=%s] contact.notify upstream err: %v", cid, err)
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return errString(string(body))
	}
	return nil
}

type errString string

func (e errString) Error() string { return string(e) }

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
