package content

import (
	"encoding/json"
	"fmt"
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
		r.Post("/api/playlists/{id}/tracks", h.AddPlaylistTrack)
		r.Put("/api/playlists/{id}", h.UpdatePlaylist)

		r.Get("/api/bim/models", h.ListBIMModels)
		r.Post("/api/bim/models", h.CreateBIMModel)
		r.Get("/api/bim/models/{id}/file", h.GetBIMFile)
	})
}

// epamWriteBody accepts both the thin shell ({title,body}) and the
// production pamphlet-generator payload ({epamId,fileName,document}).
type epamWriteBody struct {
	Title    string         `json:"title"`
	Body     map[string]any `json:"body"`
	EpamID   string         `json:"epamId"`
	FileName string         `json:"fileName"`
	Document map[string]any `json:"document"`
}

func epamDocumentResponse(rec EpamRecord) map[string]any {
	doc := rec.Body
	if doc == nil {
		doc = map[string]any{}
	}
	meta := rec
	meta.Body = nil
	return map[string]any{
		"meta":     meta,
		"document": doc,
	}
}

func applyEpamWrite(rec *EpamRecord, body epamWriteBody) {
	if body.EpamID != "" {
		rec.EpamID = body.EpamID
	}
	if body.FileName != "" {
		rec.FileName = body.FileName
	}
	if body.Document != nil {
		rec.Body = body.Document
		if title, ok := body.Document["header"].(map[string]any); ok {
			if t, ok := title["title"].(string); ok && t != "" && body.Title == "" {
				rec.Title = t
			}
		}
		if id, ok := body.Document["id"].(string); ok && id != "" && rec.EpamID == "" {
			rec.EpamID = id
		}
	} else if body.Body != nil {
		rec.Body = body.Body
	}
	if body.Title != "" {
		rec.Title = body.Title
	}
	if raw, err := json.Marshal(rec.Body); err == nil {
		rec.ContentSizeBytes = int64(len(raw))
	}
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
	// Dual keys: pamphlet-generator expects {count,epams}; shell UI used items.
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":  len(out),
		"epams":  out,
		"items":  out,
	})
}

func (h *Handler) CreateEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	var body epamWriteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	rec := EpamRecord{UserID: email}
	applyEpamWrite(&rec, body)
	if rec.Title == "" {
		rec.Title = "Untitled pamphlet"
	}
	saved, err := h.Epams.Save(r.Context(), rec, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if body.Document != nil {
		httpx.WriteJSON(w, http.StatusCreated, epamDocumentResponse(saved))
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
	httpx.WriteJSON(w, http.StatusOK, epamDocumentResponse(rec))
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
	var body epamWriteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	applyEpamWrite(&existing, body)
	saved, err := h.Epams.Save(r.Context(), existing, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if body.Document != nil {
		httpx.WriteJSON(w, http.StatusOK, epamDocumentResponse(saved))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, saved)
}

// --- Playlists (memory-only for now) ---

// PlaylistTrack is a single audio entry (title + optional URL for HTML5 audio).
type PlaylistTrack struct {
	TrackID string `json:"trackId"`
	Title   string `json:"title"`
	URL     string `json:"url,omitempty"`
}

// Playlist is a named list of tracks owned by a user.
type Playlist struct {
	PlaylistID string          `json:"playlistId"`
	UserID     string          `json:"userId"`
	Name       string          `json:"name"`
	Tracks     []PlaylistTrack `json:"tracks"`
	UpdatedAt  string          `json:"updatedAt"`
}

type PlaylistStore struct {
	mu    sync.RWMutex
	items map[string]Playlist
}

func NewPlaylistStore() *PlaylistStore {
	return &PlaylistStore{items: make(map[string]Playlist)}
}

func playlistKey(userID, id string) string { return userID + "|" + id }

func normalizeTracks(raw []PlaylistTrack) []PlaylistTrack {
	out := make([]PlaylistTrack, 0, len(raw))
	for _, t := range raw {
		title := strings.TrimSpace(t.Title)
		url := strings.TrimSpace(t.URL)
		if title == "" && url == "" {
			continue
		}
		if title == "" {
			title = "Untitled track"
		}
		id := strings.TrimSpace(t.TrackID)
		if id == "" {
			id = uuid.NewString()
		}
		out = append(out, PlaylistTrack{TrackID: id, Title: title, URL: url})
	}
	return out
}

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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":     out,
		"playlists": out,
		"count":     len(out),
	})
}

func (h *Handler) CreatePlaylist(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Name   string          `json:"name"`
		Tracks []PlaylistTrack `json:"tracks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Untitled playlist"
	}
	p := Playlist{
		PlaylistID: uuid.NewString(),
		UserID:     email,
		Name:       name,
		Tracks:     normalizeTracks(body.Tracks),
		UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	h.Playlists.mu.Lock()
	h.Playlists.items[playlistKey(email, p.PlaylistID)] = p
	h.Playlists.mu.Unlock()
	httpx.WriteJSON(w, http.StatusCreated, p)
}

// UpdatePlaylist replaces name and/or full track list for an owned playlist.
func (h *Handler) UpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	key := playlistKey(email, id)

	h.Playlists.mu.Lock()
	defer h.Playlists.mu.Unlock()
	existing, ok := h.Playlists.items[key]
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}

	var body struct {
		Name   *string          `json:"name"`
		Tracks *[]PlaylistTrack `json:"tracks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			name = "Untitled playlist"
		}
		existing.Name = name
	}
	if body.Tracks != nil {
		existing.Tracks = normalizeTracks(*body.Tracks)
	}
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	h.Playlists.items[key] = existing
	httpx.WriteJSON(w, http.StatusOK, existing)
}

// AddPlaylistTrack appends one title/url track to an existing playlist.
func (h *Handler) AddPlaylistTrack(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	key := playlistKey(email, id)

	var body struct {
		Title string `json:"title"`
		URL   string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	url := strings.TrimSpace(body.URL)
	if title == "" && url == "" {
		httpx.WriteError(w, http.StatusBadRequest, "title or url required")
		return
	}
	if title == "" {
		title = "Untitled track"
	}

	h.Playlists.mu.Lock()
	defer h.Playlists.mu.Unlock()
	existing, ok := h.Playlists.items[key]
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	track := PlaylistTrack{
		TrackID: uuid.NewString(),
		Title:   title,
		URL:     url,
	}
	existing.Tracks = append(existing.Tracks, track)
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	h.Playlists.items[key] = existing
	httpx.WriteJSON(w, http.StatusCreated, existing)
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

// CreateBIMModel accepts either multipart/form-data (field "file") with optional
// "name", or JSON { "name": "..." } for a placeholder IFC body.
func (h *Handler) CreateBIMModel(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)

	var (
		name        string
		fileBytes   []byte
		contentType = "application/octet-stream"
	)

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(strings.ToLower(ct), "multipart/form-data") {
		// Cap uploads at 64 MiB — enough for typical IFC without unbounded memory.
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}
		name = strings.TrimSpace(r.FormValue("name"))
		f, hdr, err := r.FormFile("file")
		if err == nil && f != nil {
			defer f.Close()
			fileBytes, err = io.ReadAll(io.LimitReader(f, 64<<20))
			if err != nil {
				httpx.WriteError(w, http.StatusBadRequest, "could not read upload")
				return
			}
			if name == "" && hdr != nil {
				name = hdr.Filename
			}
			if hdr != nil && hdr.Header.Get("Content-Type") != "" {
				contentType = hdr.Header.Get("Content-Type")
			}
		}
	} else {
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
			return
		}
		name = strings.TrimSpace(body.Name)
	}

	if name == "" {
		name = "untitled.ifc"
	}

	saved, err := h.BIM.Save(r.Context(), IfcBimRecord{
		UserID:           email,
		Name:             name,
		Title:            name,
		FileName:         name,
		ContentType:      contentType,
		ContentSizeBytes: int64(len(fileBytes)),
	}, fileBytes, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if saved.ContentSizeBytes == 0 && len(fileBytes) == 0 {
		// Placeholder path — store reports size after Save fills default bytes.
		if b, ok, _ := h.BIM.GetFile(r.Context(), email, saved.ModelID); ok {
			saved.ContentSizeBytes = int64(len(b))
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, saved)
}

func (h *Handler) GetBIMFile(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	rec, ok, err := h.BIM.Get(r.Context(), email, id, httpx.CorrelationFromRequest(r))
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
	ctype := "application/octet-stream"
	if rec.ContentType != "" {
		ctype = rec.ContentType
	}
	filename := rec.FileName
	if filename == "" {
		filename = id + ".ifc"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(b)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}
