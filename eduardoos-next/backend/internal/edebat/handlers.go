// Package edebat implements a minimal in-memory debate API for Eduardo OS Next.
// Debates are scoped to the authenticated JWT email; turns append role+text entries.
package edebat

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Turn is one debate contribution.
type Turn struct {
	Role string `json:"role"`
	Text string `json:"text"`
	At   string `json:"at"`
}

// Debate is the stored document returned to the client.
type Debate struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Topic     string `json:"topic"`
	Turns     []Turn `json:"turns"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// Store holds debates in memory, keyed by debate id.
type Store struct {
	mu      sync.RWMutex
	debates map[string]Debate
}

// NewStore creates an empty memory store.
func NewStore() *Store {
	return &Store{debates: map[string]Debate{}}
}

// Handler serves JWT-protected edebat routes.
type Handler struct {
	JWTSecret string
	Store     *Store
	auth      *auth.Handler
}

// NewHandler builds an edebat handler with a memory store.
func NewHandler(jwtSecret string) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Store:     NewStore(),
		auth:      &auth.Handler{JWTSecret: jwtSecret},
	}
}

// Routes mounts:
//
//	GET  /api/edebat
//	POST /api/edebat
//	GET  /api/edebat/{id}
//	POST /api/edebat/{id}/turn
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Get("/api/edebat", h.List)
		r.Post("/api/edebat", h.Create)
		r.Get("/api/edebat/{id}", h.Get)
		r.Post("/api/edebat/{id}/turn", h.AddTurn)
	})
}

type createBody struct {
	Topic string `json:"topic"`
}

type turnBody struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

// List returns debates owned by the authenticated user (newest first).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	items := h.Store.ListByUser(email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":   len(items),
		"edebats": items,
	})
}

// Create starts a debate with the given topic.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body createBody
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&body); err != nil && err != io.EOF {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	topic := strings.TrimSpace(body.Topic)
	if topic == "" {
		topic = "Untitled debate"
	}
	doc := h.Store.Create(email, topic)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
}

// Get returns one debate if the caller owns it.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	doc, ok := h.Store.Get(email, id)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "edebat not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
}

// AddTurn appends a role+text turn to the debate.
func (h *Handler) AddTurn(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	var body turnBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	role := strings.TrimSpace(body.Role)
	text := strings.TrimSpace(body.Text)
	if role == "" {
		httpx.WriteError(w, http.StatusBadRequest, "role required")
		return
	}
	if text == "" {
		httpx.WriteError(w, http.StatusBadRequest, "text required")
		return
	}
	doc, ok := h.Store.AddTurn(email, id, role, text)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "edebat not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"document": doc})
}

// Create inserts a new empty debate for the user.
func (s *Store) Create(userID, topic string) Debate {
	now := time.Now().UTC().Format(time.RFC3339)
	doc := Debate{
		ID:        uuid.NewString(),
		UserID:    auth.NormalizeEmail(userID),
		Topic:     topic,
		Turns:     []Turn{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.debates[doc.ID] = doc
	return doc
}

// ListByUser returns debates for one user, newest updated first.
func (s *Store) ListByUser(userID string) []Debate {
	userID = auth.NormalizeEmail(userID)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Debate, 0)
	for _, d := range s.debates {
		if d.UserID == userID {
			out = append(out, cloneDebate(d))
		}
	}
	// Newest first (simple insertion order is unordered in maps; sort by UpdatedAt).
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].UpdatedAt > out[i].UpdatedAt {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

// Get returns a debate owned by userID.
func (s *Store) Get(userID, id string) (Debate, bool) {
	userID = auth.NormalizeEmail(userID)
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.debates[id]
	if !ok || d.UserID != userID {
		return Debate{}, false
	}
	return cloneDebate(d), true
}

// AddTurn appends a turn when the debate belongs to userID.
func (s *Store) AddTurn(userID, id, role, text string) (Debate, bool) {
	userID = auth.NormalizeEmail(userID)
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.debates[id]
	if !ok || d.UserID != userID {
		return Debate{}, false
	}
	now := time.Now().UTC().Format(time.RFC3339)
	d.Turns = append(d.Turns, Turn{Role: role, Text: text, At: now})
	d.UpdatedAt = now
	s.debates[id] = d
	return cloneDebate(d), true
}

func cloneDebate(d Debate) Debate {
	cp := d
	if d.Turns == nil {
		cp.Turns = []Turn{}
		return cp
	}
	cp.Turns = make([]Turn, len(d.Turns))
	copy(cp.Turns, d.Turns)
	return cp
}
