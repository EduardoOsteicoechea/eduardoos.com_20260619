package greek

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const maxLetterSVGBytes = 256 << 10 // 256 KiB

// Handler serves JWT + admin-gated Greek builder APIs.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	Catalog   CatalogStore
	Objects   ObjectSpace
	auth      *auth.Handler
}

// NewHandler wires in-memory defaults; production replaces Catalog/Objects.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Catalog:   NewMemoryCatalog(),
		Objects:   NewMemoryObjectSpace(),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/greek/* behind RequireJWT + requireAdmin.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireAdmin)

		pr.Get("/api/greek/groups", h.ListGroups)
		pr.Post("/api/greek/groups", h.CreateGroup)
		pr.Get("/api/greek/groups/{groupSlug}", h.GetGroup)
		pr.Put("/api/greek/groups/{groupSlug}", h.UpdateGroup)
		pr.Delete("/api/greek/groups/{groupSlug}", h.DeleteGroup)

		pr.Post("/api/greek/groups/{groupSlug}/chapters", h.CreateChapter)
		pr.Post("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses", h.CreateVerse)
		pr.Post("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words", h.CreateWord)
		pr.Put("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}", h.UpdateWord)

		pr.Post("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}/letters", h.AddLetter)
		pr.Get("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}/letters/{index}", h.GetLetter)
		pr.Delete("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}/letters/{index}", h.DeleteLetter)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
				role = u.Role
			}
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) ListGroups(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	items, err := h.Catalog.List(r.Context(), owner)
	if err != nil {
		log.Printf("[correlation=%s] greek.groups.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list groups")
		return
	}
	if items == nil {
		items = []Group{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"groups": items})
}

func (h *Handler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	if h.Catalog == nil || h.Objects == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "greek storage not configured")
		return
	}
	var body struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	slug := SanitizeSlug(body.Slug)
	if slug == "" {
		slug = SanitizeSlug(title)
	}
	if slug == "" || title == "" {
		httpx.WriteError(w, http.StatusBadRequest, "title and slug required")
		return
	}
	now := nowRFC3339()
	g := Group{
		Slug:       slug,
		Title:      title,
		OwnerEmail: owner,
		S3Prefix:   GroupPrefix(owner, slug),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	created, err := h.Catalog.Create(r.Context(), g)
	if errors.Is(err, ErrDuplicate) {
		httpx.WriteError(w, http.StatusConflict, "group already exists")
		return
	}
	if err != nil {
		log.Printf("[correlation=%s] greek.groups.create error: %v", cid, err)
		writeGreekStorageError(w, err, "could not create group")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), GroupMetaKey(owner, slug), created, cid); err != nil {
		log.Printf("[correlation=%s] greek.groups.create s3_error: %v", cid, err)
		// Roll back catalog row so the admin can retry create after fixing IAM/S3.
		_ = h.Catalog.Delete(r.Context(), owner, slug)
		writeGreekStorageError(w, err, "could not write group metadata")
		return
	}
	log.Printf("[correlation=%s] greek.groups.create owner=%s slug=%s", cid, owner, slug)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"group": created})
}

// writeGreekStorageError returns a clean JSON 502 with a string error message.
// AccessDenied is called out so operators know to refresh the EC2 IAM greek/* policy.
func writeGreekStorageError(w http.ResponseWriter, err error, fallback string) {
	msg := fallback
	if err != nil {
		low := strings.ToLower(err.Error())
		if strings.Contains(low, "accessdenied") ||
			strings.Contains(low, "not authorized") ||
			strings.Contains(low, "explicit deny") ||
			strings.Contains(low, "access denied") {
			msg = fallback + " (S3/IAM AccessDenied — update EC2 role for prefix greek/*)"
		}
	}
	httpx.WriteError(w, http.StatusBadGateway, msg)
}

func (h *Handler) GetGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	if !IsValidSlug(groupSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group slug")
		return
	}
	g, ok, err := h.Catalog.Get(r.Context(), owner, groupSlug)
	if err != nil {
		log.Printf("[correlation=%s] greek.groups.get error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load group")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "group not found")
		return
	}
	tree, err := h.buildTree(r, owner, g, cid)
	if err != nil {
		log.Printf("[correlation=%s] greek.groups.tree error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load group tree")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tree)
}

func (h *Handler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	if !IsValidSlug(groupSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group slug")
		return
	}
	g, ok, err := h.Catalog.Get(r.Context(), owner, groupSlug)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "group not found")
		return
	}
	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		httpx.WriteError(w, http.StatusBadRequest, "title required")
		return
	}
	g.Title = title
	g.UpdatedAt = nowRFC3339()
	updated, err := h.Catalog.Update(r.Context(), g)
	if err != nil {
		log.Printf("[correlation=%s] greek.groups.update error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not update group")
		return
	}
	_ = h.Objects.PutJSON(r.Context(), GroupMetaKey(owner, groupSlug), updated, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"group": updated})
}

func (h *Handler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	if !IsValidSlug(groupSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group slug")
		return
	}
	if err := h.Objects.DeletePrefix(r.Context(), GroupPrefix(owner, groupSlug), cid); err != nil {
		log.Printf("[correlation=%s] greek.groups.delete s3_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not delete group objects")
		return
	}
	if err := h.Catalog.Delete(r.Context(), owner, groupSlug); err != nil && !errors.Is(err, ErrNotFound) {
		log.Printf("[correlation=%s] greek.groups.delete catalog_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not delete group")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (h *Handler) CreateChapter(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	var body struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	slug := SanitizeSlug(body.Slug)
	if slug == "" {
		slug = SanitizeSlug(title)
	}
	if slug == "" {
		httpx.WriteError(w, http.StatusBadRequest, "chapter slug required")
		return
	}
	now := nowRFC3339()
	meta := ChapterMeta{Slug: slug, Title: titleOrSlug(title, slug), CreatedAt: now, UpdatedAt: now}
	key := ChapterMetaKey(owner, groupSlug, slug)
	var existing ChapterMeta
	if ok, _ := h.Objects.GetJSON(r.Context(), key, &existing, cid); ok {
		httpx.WriteError(w, http.StatusConflict, "chapter already exists")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), key, meta, cid); err != nil {
		log.Printf("[correlation=%s] greek.chapter.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create chapter")
		return
	}
	h.bumpGroupChapterCount(r, owner, groupSlug, cid)
	log.Printf("[correlation=%s] greek.chapter.create group=%s chapter=%s", cid, groupSlug, slug)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"chapter": meta})
}

func (h *Handler) CreateVerse(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	if !IsValidSlug(chapterSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid chapter slug")
		return
	}
	var body struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	slug := SanitizeSlug(body.Slug)
	if slug == "" {
		slug = SanitizeSlug(title)
	}
	if slug == "" {
		httpx.WriteError(w, http.StatusBadRequest, "verse slug required")
		return
	}
	now := nowRFC3339()
	meta := VerseMeta{Slug: slug, Title: titleOrSlug(title, slug), CreatedAt: now, UpdatedAt: now}
	key := VerseMetaKey(owner, groupSlug, chapterSlug, slug)
	var existing VerseMeta
	if ok, _ := h.Objects.GetJSON(r.Context(), key, &existing, cid); ok {
		httpx.WriteError(w, http.StatusConflict, "verse already exists")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), key, meta, cid); err != nil {
		log.Printf("[correlation=%s] greek.verse.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create verse")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"verse": meta})
}

func (h *Handler) CreateWord(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	verseSlug := chi.URLParam(r, "verseSlug")
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	if !IsValidSlug(chapterSlug) || !IsValidSlug(verseSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid chapter or verse slug")
		return
	}
	var body struct {
		Slug           string `json:"slug"`
		Translation1   string `json:"translation1"`
		Translation2   string `json:"translation2"`
		OrdinalChapter int    `json:"ordinalChapter"`
		OrdinalBook    int    `json:"ordinalBook"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	slug := SanitizeSlug(body.Slug)
	if slug == "" {
		slug = SanitizeSlug(body.Translation1)
	}
	if slug == "" {
		httpx.WriteError(w, http.StatusBadRequest, "word slug required")
		return
	}
	if err := ValidateOrdinals(body.OrdinalChapter, body.OrdinalBook); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := nowRFC3339()
	meta := WordMeta{
		Slug:           slug,
		Translation1:   strings.TrimSpace(body.Translation1),
		Translation2:   strings.TrimSpace(body.Translation2),
		OrdinalChapter: body.OrdinalChapter,
		OrdinalBook:    body.OrdinalBook,
		LetterCount:    0,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	key := WordMetaKey(owner, groupSlug, chapterSlug, verseSlug, slug)
	var existing WordMeta
	if ok, _ := h.Objects.GetJSON(r.Context(), key, &existing, cid); ok {
		httpx.WriteError(w, http.StatusConflict, "word already exists")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), key, meta, cid); err != nil {
		log.Printf("[correlation=%s] greek.word.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create word")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"word": meta})
}

func (h *Handler) UpdateWord(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	verseSlug := chi.URLParam(r, "verseSlug")
	wordSlug := chi.URLParam(r, "wordSlug")
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	if !IsValidSlug(chapterSlug) || !IsValidSlug(verseSlug) || !IsValidSlug(wordSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path slug")
		return
	}
	key := WordMetaKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug)
	var meta WordMeta
	ok, err := h.Objects.GetJSON(r.Context(), key, &meta, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "word not found")
		return
	}
	var body struct {
		Translation1   *string `json:"translation1"`
		Translation2   *string `json:"translation2"`
		OrdinalChapter *int    `json:"ordinalChapter"`
		OrdinalBook    *int    `json:"ordinalBook"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Translation1 != nil {
		meta.Translation1 = strings.TrimSpace(*body.Translation1)
	}
	if body.Translation2 != nil {
		meta.Translation2 = strings.TrimSpace(*body.Translation2)
	}
	ch := meta.OrdinalChapter
	bk := meta.OrdinalBook
	if body.OrdinalChapter != nil {
		ch = *body.OrdinalChapter
	}
	if body.OrdinalBook != nil {
		bk = *body.OrdinalBook
	}
	if err := ValidateOrdinals(ch, bk); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	meta.OrdinalChapter = ch
	meta.OrdinalBook = bk
	meta.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), key, meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update word")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"word": meta})
}

func (h *Handler) AddLetter(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	verseSlug := chi.URLParam(r, "verseSlug")
	wordSlug := chi.URLParam(r, "wordSlug")
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	if !IsValidSlug(chapterSlug) || !IsValidSlug(verseSlug) || !IsValidSlug(wordSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path slug")
		return
	}
	keyMeta := WordMetaKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug)
	var meta WordMeta
	ok, err := h.Objects.GetJSON(r.Context(), keyMeta, &meta, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "word not found")
		return
	}

	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	var svg []byte
	if strings.HasPrefix(ct, "multipart/") {
		if err := r.ParseMultipartForm(maxLetterSVGBytes); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "file required")
			return
		}
		defer file.Close()
		svg, err = io.ReadAll(io.LimitReader(file, maxLetterSVGBytes+1))
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "could not read upload")
			return
		}
	} else {
		var body struct {
			SVG string `json:"svg"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, maxLetterSVGBytes+512)).Decode(&body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
			return
		}
		svg = []byte(strings.TrimSpace(body.SVG))
	}
	if len(svg) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "empty svg")
		return
	}
	if len(svg) > maxLetterSVGBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "svg too large")
		return
	}
	if !looksLikeSVG(svg) {
		httpx.WriteError(w, http.StatusBadRequest, "svg required")
		return
	}

	index := meta.LetterCount + 1
	letterKey := LetterKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug, index)
	if err := h.Objects.PutBytes(r.Context(), letterKey, svg, "image/svg+xml", cid); err != nil {
		log.Printf("[correlation=%s] greek.letter.put error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not store letter")
		return
	}
	meta.LetterCount = index
	meta.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), keyMeta, meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update word letter count")
		return
	}
	ref := LetterRef{
		Index: index,
		Key:   letterKey,
		URL:   letterURL(groupSlug, chapterSlug, verseSlug, wordSlug, index),
		Size:  int64(len(svg)),
	}
	log.Printf("[correlation=%s] greek.letter.add group=%s word=%s index=%d", cid, groupSlug, wordSlug, index)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"letter": ref, "word": meta})
}

func (h *Handler) GetLetter(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	verseSlug := chi.URLParam(r, "verseSlug")
	wordSlug := chi.URLParam(r, "wordSlug")
	index, err := strconv.Atoi(chi.URLParam(r, "index"))
	if err != nil || index < 1 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid letter index")
		return
	}
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	key := LetterKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug, index)
	body, contentType, ok, err := h.Objects.GetBytes(r.Context(), key, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load letter")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "letter not found")
		return
	}
	if contentType == "" {
		contentType = "image/svg+xml"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *Handler) DeleteLetter(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	groupSlug := chi.URLParam(r, "groupSlug")
	chapterSlug := chi.URLParam(r, "chapterSlug")
	verseSlug := chi.URLParam(r, "verseSlug")
	wordSlug := chi.URLParam(r, "wordSlug")
	index, err := strconv.Atoi(chi.URLParam(r, "index"))
	if err != nil || index < 1 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid letter index")
		return
	}
	if !h.requireGroup(w, r, owner, groupSlug) {
		return
	}
	key := LetterKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug, index)
	if err := h.Objects.DeleteKey(r.Context(), key, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not delete letter")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "index": index})
}

func (h *Handler) requireGroup(w http.ResponseWriter, r *http.Request, owner, groupSlug string) bool {
	if !IsValidSlug(groupSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group slug")
		return false
	}
	_, ok, err := h.Catalog.Get(r.Context(), owner, groupSlug)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load group")
		return false
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "group not found")
		return false
	}
	return true
}

func (h *Handler) bumpGroupChapterCount(r *http.Request, owner, groupSlug, cid string) {
	g, ok, err := h.Catalog.Get(r.Context(), owner, groupSlug)
	if err != nil || !ok {
		return
	}
	g.ChapterCount++
	g.UpdatedAt = nowRFC3339()
	_, _ = h.Catalog.Update(r.Context(), g)
	_ = h.Objects.PutJSON(r.Context(), GroupMetaKey(owner, groupSlug), g, cid)
}

func (h *Handler) buildTree(r *http.Request, owner string, g Group, cid string) (GroupTree, error) {
	prefix := GroupPrefix(owner, g.Slug) + "/"
	keys, err := h.Objects.ListKeys(r.Context(), prefix, cid)
	if err != nil {
		return GroupTree{}, err
	}

	chapters := map[string]*ChapterNode{}
	chapterOrder := []string{}
	verses := map[string]*VerseNode{} // ch|v
	words := map[string]*WordNode{}   // ch|v|w

	for _, key := range keys {
		rel := strings.TrimPrefix(key, prefix)
		parts := strings.Split(rel, "/")
		if len(parts) < 2 {
			continue
		}
		switch {
		case parts[0] == "chapters" && len(parts) >= 3 && parts[2] == "chapter.json":
			chSlug := parts[1]
			var meta ChapterMeta
			ok, err := h.Objects.GetJSON(r.Context(), key, &meta, cid)
			if err != nil || !ok {
				continue
			}
			if _, exists := chapters[chSlug]; !exists {
				chapters[chSlug] = &ChapterNode{ChapterMeta: meta, Verses: []VerseNode{}}
				chapterOrder = append(chapterOrder, chSlug)
			}
		case parts[0] == "chapters" && len(parts) >= 5 && parts[2] == "verses" && parts[4] == "verse.json":
			chSlug, vSlug := parts[1], parts[3]
			var meta VerseMeta
			ok, err := h.Objects.GetJSON(r.Context(), key, &meta, cid)
			if err != nil || !ok {
				continue
			}
			vk := chSlug + "|" + vSlug
			if _, exists := verses[vk]; !exists {
				verses[vk] = &VerseNode{VerseMeta: meta, Words: []WordNode{}}
			}
			ensureChapter(chapters, &chapterOrder, chSlug)
		case parts[0] == "chapters" && len(parts) >= 7 && parts[2] == "verses" && parts[4] == "words" && parts[6] == "word.json":
			chSlug, vSlug, wSlug := parts[1], parts[3], parts[5]
			var meta WordMeta
			ok, err := h.Objects.GetJSON(r.Context(), key, &meta, cid)
			if err != nil || !ok {
				continue
			}
			wk := chSlug + "|" + vSlug + "|" + wSlug
			if existing, exists := words[wk]; exists {
				letters := existing.Letters
				words[wk] = &WordNode{WordMeta: meta, Letters: letters}
			} else {
				words[wk] = &WordNode{WordMeta: meta, Letters: []LetterRef{}}
			}
			ensureChapter(chapters, &chapterOrder, chSlug)
			vk := chSlug + "|" + vSlug
			if _, exists := verses[vk]; !exists {
				verses[vk] = &VerseNode{VerseMeta: VerseMeta{Slug: vSlug, Title: vSlug}, Words: []WordNode{}}
			}
		case parts[0] == "chapters" && len(parts) >= 8 && parts[2] == "verses" && parts[4] == "words" && parts[6] == "letters":
			chSlug, vSlug, wSlug := parts[1], parts[3], parts[5]
			idx, ok := parseLetterIndex(key)
			if !ok {
				continue
			}
			wk := chSlug + "|" + vSlug + "|" + wSlug
			wn, exists := words[wk]
			if !exists {
				wn = &WordNode{WordMeta: WordMeta{Slug: wSlug}, Letters: []LetterRef{}}
				words[wk] = wn
			}
			wn.Letters = append(wn.Letters, LetterRef{
				Index: idx,
				Key:   key,
				URL:   letterURL(g.Slug, chSlug, vSlug, wSlug, idx),
			})
			ensureChapter(chapters, &chapterOrder, chSlug)
			vk := chSlug + "|" + vSlug
			if _, exists := verses[vk]; !exists {
				verses[vk] = &VerseNode{VerseMeta: VerseMeta{Slug: vSlug, Title: vSlug}, Words: []WordNode{}}
			}
		}
	}

	// Assemble nested tree.
	for wk, wn := range words {
		sort.Slice(wn.Letters, func(i, j int) bool { return wn.Letters[i].Index < wn.Letters[j].Index })
		parts := strings.SplitN(wk, "|", 3)
		if len(parts) != 3 {
			continue
		}
		vk := parts[0] + "|" + parts[1]
		if vn, ok := verses[vk]; ok {
			vn.Words = append(vn.Words, *wn)
		}
	}
	for vk, vn := range verses {
		sort.Slice(vn.Words, func(i, j int) bool {
			if vn.Words[i].OrdinalChapter == vn.Words[j].OrdinalChapter {
				return vn.Words[i].Slug < vn.Words[j].Slug
			}
			return vn.Words[i].OrdinalChapter < vn.Words[j].OrdinalChapter
		})
		parts := strings.SplitN(vk, "|", 2)
		if len(parts) != 2 {
			continue
		}
		if cn, ok := chapters[parts[0]]; ok {
			cn.Verses = append(cn.Verses, *vn)
		}
	}

	outChapters := make([]ChapterNode, 0, len(chapterOrder))
	seen := map[string]bool{}
	for _, chSlug := range chapterOrder {
		cn := chapters[chSlug]
		if cn == nil || seen[chSlug] {
			continue
		}
		seen[chSlug] = true
		sort.Slice(cn.Verses, func(i, j int) bool { return cn.Verses[i].Slug < cn.Verses[j].Slug })
		outChapters = append(outChapters, *cn)
	}
	sort.Slice(outChapters, func(i, j int) bool { return outChapters[i].Slug < outChapters[j].Slug })

	return GroupTree{Group: g, Chapters: outChapters}, nil
}

func ensureChapter(chapters map[string]*ChapterNode, order *[]string, chSlug string) {
	if _, ok := chapters[chSlug]; ok {
		return
	}
	chapters[chSlug] = &ChapterNode{
		ChapterMeta: ChapterMeta{Slug: chSlug, Title: chSlug},
		Verses:      []VerseNode{},
	}
	*order = append(*order, chSlug)
}

func titleOrSlug(title, slug string) string {
	if strings.TrimSpace(title) != "" {
		return strings.TrimSpace(title)
	}
	return slug
}

func looksLikeSVG(b []byte) bool {
	s := strings.ToLower(strings.TrimSpace(string(b)))
	return strings.Contains(s, "<svg") && strings.Contains(s, "</svg>")
}
