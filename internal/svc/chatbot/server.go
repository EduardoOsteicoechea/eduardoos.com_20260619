package chatbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type deepseekConfig struct {
	APIKey       string
	BaseURL      string
	ExpertModel  string
	RefereeModel string
}

func loadDeepseekConfig() deepseekConfig {
	return deepseekConfig{
		APIKey:       strings.TrimSpace(common.Env("DEEPSEEK_API_KEY", "")),
		BaseURL:      strings.TrimRight(common.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/"),
		ExpertModel:  common.Env("DEEPSEEK_MODEL_EXPERT", "deepseek-v4-flash"),
		RefereeModel: common.Env("DEEPSEEK_MODEL_REFREE", "deepseek-v4-pro"),
	}
}

type llmRequest struct {
	Role        string   `json:"role"` // expert | referee | final | quiz | article_qa
	Topic       string   `json:"topic"`
	Rules       []string `json:"rules"`
	History     []string `json:"history"`
	UserArg     string   `json:"userArg"`
	OpponentArg string   `json:"opponentArg"`
	ArticleText string   `json:"articleText,omitempty"`
	Unlimited   bool     `json:"unlimited,omitempty"`
}

type llmResponse struct {
	Text            string         `json:"text,omitempty"`
	ChallengerScore int            `json:"challengerScore,omitempty"`
	OpponentScore   int            `json:"opponentScore,omitempty"`
	Analysis        string         `json:"analysis,omitempty"`
	WinnerSummary   string         `json:"winnerSummary,omitempty"`
	Winner          string         `json:"winner,omitempty"`
	Surrender       bool           `json:"surrender,omitempty"`
	Knockout        bool           `json:"knockout,omitempty"`
	Questions       []quizQuestion `json:"questions,omitempty"`
}

type quizQuestion struct {
	ID          string   `json:"id"`
	Prompt      string   `json:"prompt"`
	Choices     []string `json:"choices"`
	AnswerIndex int      `json:"answerIndex"`
	Explanation string   `json:"explanation"`
}

type chatCompletionRequest struct {
	Model          string              `json:"model"`
	Messages       []map[string]string `json:"messages"`
	Thinking       map[string]string   `json:"thinking,omitempty"`
	ReasoningEffort string             `json:"reasoning_effort,omitempty"`
	Stream         bool                `json:"stream"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func Run(addr string) error {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	cfg := loadDeepseekConfig()
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("chatbot", nil))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/chat", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				SessionID string `json:"session_id"`
				Message   string `json:"message"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			common.WriteJSON(w, http.StatusOK, map[string]string{
				"session_id": body.SessionID,
				"reply":      "Echo: " + body.Message,
			})
		})
		r.Post("/llm", handleLLM(cfg))
	})
	log.Printf("chatbot listening on %s (deepseek configured=%v)", addr, cfg.APIKey != "")
	return http.ListenAndServe(addr, r)
}

func handleLLM(cfg deepseekConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.APIKey == "" {
			common.WriteError(w, http.StatusServiceUnavailable, "DEEPSEEK_API_KEY is not configured")
			return
		}
		var req llmRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid llm body")
			return
		}
		role := strings.ToLower(strings.TrimSpace(req.Role))
		ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
		defer cancel()

		var out llmResponse
		var err error
		switch role {
		case "expert":
			out, err = callExpert(ctx, cfg, req)
		case "referee":
			out, err = callReferee(ctx, cfg, req, false)
		case "final":
			out, err = callReferee(ctx, cfg, req, true)
		case "quiz":
			out, err = callQuiz(ctx, cfg, req)
		case "article_qa":
			out, err = callArticleQA(ctx, cfg, req)
		default:
			common.WriteError(w, http.StatusBadRequest, "role must be expert, referee, final, quiz, or article_qa")
			return
		}
		if err != nil {
			log.Printf("chatbot llm role=%s error: %v", role, err)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, out)
	}
}

func callExpert(ctx context.Context, cfg deepseekConfig, req llmRequest) (llmResponse, error) {
	if req.Unlimited {
		system := `You are an expert debater in an open-ended debate.
Respond with ONLY compact JSON (no markdown):
{"text":"your counter-argument","surrender":false}
Set surrender=true only if you concede the debate (then text may briefly explain why).
Otherwise keep debating with a concise counter-argument.`
		user := buildDebatePrompt(req) + "\n\nChallenger argument:\n" + strings.TrimSpace(req.UserArg) +
			"\n\nReply with JSON now."
		content, err := deepseekChat(ctx, cfg, cfg.ExpertModel, system, user, false, "")
		if err != nil {
			return llmResponse{}, err
		}
		parsed, err := parseRefereeJSON(content)
		if err != nil || strings.TrimSpace(parsed.Text) == "" {
			// Fallback: treat raw content as plain argument.
			return llmResponse{Text: strings.TrimSpace(content)}, nil
		}
		parsed.Text = strings.TrimSpace(parsed.Text)
		return parsed, nil
	}

	system := "You are an expert debater. Reply with ONE concise counter-argument only. No preamble, no scores."
	user := buildDebatePrompt(req) + "\n\nChallenger argument:\n" + strings.TrimSpace(req.UserArg) +
		"\n\nWrite the opponent expert counter-argument now."
	content, err := deepseekChat(ctx, cfg, cfg.ExpertModel, system, user, false, "")
	if err != nil {
		return llmResponse{}, err
	}
	return llmResponse{Text: strings.TrimSpace(content)}, nil
}

func callReferee(ctx context.Context, cfg deepseekConfig, req llmRequest, withFinal bool) (llmResponse, error) {
	system := `You are an impartial debate referee. Score each side from 1 to 10 against the topic, rules, and prior rounds.
Respond with ONLY compact JSON (no markdown):
{"challengerScore":N,"opponentScore":N,"analysis":"..."}`
	if withFinal {
		system = `You are an impartial debate referee finishing a full debate.
Respond with ONLY compact JSON (no markdown):
{"challengerScore":N,"opponentScore":N,"analysis":"...","winner":"challenger|opponent|draw","winnerSummary":"..."}`
	} else if req.Unlimited {
		system = `You are an impartial debate referee in an open-ended debate.
Score each side from 1 to 10. Declare knockout=true ONLY when one side is decisively crushed this round (clear K.O.), otherwise knockout=false.
Respond with ONLY compact JSON (no markdown):
{"challengerScore":N,"opponentScore":N,"analysis":"...","knockout":false,"winner":"","winnerSummary":""}
When knockout=true, winner must be "challenger" or "opponent" and winnerSummary must explain the K.O.`
	}
	user := buildDebatePrompt(req) +
		"\n\nChallenger argument:\n" + strings.TrimSpace(req.UserArg) +
		"\n\nOpponent argument:\n" + strings.TrimSpace(req.OpponentArg) +
		"\n\nScore this round now."
	content, err := deepseekChat(ctx, cfg, cfg.RefereeModel, system, user, true, "high")
	if err != nil {
		return llmResponse{}, err
	}
	parsed, err := parseRefereeJSON(content)
	if err != nil {
		return llmResponse{}, err
	}
	if parsed.ChallengerScore < 1 {
		parsed.ChallengerScore = 1
	}
	if parsed.ChallengerScore > 10 {
		parsed.ChallengerScore = 10
	}
	if parsed.OpponentScore < 1 {
		parsed.OpponentScore = 1
	}
	if parsed.OpponentScore > 10 {
		parsed.OpponentScore = 10
	}
	if parsed.Knockout {
		w := strings.ToLower(strings.TrimSpace(parsed.Winner))
		if w != "challenger" && w != "opponent" {
			parsed.Knockout = false
			parsed.Winner = ""
		}
	}
	return parsed, nil
}

func callQuiz(ctx context.Context, cfg deepseekConfig, req llmRequest) (llmResponse, error) {
	article := strings.TrimSpace(req.ArticleText)
	if article == "" {
		article = strings.TrimSpace(req.OpponentArg)
	}
	if article == "" {
		return llmResponse{}, fmt.Errorf("articleText is required for quiz")
	}
	if len(article) > 24000 {
		article = article[:24000]
	}
	title := strings.TrimSpace(req.Topic)
	system := `You are an educational quiz author for Spanish spiritual / Bible-study articles.
Create an EXHAUSTIVE multiple-choice quiz that covers the article's main claims, definitions, examples, and conclusions.
Respond with ONLY compact JSON (no markdown):
{"questions":[{"id":"q1","prompt":"...","choices":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]}
Rules:
- Language: Spanish
- 8 to 15 questions when the article is long enough; fewer only if the text is very short
- Exactly 4 choices per question
- answerIndex is 0-based
- explanations teach why the answer is correct
- Do not invent facts absent from the article`
	user := "Title: " + title + "\n\nArticle:\n" + article + "\n\nGenerate the quiz JSON now."
	content, err := deepseekChat(ctx, cfg, cfg.ExpertModel, system, user, false, "")
	if err != nil {
		return llmResponse{}, err
	}
	questions, err := parseQuizJSON(content)
	if err != nil {
		return llmResponse{}, err
	}
	return llmResponse{Questions: questions}, nil
}

func callArticleQA(ctx context.Context, cfg deepseekConfig, req llmRequest) (llmResponse, error) {
	article := strings.TrimSpace(req.ArticleText)
	if article == "" {
		article = strings.TrimSpace(req.OpponentArg)
	}
	question := strings.TrimSpace(req.UserArg)
	if article == "" || question == "" {
		return llmResponse{}, fmt.Errorf("articleText and userArg (question) are required")
	}
	if len(article) > 24000 {
		article = article[:24000]
	}
	system := `You are a careful tutor answering questions about one article.
Use ONLY the provided article as context. If the answer is not in the article, say so briefly.
Reply in Spanish, concise, clear prose (no JSON).`
	var b strings.Builder
	b.WriteString("Article title: ")
	b.WriteString(strings.TrimSpace(req.Topic))
	b.WriteString("\n\nArticle:\n")
	b.WriteString(article)
	if len(req.History) > 0 {
		b.WriteString("\n\nPrior Q&A:\n")
		for _, line := range req.History {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	b.WriteString("\n\nQuestion:\n")
	b.WriteString(question)
	content, err := deepseekChat(ctx, cfg, cfg.ExpertModel, system, b.String(), false, "")
	if err != nil {
		return llmResponse{}, err
	}
	return llmResponse{Text: strings.TrimSpace(content)}, nil
}

func parseQuizJSON(content string) ([]quizQuestion, error) {
	trimmed := strings.TrimSpace(content)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	trimmed = strings.TrimSpace(trimmed)
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start >= 0 && end > start {
		trimmed = trimmed[start : end+1]
	}
	var wrapper struct {
		Questions []quizQuestion `json:"questions"`
	}
	if err := json.Unmarshal([]byte(trimmed), &wrapper); err != nil {
		return nil, fmt.Errorf("quiz json: %w", err)
	}
	if len(wrapper.Questions) == 0 {
		return nil, fmt.Errorf("quiz json: empty questions")
	}
	out := make([]quizQuestion, 0, len(wrapper.Questions))
	for i, q := range wrapper.Questions {
		q.Prompt = strings.TrimSpace(q.Prompt)
		q.Explanation = strings.TrimSpace(q.Explanation)
		if q.Prompt == "" || len(q.Choices) < 2 {
			continue
		}
		if q.ID == "" {
			q.ID = fmt.Sprintf("q%d", i+1)
		}
		if q.AnswerIndex < 0 || q.AnswerIndex >= len(q.Choices) {
			q.AnswerIndex = 0
		}
		out = append(out, q)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("quiz json: no valid questions")
	}
	return out, nil
}

func buildDebatePrompt(req llmRequest) string {
	var b strings.Builder
	b.WriteString("Topic:\n")
	b.WriteString(strings.TrimSpace(req.Topic))
	b.WriteString("\n\nRules:\n")
	if len(req.Rules) == 0 {
		b.WriteString("- (none)")
	} else {
		for _, rule := range req.Rules {
			b.WriteString("- ")
			b.WriteString(rule)
			b.WriteByte('\n')
		}
	}
	if len(req.History) > 0 {
		b.WriteString("\nPrior rounds:\n")
		for _, line := range req.History {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func deepseekChat(ctx context.Context, cfg deepseekConfig, model, system, user string, thinking bool, effort string) (string, error) {
	payload := chatCompletionRequest{
		Model: model,
		Messages: []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		Stream: false,
	}
	if thinking {
		payload.Thinking = map[string]string{"type": "enabled"}
		if effort != "" {
			payload.ReasoningEffort = effort
		}
	} else {
		payload.Thinking = map[string]string{"type": "disabled"}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: 50 * time.Second}
	res, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("deepseek status %d: %s", res.StatusCode, truncate(string(raw), 400))
	}
	var parsed chatCompletionResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("deepseek returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}

func parseRefereeJSON(content string) (llmResponse, error) {
	content = strings.TrimSpace(content)
	if i := strings.Index(content, "{"); i >= 0 {
		if j := strings.LastIndex(content, "}"); j > i {
			content = content[i : j+1]
		}
	}
	var out llmResponse
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return llmResponse{}, fmt.Errorf("referee json: %w (%s)", err, truncate(content, 200))
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
