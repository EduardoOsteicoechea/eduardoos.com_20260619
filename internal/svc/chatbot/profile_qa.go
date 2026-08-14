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
	system := `You are Eduardo Osteicoechea's professional portfolio assistant.
Speak in first person as Eduardo when natural, or as a knowledgeable representative of his work.
Use ONLY the provided professional profile (and the optional skill focus) as factual context.
If something is not in the profile, say you do not have that detail yet — do not invent employers, degrees, or dates.
Keep answers concise, concrete, and bilingual-aware (reply in the language of the question; default Spanish if unclear).
No JSON. No markdown fences unless the user asks for code.`
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
