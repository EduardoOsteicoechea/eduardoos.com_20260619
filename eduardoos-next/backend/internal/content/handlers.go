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

// Handler serves epams, playlists, and BIM model APIs.
type Handler struct {
	JWTSecret string
	Epams     EpamStore
	Playlists *PlaylistStore
	BIM       BIMStore
	auth      *auth.Handler
}

// NewHandler constructs content handlers with the given stores (or memory defaults).
func NewHandler(jwtSecret string, epams EpamStore, bim BIMStore) *Handler {
	if epams == nil {
		epams = NewMemoryEpamStore()
	}
	if bim == nil {
		bim = NewMemoryBIMStore()
	}
	ah := &auth.Handler{JWTSecret: jwtSecret}
	return &Handler{
		JWTSecret: jwtSecret,
		Epams:     epams,
		Playlists: NewPlaylistStore(),
		BIM:       bim,
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

func (h *Handler) ListEpams(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	out, err := h.Epams.ListByUser(r.Context(), email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if out == nil {
		out = []EpamRecord{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *Handler) CreateEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	var body struct {
		Title string         `json:"title"`
		Body  map[string]any `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	saved, err := h.Epams.Save(r.Context(), EpamRecord{
		UserID: email,
		Title:  body.Title,
		Body:   body.Body,
	}, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, saved)
}

func (h *Handler) GetEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	id := chi.URLParam(r, "id")
	rec, ok, err := h.Epams.Get(r.Context(), email, id, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rec)
}

func (h *Handler) UpdateEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	id := chi.URLParam(r, "id")
	existing, ok, err := h.Epams.Get(r.Context(), email, id, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
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
		existing.Title = body.Title
	}
	if body.Body != nil {
		existing.Body = body.Body
	}
	saved, err := h.Epams.Save(r.Context(), existing, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, saved)
}

// --- Playlists (memory-only for now) ---

type Playlist struct {
	PlaylistID string           `json:"playlistId"`
	UserID     string           `json:"userId"`
	Name       string           `json:"name"`
	Tracks     []map[string]any `json:"tracks"`
	UpdatedAt  string           `json:"updatedAt"`
}

type PlaylistStore struct {
	mu    sync.RWMutex
	items map[string]Playlist
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

func (h *Handler) ListBIMModels(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	out, err := h.BIM.ListByUser(r.Context(), email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if out == nil {
		out = []IfcBimRecord{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *Handler) CreateBIMModel(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	saved, err := h.BIM.Save(r.Context(), IfcBimRecord{
		UserID: email,
		Name:   body.Name,
		Title:  body.Name,
	}, nil, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, saved)
}

func (h *Handler) GetBIMFile(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	_, ok, err := h.BIM.Get(r.Context(), email, id, httpx.CorrelationFromRequest(r))
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok && h.BIM.BackendName() == "memory" {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	b, ok, err := h.BIM.GetFile(r.Context(), email, id)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.ifc"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}
