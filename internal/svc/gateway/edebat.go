package gateway

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

	"eduardoos/pkg/common"
	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/edebat"

	"github.com/go-chi/chi/v5"
)

type edebatHandlers struct {
	cfg   config
	store ddb.EdebatStore
}

func newEdebatHandlers(cfg config, store ddb.EdebatStore) edebatHandlers {
	return edebatHandlers{cfg: cfg, store: store}
}

type saveEdebatRequest struct {
	Document *edebat.Document `json:"document"`
}

type turnEdebatRequest struct {
	Argument string `json:"argument"`
}

type chatbotLLMRequest struct {
	Role        string   `json:"role"`
	Topic       string   `json:"topic"`
	Rules       []string `json:"rules"`
	History     []string `json:"history"`
	UserArg     string   `json:"userArg"`
	OpponentArg string   `json:"opponentArg"`
}

type chatbotLLMResponse struct {
	Text            string `json:"text"`
	ChallengerScore int    `json:"challengerScore"`
	OpponentScore   int    `json:"opponentScore"`
	Analysis        string `json:"analysis"`
	WinnerSummary   string `json:"winnerSummary"`
	Winner          string `json:"winner"`
}

func registerEdebatRoutes(r chi.Router, cfg config, store ddb.EdebatStore) {
	h := newEdebatHandlers(cfg, store)
	r.Get("/api/edebat", h.listEdebats())
	r.Post("/api/edebat", h.createEdebat())
	r.Get("/api/edebat/{debateId}", h.getEdebat())
	r.Put("/api/edebat/{debateId}", h.saveEdebat())
	r.Post("/api/edebat/{debateId}/turn", h.turnEdebat())
}

func (h edebatHandlers) requireEdebatAdmin(w http.ResponseWriter, r *http.Request, event string) (email string, cid string, ok bool) {
	cid = common.CorrelationFromRequest(r)
	h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "started"), cid)
	email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
	if err != nil {
		logs := []string{event + ": JWT subject extraction failed", event + ": error=" + err.Error()}
		log.Printf("[correlation=%s] %s auth failed: %v", cid, event, err)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		common.WriteErrorWithDebug(w, http.StatusUnauthorized, err.Error(), cid, logs)
		return "", cid, false
	}
	if !edebat.IsAllowedEmail(email) {
		logs := []string{event + ": caller is not on the edebat allowlist", event + ": email=" + email}
		log.Printf("[correlation=%s] %s forbidden email=%s", cid, event, email)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		common.WriteErrorWithDebug(w, http.StatusForbidden, "forbidden", cid, logs)
		return "", cid, false
	}
	return email, cid, true
}

func (h edebatHandlers) listEdebats() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := h.requireEdebatAdmin(w, r, "edebat.list")
		if !ok {
			return
		}
		records, err := h.store.ListEdebatsByUserID(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] edebat.list store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.list", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeEdebatStoreError(err))
			return
		}
		if records == nil {
			records = []ddb.EdebatRecord{}
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.list", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"count":   len(records),
			"edebats": records,
		})
	}
}

func (h edebatHandlers) createEdebat() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := h.requireEdebatAdmin(w, r, "edebat.create")
		if !ok {
			return
		}
		doc := edebat.NewEmpty(email, email)
		if err := h.persistDocument(r, cid, email, &doc); err != nil {
			log.Printf("[correlation=%s] edebat.create persist error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.create", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.create", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
	}
}

func (h edebatHandlers) getEdebat() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := h.requireEdebatAdmin(w, r, "edebat.get")
		if !ok {
			return
		}
		debateID := strings.TrimSpace(chi.URLParam(r, "debateId"))
		if debateID == "" {
			common.WriteError(w, http.StatusBadRequest, "debateId required")
			return
		}
		rec, found, err := h.store.GetEdebat(r.Context(), email, debateID, cid)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.get", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not load edebat")
			return
		}
		if !found {
			common.WriteError(w, http.StatusNotFound, "edebat not found")
			return
		}
		body, err := h.cfg.fetchAbsoluteObject(r, cid, rec.S3Key)
		if err != nil {
			log.Printf("[correlation=%s] edebat.get s3 error key=%s: %v", cid, rec.S3Key, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.get", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not load edebat body")
			return
		}
		var doc edebat.Document
		if err := json.Unmarshal(body, &doc); err != nil {
			common.WriteError(w, http.StatusInternalServerError, "stored edebat is not valid JSON")
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.get", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"meta":     rec,
			"document": doc,
		})
	}
}

func (h edebatHandlers) saveEdebat() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := h.requireEdebatAdmin(w, r, "edebat.save")
		if !ok {
			return
		}
		debateID := strings.TrimSpace(chi.URLParam(r, "debateId"))
		if debateID == "" {
			common.WriteError(w, http.StatusBadRequest, "debateId required")
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var req saveEdebatRequest
		if err := json.Unmarshal(raw, &req); err != nil || req.Document == nil {
			common.WriteError(w, http.StatusBadRequest, "document required")
			return
		}
		doc := req.Document
		doc.ID = debateID
		edebat.Normalize(doc, email)
		if err := h.persistDocument(r, cid, email, doc); err != nil {
			log.Printf("[correlation=%s] edebat.save persist error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.save", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.save", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
	}
}

func (h edebatHandlers) turnEdebat() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := h.requireEdebatAdmin(w, r, "edebat.turn")
		if !ok {
			return
		}
		debateID := strings.TrimSpace(chi.URLParam(r, "debateId"))
		if debateID == "" {
			common.WriteError(w, http.StatusBadRequest, "debateId required")
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var req turnEdebatRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		arg := strings.TrimSpace(req.Argument)
		if arg == "" {
			common.WriteError(w, http.StatusBadRequest, "argument required")
			return
		}

		doc, err := h.loadDocument(r, cid, email, debateID)
		if err != nil {
			log.Printf("[correlation=%s] edebat.turn load error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.turn", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		if strings.TrimSpace(doc.Topic) == "" {
			common.WriteError(w, http.StatusBadRequest, "topic required before debating")
			return
		}
		if doc.Result != nil || len(doc.Rounds) >= doc.RoundsTotal {
			common.WriteError(w, http.StatusConflict, "debate already finished")
			return
		}

		history := buildRoundHistory(doc)
		expert, err := h.callChatbotLLM(r, cid, chatbotLLMRequest{
			Role:    "expert",
			Topic:   doc.Topic,
			Rules:   doc.Rules,
			History: history,
			UserArg: arg,
		})
		if err != nil {
			log.Printf("[correlation=%s] edebat.turn expert error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.turn", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "expert reply failed: "+err.Error())
			return
		}
		opponentArg := strings.TrimSpace(expert.Text)
		if opponentArg == "" {
			common.WriteError(w, http.StatusBadGateway, "expert returned empty argument")
			return
		}

		nextIndex := len(doc.Rounds) + 1
		isFinal := nextIndex >= doc.RoundsTotal
		role := "referee"
		if isFinal {
			role = "final"
		}
		ref, err := h.callChatbotLLM(r, cid, chatbotLLMRequest{
			Role:        role,
			Topic:       doc.Topic,
			Rules:       doc.Rules,
			History:     history,
			UserArg:     arg,
			OpponentArg: opponentArg,
		})
		if err != nil {
			log.Printf("[correlation=%s] edebat.turn referee error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.turn", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "referee scoring failed: "+err.Error())
			return
		}

		round := edebat.Round{
			Index:         nextIndex,
			ChallengerArg: arg,
			OpponentArg:   opponentArg,
			Referee: &edebat.Referee{
				ChallengerScore: ref.ChallengerScore,
				OpponentScore:   ref.OpponentScore,
				Analysis:        strings.TrimSpace(ref.Analysis),
			},
			CompletedAt: time.Now().UTC().Format(time.RFC3339),
		}
		doc.Rounds = append(doc.Rounds, round)
		if isFinal {
			summary := strings.TrimSpace(ref.WinnerSummary)
			if summary == "" {
				summary = strings.TrimSpace(ref.Analysis)
			}
			edebat.ComputeResult(&doc, summary)
			if ref.Winner != "" && doc.Result != nil {
				doc.Result.Winner = ref.Winner
			}
		}
		edebat.Normalize(&doc, email)
		if err := h.persistDocument(r, cid, email, &doc); err != nil {
			log.Printf("[correlation=%s] edebat.turn persist error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.turn", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "edebat.turn", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
	}
}

func (h edebatHandlers) loadDocument(r *http.Request, cid, email, debateID string) (edebat.Document, error) {
	rec, found, err := h.store.GetEdebat(r.Context(), email, debateID, cid)
	if err != nil {
		return edebat.Document{}, err
	}
	if !found {
		return edebat.Document{}, fmt.Errorf("edebat not found")
	}
	body, err := h.cfg.fetchAbsoluteObject(r, cid, rec.S3Key)
	if err != nil {
		return edebat.Document{}, err
	}
	var doc edebat.Document
	if err := json.Unmarshal(body, &doc); err != nil {
		return edebat.Document{}, err
	}
	return doc, nil
}

func (h edebatHandlers) persistDocument(r *http.Request, cid, email string, doc *edebat.Document) error {
	edebat.Normalize(doc, email)
	payload, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	s3Key := ddb.EdebatObjectKey(email, doc.ID)
	fileName := doc.ID + ".edebat"
	if err := h.cfg.proxyAbsoluteUpload(r, cid, s3Key, filepath.Base(fileName), payload); err != nil {
		return fmt.Errorf("%s", humanizeProxyError(err))
	}
	createdAt := doc.CreatedAt
	if existing, ok, getErr := h.store.GetEdebat(r.Context(), email, doc.ID, cid); getErr == nil && ok {
		createdAt = existing.CreatedAt
	}
	_, err = h.store.SaveEdebat(r.Context(), ddb.EdebatRecord{
		UserID:           email,
		DebateID:         doc.ID,
		Title:            doc.Title,
		Topic:            doc.Topic,
		RoundsTotal:      doc.RoundsTotal,
		RoundsCompleted:  len(doc.Rounds),
		S3Key:            s3Key,
		ContentSizeBytes: int64(len(payload)),
		CreatedAt:        createdAt,
	}, cid)
	return err
}

func (h edebatHandlers) callChatbotLLM(r *http.Request, cid string, payload chatbotLLMRequest) (chatbotLLMResponse, error) {
	if strings.TrimSpace(h.cfg.ChatbotURL) == "" {
		return chatbotLLMResponse{}, fmt.Errorf("CHATBOT_URL is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return chatbotLLMResponse{}, err
	}
	target := strings.TrimRight(h.cfg.ChatbotURL, "/") + "/llm"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return chatbotLLMResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(h.cfg.InternalSecret, cid))

	client := &http.Client{Timeout: 58 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return chatbotLLMResponse{}, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return chatbotLLMResponse{}, fmt.Errorf("chatbot status %d: %s", resp.StatusCode, truncateForLog(string(out), 300))
	}
	var parsed chatbotLLMResponse
	if err := json.Unmarshal(out, &parsed); err != nil {
		return chatbotLLMResponse{}, err
	}
	return parsed, nil
}

func buildRoundHistory(doc edebat.Document) []string {
	out := make([]string, 0, len(doc.Rounds)*3)
	for _, round := range doc.Rounds {
		out = append(out, fmt.Sprintf("Round %d challenger: %s", round.Index, round.ChallengerArg))
		out = append(out, fmt.Sprintf("Round %d opponent: %s", round.Index, round.OpponentArg))
		if round.Referee != nil {
			out = append(out, fmt.Sprintf(
				"Round %d referee: challenger=%d opponent=%d — %s",
				round.Index,
				round.Referee.ChallengerScore,
				round.Referee.OpponentScore,
				round.Referee.Analysis,
			))
		}
	}
	return out
}

func humanizeEdebatStoreError(err error) string {
	if err == nil {
		return "could not load edebats"
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "resourcenotfoundexception") || strings.Contains(lower, "requested resource not found") {
		return "DynamoDB table eduardoos_edebats not found — create it or set EDEBATS_BACKEND=memory"
	}
	if msg == "" {
		return "could not load edebats"
	}
	return msg
}
