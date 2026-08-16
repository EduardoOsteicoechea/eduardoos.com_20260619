// Package instrumentalist implements The Instrumentalist product API:
// belief-tree sessions persisted as .instru documents, optional S3 storage,
// and formal-logic analyze/chat endpoints (DeepSeek when configured).
package instrumentalist

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Document is the full .instru JSON body.
type Document struct {
	Type       string     `json:"type"`
	Version    int        `json:"version"`
	ID         string     `json:"id"`
	UserID     string     `json:"userId"`
	Title      string     `json:"title"`
	Topic      string     `json:"topic"`
	BeliefTree BeliefTree `json:"beliefTree"`
	Messages   []Message  `json:"messages"`
	Analyses   []Analysis `json:"analyses"`
	CreatedAt  string     `json:"createdAt"`
	UpdatedAt  string     `json:"updatedAt"`
	S3Key      string     `json:"s3Key,omitempty"`
}

// BeliefTree is the schematic hierarchy of ideas and groups.
type BeliefTree struct {
	Nodes []BeliefNode `json:"nodes"`
	Edges []BeliefEdge `json:"edges"`
}

// BeliefNode is an idea card or group node on the canvas.
type BeliefNode struct {
	ID       string   `json:"id"`
	Kind     string   `json:"kind"` // idea | group
	Text     string   `json:"text"`
	Weight   float64  `json:"weight"`
	GroupID  string   `json:"groupId,omitempty"`
	Position Position `json:"position"`
}

// Position is canvas coordinates for React Flow.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// BeliefEdge connects two nodes (hierarchy within a group, or group membership).
type BeliefEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"` // hierarchy | group
}

// Message is one chat turn stored in the .instru session.
type Message struct {
	Role string `json:"role"` // user | assistant | system
	Text string `json:"text"`
	At   string `json:"at"`
}

// Analysis is one formal-logic coherence evaluation snapshot.
type Analysis struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Detail  string `json:"detail"`
	At      string `json:"at"`
}

// ListItem is metadata returned by list without the full tree body.
type ListItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Topic     string `json:"topic"`
	UpdatedAt string `json:"updatedAt"`
	S3Key     string `json:"s3Key,omitempty"`
}

// LLMFunc generates assistant text for analyze or chat. Tests inject mocks.
type LLMFunc func(ctx context.Context, mode, system, user string) (string, error)

// Store persists .instru documents keyed by id.
type Store interface {
	BackendName() string
	Save(ctx context.Context, doc Document, correlationID string) (Document, error)
	Get(ctx context.Context, userID, id, correlationID string) (Document, bool, error)
	ListByUser(ctx context.Context, userID, correlationID string) ([]ListItem, error)
}

// MemoryStore is the default local backend.
type MemoryStore struct {
	mu   sync.RWMutex
	docs map[string]Document
}

// NewMemoryStore creates an empty in-process store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{docs: map[string]Document{}}
}

func (s *MemoryStore) BackendName() string { return "memory" }

func (s *MemoryStore) Save(_ context.Context, doc Document, _ string) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.docs[doc.ID] = cloneDoc(doc)
	return cloneDoc(doc), nil
}

func (s *MemoryStore) Get(_ context.Context, userID, id, _ string) (Document, bool, error) {
	userID = auth.NormalizeEmail(userID)
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.docs[id]
	if !ok || d.UserID != userID {
		return Document{}, false, nil
	}
	return cloneDoc(d), true, nil
}

func (s *MemoryStore) ListByUser(_ context.Context, userID, _ string) ([]ListItem, error) {
	userID = auth.NormalizeEmail(userID)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ListItem, 0)
	for _, d := range s.docs {
		if d.UserID != userID {
			continue
		}
		out = append(out, ListItem{
			ID: d.ID, Title: d.Title, Topic: d.Topic,
			UpdatedAt: d.UpdatedAt, S3Key: d.S3Key,
		})
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].UpdatedAt > out[i].UpdatedAt {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

// ObjectKey builds the S3 key for a .instru body.
func ObjectKey(userID, id string) string {
	safeUser := strings.ReplaceAll(strings.TrimSpace(userID), "@", "_at_")
	safeUser = strings.ReplaceAll(safeUser, "/", "_")
	return fmt.Sprintf("media/instrumentalist/%s/%s.instru", safeUser, id)
}

// s3Store wraps metadata (memory) with S3 JSON body persistence.
type s3Store struct {
	meta   Store
	client *s3.Client
	bucket string
}

func (s *s3Store) BackendName() string { return s.meta.BackendName() + "+s3" }

func (s *s3Store) Save(ctx context.Context, doc Document, correlationID string) (Document, error) {
	if doc.S3Key == "" {
		doc.S3Key = ObjectKey(doc.UserID, doc.ID)
	}
	saved, err := s.meta.Save(ctx, doc, correlationID)
	if err != nil {
		return saved, err
	}
	raw, err := json.Marshal(saved)
	if err != nil {
		return saved, fmt.Errorf("marshal instru: %w", err)
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(saved.S3Key),
		Body:        bytes.NewReader(raw),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return saved, fmt.Errorf("s3 put instru %s: %w", saved.S3Key, err)
	}
	log.Printf("[correlation=%s] instru.s3.put key=%s bytes=%d", correlationID, saved.S3Key, len(raw))
	return saved, nil
}

func (s *s3Store) Get(ctx context.Context, userID, id, correlationID string) (Document, bool, error) {
	rec, ok, err := s.meta.Get(ctx, userID, id, correlationID)
	if err != nil || !ok {
		return rec, ok, err
	}
	key := rec.S3Key
	if key == "" {
		key = ObjectKey(userID, id)
		rec.S3Key = key
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		// Memory meta still has the body for local/dev.
		log.Printf("[correlation=%s] instru.s3.get miss key=%s; using memory (%v)", correlationID, key, err)
		return rec, true, nil
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(out.Body)
	if err != nil {
		return Document{}, false, fmt.Errorf("read instru from S3: %w", err)
	}
	var doc Document
	if err := json.Unmarshal(raw, &doc); err != nil {
		return Document{}, false, fmt.Errorf("stored instru is not valid JSON: %w", err)
	}
	doc.S3Key = key
	log.Printf("[correlation=%s] instru.s3.get ok key=%s bytes=%d", correlationID, key, len(raw))
	return doc, true, nil
}

func (s *s3Store) ListByUser(ctx context.Context, userID, correlationID string) ([]ListItem, error) {
	return s.meta.ListByUser(ctx, userID, correlationID)
}

// OpenStore returns memory, optionally wrapped with S3 when a bucket is set.
func OpenStore(ctx context.Context) Store {
	base := NewMemoryStore()
	bucket := strings.TrimSpace(httpx.Env("INSTRUMENTALIST_S3_BUCKET", ""))
	if bucket == "" {
		bucket = strings.TrimSpace(httpx.Env("S3_BUCKET", ""))
	}
	if bucket == "" {
		return base
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("instrumentalist: S3 wrap skipped (%v); using memory", err)
		return base
	}
	return &s3Store{meta: base, client: s3.NewFromConfig(cfg), bucket: bucket}
}

// Handler serves JWT-protected Instrumentalist routes.
type Handler struct {
	JWTSecret string
	Store     Store
	LLM       LLMFunc
	auth      *auth.Handler
}

// NewHandler builds a handler with OpenStore and optional DeepSeek LLM.
func NewHandler(jwtSecret string) *Handler {
	ctx := context.Background()
	h := &Handler{
		JWTSecret: jwtSecret,
		Store:     OpenStore(ctx),
		auth:      &auth.Handler{JWTSecret: jwtSecret},
	}
	h.LLM = NewDeepSeekLLM()
	return h
}

// Routes mounts Instrumentalist APIs under /api/instrumentalist.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Get("/api/instrumentalist", h.List)
		r.Post("/api/instrumentalist", h.Create)
		r.Get("/api/instrumentalist/{id}", h.Get)
		r.Put("/api/instrumentalist/{id}", h.Update)
		r.Post("/api/instrumentalist/{id}/analyze", h.Analyze)
		r.Post("/api/instrumentalist/{id}/chat", h.Chat)
	})
}

type createBody struct {
	Title      string      `json:"title"`
	Topic      string      `json:"topic"`
	BeliefTree *BeliefTree `json:"beliefTree,omitempty"`
}

type updateBody struct {
	Title      string      `json:"title"`
	Topic      string      `json:"topic"`
	BeliefTree *BeliefTree `json:"beliefTree,omitempty"`
	Messages   []Message   `json:"messages,omitempty"`
	Analyses   []Analysis  `json:"analyses,omitempty"`
}

type chatBody struct {
	Message    string      `json:"message"`
	BeliefTree *BeliefTree `json:"beliefTree,omitempty"`
	Topic      string      `json:"topic,omitempty"`
}

type analyzeBody struct {
	BeliefTree *BeliefTree `json:"beliefTree,omitempty"`
	Topic      string      `json:"topic,omitempty"`
}

// List returns document metadata for the authenticated user.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	items, err := h.Store.ListByUser(r.Context(), email, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":     len(items),
		"documents": items,
	})
}

// Create starts a new .instru session.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	var body createBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "Untitled session"
	}
	topic := strings.TrimSpace(body.Topic)
	now := time.Now().UTC().Format(time.RFC3339)
	id := uuid.NewString()
	tree := BeliefTree{Nodes: []BeliefNode{}, Edges: []BeliefEdge{}}
	if body.BeliefTree != nil {
		tree = *body.BeliefTree
		if tree.Nodes == nil {
			tree.Nodes = []BeliefNode{}
		}
		if tree.Edges == nil {
			tree.Edges = []BeliefEdge{}
		}
	}
	doc := Document{
		Type: "instru", Version: 1, ID: id,
		UserID: auth.NormalizeEmail(email), Title: title, Topic: topic,
		BeliefTree: tree,
		Messages: []Message{{
			Role: "assistant",
			Text: "Hello — I am Eduardo’s AI agent specializing in formal logic (not Eduardo). Build or refine your belief tree, then ask me to evaluate a topic against it.",
			At:   now,
		}},
		Analyses:  []Analysis{},
		CreatedAt: now, UpdatedAt: now,
		S3Key: ObjectKey(email, id),
	}
	saved, err := h.Store.Save(r.Context(), doc, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": saved})
}

// Get returns one full document owned by the caller.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	doc, ok, err := h.Store.Get(r.Context(), email, id, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "instrumentalist document not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
}

// Update replaces title/topic/tree/messages/analyses on an owned document.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	existing, ok, err := h.Store.Get(r.Context(), email, id, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "instrumentalist document not found")
		return
	}
	var body updateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if t := strings.TrimSpace(body.Title); t != "" {
		existing.Title = t
	}
	if body.Topic != "" || body.BeliefTree != nil {
		existing.Topic = strings.TrimSpace(body.Topic)
	}
	if body.BeliefTree != nil {
		existing.BeliefTree = *body.BeliefTree
		if existing.BeliefTree.Nodes == nil {
			existing.BeliefTree.Nodes = []BeliefNode{}
		}
		if existing.BeliefTree.Edges == nil {
			existing.BeliefTree.Edges = []BeliefEdge{}
		}
	}
	if body.Messages != nil {
		existing.Messages = body.Messages
	}
	if body.Analyses != nil {
		existing.Analyses = body.Analyses
	}
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if existing.S3Key == "" {
		existing.S3Key = ObjectKey(email, id)
	}
	saved, err := h.Store.Save(r.Context(), existing, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": saved})
}

// Analyze runs a formal-logic coherence pass on the belief tree.
func (h *Handler) Analyze(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	doc, ok, err := h.Store.Get(r.Context(), email, id, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "instrumentalist document not found")
		return
	}
	var body analyzeBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	tree := doc.BeliefTree
	if body.BeliefTree != nil {
		tree = *body.BeliefTree
		doc.BeliefTree = tree
	}
	topic := doc.Topic
	if t := strings.TrimSpace(body.Topic); t != "" {
		topic = t
		doc.Topic = topic
	}
	if h.LLM == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "DEEPSEEK_API_KEY is not configured")
		return
	}
	system := formalLogicSystemPrompt()
	user := "Mode: ANALYZE belief-tree coherence.\nTopic (if any): " + topic + "\n\nBelief tree JSON:\n" + mustJSON(tree) +
		"\n\nRespond with a short summary paragraph, then a detailed formal-logic evaluation of consistency, weighted premises, and group-scoped hierarchy. Identify contradictions and unsupported leaps."
	text, err := h.LLM(r.Context(), "analyze", system, user)
	if err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	summary, detail := splitSummaryDetail(text)
	analysis := Analysis{ID: uuid.NewString(), Summary: summary, Detail: detail, At: now}
	doc.Analyses = append(doc.Analyses, analysis)
	doc.UpdatedAt = now
	saved, err := h.Store.Save(r.Context(), doc, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"document": saved,
		"analysis": analysis,
	})
}

// Chat appends a user message and an assistant reply grounded in the belief tree.
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	corr := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	doc, ok, err := h.Store.Get(r.Context(), email, id, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "instrumentalist document not found")
		return
	}
	var body chatBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	msg := strings.TrimSpace(body.Message)
	if msg == "" {
		httpx.WriteError(w, http.StatusBadRequest, "message required")
		return
	}
	if body.BeliefTree != nil {
		doc.BeliefTree = *body.BeliefTree
	}
	if t := strings.TrimSpace(body.Topic); t != "" {
		doc.Topic = t
	}
	if h.LLM == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "DEEPSEEK_API_KEY is not configured")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	doc.Messages = append(doc.Messages, Message{Role: "user", Text: msg, At: now})
	system := formalLogicSystemPrompt()
	user := "Mode: CHAT — validate or refute the proposed topic using the user's weighted belief hierarchy.\nTopic: " +
		doc.Topic + "\n\nBelief tree JSON:\n" + mustJSON(doc.BeliefTree) +
		"\n\nRecent conversation:\n" + formatHistory(doc.Messages) +
		"\n\nUser message:\n" + msg +
		"\n\nReply as the formal-logic agent. Weight higher hierarchy nodes more heavily. Stay didactic and concrete."
	reply, err := h.LLM(r.Context(), "chat", system, user)
	if err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	assistantAt := time.Now().UTC().Format(time.RFC3339)
	doc.Messages = append(doc.Messages, Message{Role: "assistant", Text: strings.TrimSpace(reply), At: assistantAt})
	doc.UpdatedAt = assistantAt
	saved, err := h.Store.Save(r.Context(), doc, corr)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"document": saved,
		"reply":    strings.TrimSpace(reply),
	})
}

func formalLogicSystemPrompt() string {
	return `You are Eduardo’s AI agent on Eduardo OS — a specialist in formal logic and belief coherence.
You are NOT Eduardo Osteicoechea and must never speak in the first person as him.
Identify as an AI agent when asked who you are. Refer to Eduardo only in the third person if relevant.
Tone: professional, relaxed, concrete, didactic.
Evaluate premises, weights, and group-scoped hierarchies. Prefer clear structure (short paragraphs or lists).
Do not invent credentials or contact channels.`
}

func mustJSON(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func formatHistory(msgs []Message) string {
	var b strings.Builder
	start := 0
	if len(msgs) > 12 {
		start = len(msgs) - 12
	}
	for _, m := range msgs[start:] {
		b.WriteString(m.Role)
		b.WriteString(": ")
		b.WriteString(m.Text)
		b.WriteString("\n")
	}
	return b.String()
}

func splitSummaryDetail(text string) (summary, detail string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "No analysis returned.", ""
	}
	parts := strings.SplitN(text, "\n\n", 2)
	summary = strings.TrimSpace(parts[0])
	if len(parts) == 2 {
		detail = strings.TrimSpace(parts[1])
	} else {
		detail = summary
	}
	if len(summary) > 280 {
		summary = summary[:277] + "…"
	}
	return summary, detail
}

func cloneDoc(d Document) Document {
	cp := d
	if d.BeliefTree.Nodes != nil {
		cp.BeliefTree.Nodes = make([]BeliefNode, len(d.BeliefTree.Nodes))
		copy(cp.BeliefTree.Nodes, d.BeliefTree.Nodes)
	} else {
		cp.BeliefTree.Nodes = []BeliefNode{}
	}
	if d.BeliefTree.Edges != nil {
		cp.BeliefTree.Edges = make([]BeliefEdge, len(d.BeliefTree.Edges))
		copy(cp.BeliefTree.Edges, d.BeliefTree.Edges)
	} else {
		cp.BeliefTree.Edges = []BeliefEdge{}
	}
	if d.Messages != nil {
		cp.Messages = make([]Message, len(d.Messages))
		copy(cp.Messages, d.Messages)
	} else {
		cp.Messages = []Message{}
	}
	if d.Analyses != nil {
		cp.Analyses = make([]Analysis, len(d.Analyses))
		copy(cp.Analyses, d.Analyses)
	} else {
		cp.Analyses = []Analysis{}
	}
	return cp
}
