package content

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Handler serves epams, playlists, and BIM model APIs from in-memory stores
// shaped like production Dynamo/S3 responses so the Next frontend can wire up.
type Handler struct {
	JWTSecret string
	Epams     *EpamStore
	Playlists *PlaylistStore
	BIM       *BIMStore
	auth      *auth.Handler
}

// NewHandler constructs content handlers with empty memory stores.
func NewHandler(jwtSecret string) *Handler {
	ah := &auth.Handler{JWTSecret: jwtSecret}
	return &Handler{
		JWTSecret: jwtSecret,
		Epams:     NewEpamStore(),
		Playlists: NewPlaylistStore(),
		BIM:       NewBIMStore(),
		auth:      ah,
	}
}

// Routes mounts JWT-protected content APIs.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Get("/api/epams", h.ListEpams)
		r.Post("/api/epams", h.CreateEpam)
		r.Get("/api/epams/{id}", h.GetEpam)
		r.Put("/api/epams/{id}", h.UpdateEpam)

		r.Get("/api/playlists", h.ListPlaylists)
		r.Post("/api/playlists", h.CreatePlaylist)

		r.Get("/api/bim/models", h.ListBIMModels)
		r.Post("/api/bim/models", h.CreateBIMModel)
		r.Get("/api/bim/models/{id}/file", h.GetBIMFile)
	})
}

// --- Epams ---

// Epam is production-shaped pamphlet metadata (body may live in S3 later).
type Epam struct {
	ID        string         `json:"id"`
	UserID    string         `json:"userId"`
	Title     string         `json:"title"`
	UpdatedAt string         `json:"updatedAt"`
	Body      map[string]any `json:"body,omitempty"`
}

type EpamStore struct {
	mu   sync.RWMutex
	byID map[string]Epam
}

func NewEpamStore() *EpamStore {
	return &EpamStore{byID: make(map[string]Epam)}
}

func (h *Handler) ListEpams(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	h.Epams.mu.RLock()
	defer h.Epams.mu.RUnlock()
	out := make([]Epam, 0)
	for _, e := range h.Epams.byID {
		if e.UserID == email {
			out = append(out, e)
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *Handler) CreateEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Title string         `json:"title"`
		Body  map[string]any `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	e := Epam{
		ID:        uuid.NewString(),
		UserID:    email,
		Title:     body.Title,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Body:      body.Body,
	}
	h.Epams.mu.Lock()
	h.Epams.byID[e.ID] = e
	h.Epams.mu.Unlock()
	httpx.WriteJSON(w, http.StatusCreated, e)
}

func (h *Handler) GetEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	h.Epams.mu.RLock()
	e, ok := h.Epams.byID[id]
	h.Epams.mu.RUnlock()
	if !ok || e.UserID != email {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, e)
}

func (h *Handler) UpdateEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	h.Epams.mu.Lock()
	defer h.Epams.mu.Unlock()
	e, ok := h.Epams.byID[id]
	if !ok || e.UserID != email {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Title string         `json:"title"`
		Body  map[string]any `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Title != "" {
		e.Title = body.Title
	}
	if body.Body != nil {
		e.Body = body.Body
	}
	e.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	h.Epams.byID[id] = e
	httpx.WriteJSON(w, http.StatusOK, e)
}

// --- Playlists ---

type Playlist struct {
	PlaylistID string           `json:"playlistId"`
	UserID     string           `json:"userId"`
	Name       string           `json:"name"`
	Tracks     []map[string]any `json:"tracks"`
	UpdatedAt  string           `json:"updatedAt"`
}

type PlaylistStore struct {
	mu    sync.RWMutex
	items map[string]Playlist // key userID|playlistId
}

func NewPlaylistStore() *PlaylistStore {
	return &PlaylistStore{items: make(map[string]Playlist)}
}

func playlistKey(userID, id string) string { return userID + "|" + id }

func (h *Handler) ListPlaylists(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	h.Playlists.mu.RLock()
	defer h.Playlists.mu.RUnlock()
	out := make([]Playlist, 0)
	for _, p := range h.Playlists.items {
		if p.UserID == email {
			out = append(out, p)
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *Handler) CreatePlaylist(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Name   string           `json:"name"`
		Tracks []map[string]any `json:"tracks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Tracks == nil {
		body.Tracks = []map[string]any{}
	}
	p := Playlist{
		PlaylistID: uuid.NewString(),
		UserID:     email,
		Name:       body.Name,
		Tracks:     body.Tracks,
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	h.Playlists.mu.Lock()
	h.Playlists.items[playlistKey(email, p.PlaylistID)] = p
	h.Playlists.mu.Unlock()
	httpx.WriteJSON(w, http.StatusCreated, p)
}

// --- BIM / IFC ---

type BIMModel struct {
	ModelID   string `json:"modelId"`
	UserID    string `json:"userId"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
	// fileBytes is memory-mode IFC payload (placeholder when empty on create).
	fileBytes []byte
}

type BIMStore struct {
	mu    sync.RWMutex
	items map[string]BIMModel
}

func NewBIMStore() *BIMStore {
	return &BIMStore{items: make(map[string]BIMModel)}
}

func (h *Handler) ListBIMModels(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	h.BIM.mu.RLock()
	defer h.BIM.mu.RUnlock()
	out := make([]map[string]any, 0)
	for _, m := range h.BIM.items {
		if m.UserID == email {
			out = append(out, map[string]any{
				"modelId":   m.ModelID,
				"userId":    m.UserID,
				"name":      m.Name,
				"updatedAt": m.UpdatedAt,
			})
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *Handler) CreateBIMModel(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	id := uuid.NewString()
	m := BIMModel{
		ModelID:   id,
		UserID:    email,
		Name:      body.Name,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		fileBytes: []byte("ISO-10303-21;\n/* eduardoos-next memory placeholder IFC */\nEND-ISO-10303-21;\n"),
	}
	h.BIM.mu.Lock()
	h.BIM.items[playlistKey(email, id)] = m
	h.BIM.mu.Unlock()
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"modelId":   m.ModelID,
		"userId":    m.UserID,
		"name":      m.Name,
		"updatedAt": m.UpdatedAt,
	})
}

func (h *Handler) GetBIMFile(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	h.BIM.mu.RLock()
	m, ok := h.BIM.items[playlistKey(email, id)]
	h.BIM.mu.RUnlock()
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.ifc"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(m.fileBytes)
}
