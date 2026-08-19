package content

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Handler serves epams, playlists, media, emusic, and articles APIs.
type Handler struct {
	JWTSecret string
	Epams     EpamStore
	Playlists *PlaylistStore
	auth      *auth.Handler
}

// NewHandler constructs content handlers with the given stores (or memory defaults).
func NewHandler(jwtSecret string, epams EpamStore) *Handler {
	if epams == nil {
		epams = NewMemoryEpamStore()
	}
	ah := &auth.Handler{JWTSecret: jwtSecret}
	return &Handler{
		JWTSecret: jwtSecret,
		Epams:     epams,
		Playlists: NewPlaylistStore(),
		auth:      ah,
	}
}

// Routes mounts content APIs (JWT for private resources; media/emusic GET public).
func (h *Handler) Routes(r chi.Router) {
	// Public media + lyrics read (HTML5 audio cannot send Bearer on <audio src>).
	r.Get("/api/media/audio", h.ListMediaAudio)
	r.Get("/api/media/file/*", h.GetMediaFile)
	r.Get("/api/emusic/{slug}", h.GetEmusic)

	// Public pamphlet-as-article surface for /articulos and AI crawlers.
	// More specific /text|/html routes before the bare {id} JSON route.
	r.Get("/api/articles", h.ListArticles)
	r.Get("/api/articles/index.html", h.ListArticlesHTML)
	r.Get("/api/articles/{id}/text", h.GetArticleText)
	r.Get("/api/articles/{id}/html", h.GetArticleHTML)
	r.Get("/api/articles/{id}", h.GetArticle)

	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Put("/api/emusic/{slug}", h.PutEmusic)
		// Admin-only mic/recording upload into media/worship_playlists/.
		r.Post("/api/media/audio/upload", h.UploadMediaAudio)
		// Admin-only soft-delete: hide from library list; keep S3 audio object.
		r.Delete("/api/media/audio/library", h.RemoveMediaAudioLibrary)

		// series-tree before {id} so "series-tree" is not captured as an epam id.
		r.Get("/api/epams/series-tree", h.ListEpamSeriesTree)
		r.Get("/api/epams", h.ListEpams)
		r.Post("/api/epams", h.CreateEpam)
		r.Get("/api/epams/{id}", h.GetEpam)
		r.Put("/api/epams/{id}", h.UpdateEpam)

		r.Get("/api/playlists", h.ListPlaylists)
		r.Post("/api/playlists", h.CreatePlaylist)
		r.Post("/api/playlists/{id}/tracks", h.AddPlaylistTrack)
		r.Put("/api/playlists/{id}", h.UpdatePlaylist)
	})
}

// epamWriteBody accepts both the thin shell ({title,body}) and the
// production pamphlet-generator payload ({epamId,fileName,document}).
// Series fields may be set explicitly or synced from document.header.
type epamWriteBody struct {
	Title         string         `json:"title"`
	Body          map[string]any `json:"body"`
	EpamID        string         `json:"epamId"`
	FileName      string         `json:"fileName"`
	Document      map[string]any `json:"document"`
	Series        string         `json:"series"`
	SeriesChapter string         `json:"seriesChapter"`
	Author        string         `json:"author"`
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

func stringFromAny(v any) string {
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

// syncEpamMetaFromHeader copies series/chapter/author/title from pamphlet JSON header into Dynamo-shaped meta.
func syncEpamMetaFromHeader(rec *EpamRecord) {
	if rec.Body == nil {
		return
	}
	header, ok := rec.Body["header"].(map[string]any)
	if !ok {
		return
	}
	if t := stringFromAny(header["title"]); t != "" {
		rec.Title = t
	}
	if s := stringFromAny(header["series"]); s != "" {
		rec.Series = s
	}
	if c := stringFromAny(header["series_chapter"]); c != "" {
		rec.SeriesChapter = c
	}
	if a := stringFromAny(header["author"]); a != "" {
		rec.Author = a
	}
	if d := stringFromAny(header["date"]); d != "" {
		rec.Date = d
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
		if id, ok := body.Document["id"].(string); ok && id != "" && rec.EpamID == "" {
			rec.EpamID = id
		}
		syncEpamMetaFromHeader(rec)
	} else if body.Body != nil {
		rec.Body = body.Body
		syncEpamMetaFromHeader(rec)
	}
	if body.Title != "" {
		rec.Title = body.Title
	}
	if body.Series != "" {
		rec.Series = strings.TrimSpace(body.Series)
	}
	if body.SeriesChapter != "" {
		rec.SeriesChapter = strings.TrimSpace(body.SeriesChapter)
	}
	if body.Author != "" {
		rec.Author = strings.TrimSpace(body.Author)
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
		"count": len(out),
		"epams": out,
		"items": out,
	})
}

// ListEpamSeriesTree returns series → chapters → pamphlet for the signed-in user.
func (h *Handler) ListEpamSeriesTree(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	out, err := h.Epams.ListByUser(r.Context(), email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	tree := BuildSeriesTree(out)
	log.Printf("[correlation=%s] epams.series_tree user=%s count=%d series=%d", cid, email, tree.Count, len(tree.Series))
	httpx.WriteJSON(w, http.StatusOK, tree)
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
	log.Printf("[correlation=%s] epams.get begin user=%s epamId=%s", cid, email, id)
	rec, ok, err := h.Epams.Get(r.Context(), email, id, cid)
	if err != nil {
		log.Printf("[correlation=%s] epams.get failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		log.Printf("[correlation=%s] epams.get not_found epamId=%s", cid, id)
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if rec.Body == nil || len(rec.Body) == 0 {
		log.Printf("[correlation=%s] epams.get empty_body epamId=%s s3Key=%s", cid, id, rec.S3Key)
		httpx.WriteError(w, http.StatusBadGateway, "epam body is empty — S3 object missing or not readable")
		return
	}
	log.Printf("[correlation=%s] epams.get ok epamId=%s bytes=%d", cid, id, rec.ContentSizeBytes)
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
