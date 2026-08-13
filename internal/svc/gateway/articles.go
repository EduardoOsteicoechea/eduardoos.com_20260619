package gateway

// Article routes: read pamphlets as linear articles, ensure DeepSeek quizzes stored
// beside .epam in S3, and answer sidebar questions with the article as context.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"eduardoos/pkg/article"
	"eduardoos/pkg/common"
	ddb "eduardoos/pkg/dynamodb"

	"github.com/go-chi/chi/v5"
)

type articleHandlers struct {
	cfg   config
	store ddb.EpamStore
}

func registerArticleRoutes(r chi.Router, cfg config, store ddb.EpamStore) {
	h := articleHandlers{cfg: cfg, store: store}
	r.Get("/api/articles", h.listArticles())
	r.Get("/api/articles/{epamId}", h.getArticle())
	r.Get("/api/articles/{epamId}/quiz", h.getOrCreateQuiz())
	r.Post("/api/articles/{epamId}/ask", h.askArticle())
}

func (h articleHandlers) listArticles() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.list", "started"), cid)
		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.list", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		records, err := h.store.ListEpamsByUserID(r.Context(), email, cid)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.list", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeStoreError(err, "could not load articles"))
			return
		}
		if records == nil {
			records = []ddb.EpamRecord{}
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.list", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"count": len(records), "articles": records})
	}
}

func (h articleHandlers) getArticle() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.get", "started"), cid)
		email, doc, meta, plain, err := h.loadArticle(r, cid)
		if err != nil {
			h.writeLoadError(w, cid, "articles.get", err)
			return
		}
		_ = email
		blocks := article.BlocksInReadingOrder(doc)
		hash := article.ContentHash(plain)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.get", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"meta":        meta,
			"blocks":      blocks,
			"contentHash": hash,
			"title":       strings.TrimSpace(doc.Header.Title),
		})
	}
}

func (h articleHandlers) getOrCreateQuiz() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.quiz", "started"), cid)
		email, doc, meta, plain, err := h.loadArticle(r, cid)
		if err != nil {
			h.writeLoadError(w, cid, "articles.quiz", err)
			return
		}
		hash := article.ContentHash(plain)
		quizKey := article.QuizObjectKey(email, meta.EpamID)

		if existing, ok := h.loadQuiz(r, cid, quizKey); ok && existing.ContentHash == hash && len(existing.Questions) > 0 {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.quiz", "success"), cid)
			common.WriteJSON(w, http.StatusOK, map[string]any{"quiz": existing, "generated": false})
			return
		}

		if strings.TrimSpace(plain) == "" {
			common.WriteError(w, http.StatusBadRequest, "article has no text to quiz")
			return
		}

		llm, err := h.callArticleLLM(r, cid, map[string]any{
			"role":        "quiz",
			"topic":       doc.Header.Title,
			"articleText": plain,
		})
		if err != nil {
			log.Printf("[correlation=%s] articles.quiz llm error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.quiz", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not generate quiz")
			return
		}
		questions := make([]article.QuizQuestion, 0, len(llm.Questions))
		for _, q := range llm.Questions {
			questions = append(questions, article.QuizQuestion{
				ID:          q.ID,
				Prompt:      q.Prompt,
				Choices:     q.Choices,
				AnswerIndex: q.AnswerIndex,
				Explanation: q.Explanation,
			})
		}
		if len(questions) == 0 {
			common.WriteError(w, http.StatusBadGateway, "quiz model returned no questions")
			return
		}
		quiz := article.NewQuizDocument(meta.EpamID, hash, questions)
		payload, _ := json.Marshal(quiz)
		if err := h.cfg.proxyAbsoluteUpload(r, cid, quizKey, filepath.Base(quizKey), payload); err != nil {
			log.Printf("[correlation=%s] articles.quiz s3 error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.quiz", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not store quiz")
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.quiz", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"quiz": quiz, "generated": true})
	}
}

func (h articleHandlers) askArticle() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.ask", "started"), cid)
		email, doc, _, plain, err := h.loadArticle(r, cid)
		if err != nil {
			h.writeLoadError(w, cid, "articles.ask", err)
			return
		}
		_ = email
		var body struct {
			Question string   `json:"question"`
			History  []string `json:"history"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
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
		llm, err := h.callArticleLLM(r, cid, map[string]any{
			"role":        "article_qa",
			"topic":       doc.Header.Title,
			"articleText": plain,
			"userArg":     q,
			"history":     body.History,
		})
		if err != nil {
			log.Printf("[correlation=%s] articles.ask llm error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.ask", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not answer")
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "articles.ask", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"answer": strings.TrimSpace(llm.Text)})
	}
}

type articleLoadError struct {
	status int
	msg    string
}

func (e *articleLoadError) Error() string { return e.msg }

func (h articleHandlers) writeLoadError(w http.ResponseWriter, cid, event string, err error) {
	h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
	if le, ok := err.(*articleLoadError); ok {
		common.WriteError(w, le.status, le.msg)
		return
	}
	common.WriteError(w, http.StatusInternalServerError, err.Error())
}

func (h articleHandlers) loadArticle(r *http.Request, cid string) (email string, doc article.PamphletLite, meta ddb.EpamRecord, plain string, err error) {
	email, err = common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
	if err != nil {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusUnauthorized, err.Error()}
	}
	epamID := strings.TrimSpace(chi.URLParam(r, "epamId"))
	if epamID == "" {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusBadRequest, "epamId required"}
	}
	rec, ok, storeErr := h.store.GetEpam(r.Context(), email, epamID, cid)
	if storeErr != nil {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusInternalServerError, "could not load article"}
	}
	if !ok {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusNotFound, "article not found"}
	}
	raw, s3Err := h.cfg.fetchAbsoluteObject(r, cid, rec.S3Key)
	if s3Err != nil {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusBadGateway, "could not load article body"}
	}
	doc, parseErr := article.ParsePamphlet(raw)
	if parseErr != nil {
		return "", article.PamphletLite{}, ddb.EpamRecord{}, "", &articleLoadError{http.StatusInternalServerError, "stored pamphlet is invalid"}
	}
	return email, doc, rec, article.PlainText(doc), nil
}

func (h articleHandlers) loadQuiz(r *http.Request, cid, key string) (article.QuizDocument, bool) {
	raw, err := h.cfg.fetchAbsoluteObject(r, cid, key)
	if err != nil || len(raw) == 0 {
		return article.QuizDocument{}, false
	}
	var quiz article.QuizDocument
	if err := json.Unmarshal(raw, &quiz); err != nil {
		return article.QuizDocument{}, false
	}
	return quiz, true
}

type articleLLMResponse struct {
	Text      string `json:"text"`
	Questions []struct {
		ID          string   `json:"id"`
		Prompt      string   `json:"prompt"`
		Choices     []string `json:"choices"`
		AnswerIndex int      `json:"answerIndex"`
		Explanation string   `json:"explanation"`
	} `json:"questions"`
}

func (h articleHandlers) callArticleLLM(r *http.Request, cid string, payload map[string]any) (articleLLMResponse, error) {
	if strings.TrimSpace(h.cfg.ChatbotURL) == "" {
		return articleLLMResponse{}, fmt.Errorf("CHATBOT_URL is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return articleLLMResponse{}, err
	}
	target := strings.TrimRight(h.cfg.ChatbotURL, "/") + "/llm"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return articleLLMResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(h.cfg.InternalSecret, cid))
	client := &http.Client{Timeout: 58 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return articleLLMResponse{}, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return articleLLMResponse{}, fmt.Errorf("chatbot status %d: %s", resp.StatusCode, string(out))
	}
	var parsed articleLLMResponse
	if err := json.Unmarshal(out, &parsed); err != nil {
		return articleLLMResponse{}, err
	}
	return parsed, nil
}
