package chatbot

import (
	"context"
	"fmt"
	"strings"
)

// callProfileQA answers visitor questions about Eduardo's professional profile.
func callProfileQA(ctx context.Context, cfg deepseekConfig, req llmRequest) (llmResponse, error) {
	profile := strings.TrimSpace(req.ArticleText)
	if profile == "" {
		profile = strings.TrimSpace(req.OpponentArg)
	}
	question := strings.TrimSpace(req.UserArg)
	if profile == "" || question == "" {
		return llmResponse{}, fmt.Errorf("articleText (profile) and userArg (question) are required")
	}
	if len(profile) > 24000 {
		profile = profile[:24000]
	}
	skill := strings.TrimSpace(req.Topic)
	system := `You are Eduardo Osteicoechea's professional portfolio and contact assistant.
Speak in first person as Eduardo when natural, or as a knowledgeable representative of his work.
Use ONLY the provided professional profile (and the optional skill focus) as factual context.
If something is not in the profile, say you do not have that detail yet — do not invent employers, degrees, or dates.
Keep answers concise, concrete, and bilingual-aware (reply in the language of the question; default Spanish if unclear).
Format replies in clear Markdown: short paragraphs, bullet or numbered lists when helpful, and **bold** for key terms.
Do not wrap the entire answer in a markdown code fence. No JSON.

Contact handoff (mandatory protocol):
- Contact email for Eduardo: eduardooost@gmail.com
- WhatsApp deep link (open in a new tab): https://wa.me/584147281033
- When the visitor wants to contact Eduardo by email/phone callback: ask for their email OR phone (and optional name/message). When you have at least one of email or phone, append ONE machine line at the very end (never explain the markers to the user):
  [[CONTACT_EMAIL email="visitor@example.com" phone="+58..." name="Optional" note="Optional short note"]]
  Omit empty attributes. The server emails Eduardo with those details.
- When the visitor wants to chat on WhatsApp: confirm briefly, then append exactly:
  [[CONTACT_WHATSAPP]]
  The UI will open https://wa.me/584147281033 in a new tab. Still ask for their name/phone/email if missing so Eduardo can follow up; if they already gave contact info in this turn, also emit CONTACT_EMAIL with what you have.
- Never invent a different WhatsApp number or email.`
	var b strings.Builder
	b.WriteString("Professional profile:\n")
	b.WriteString(profile)
	if skill != "" {
		b.WriteString("\n\nSkill focus for this conversation:\n")
		b.WriteString(skill)
	}
	if len(req.History) > 0 {
		b.WriteString("\n\nPrior Q&A:\n")
		for _, line := range req.History {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	b.WriteString("\n\nVisitor question:\n")
	b.WriteString(question)
	content, err := deepseekChat(ctx, cfg, cfg.ExpertModel, system, b.String(), false, "")
	if err != nil {
		return llmResponse{}, err
	}
	return llmResponse{Text: strings.TrimSpace(content)}, nil
}
