package greek

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
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
		pr.Put("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}/letters/{index}", h.UpdateLetter)
		pr.Delete("/api/greek/groups/{groupSlug}/chapters/{chapterSlug}/verses/{verseSlug}/words/{wordSlug}/letters/{index}", h.DeleteLetter)

		pr.Get("/api/greek/gallery", h.ListGallery)
		pr.Post("/api/greek/gallery", h.AddGalleryGlyph)
		pr.Get("/api/greek/gallery/{glyphSlug}", h.GetGalleryGlyph)
		pr.Put("/api/greek/gallery/{glyphSlug}", h.UpdateGalleryGlyph)
		pr.Delete("/api/greek/gallery/{glyphSlug}", h.DeleteGalleryGlyph)

		// Catalog aliases (letter catalog UI; storage remains greek/{user}/gallery/).
		// DELETE catalog clears the drawing but keeps the seeded slot metadata.
		pr.Get("/api/greek/catalog", h.ListGallery)
		pr.Post("/api/greek/catalog/seed", h.SeedCatalog)
		pr.Get("/api/greek/catalog/{glyphSlug}", h.GetGalleryGlyph)
		pr.Put("/api/greek/catalog/{glyphSlug}", h.UpdateGalleryGlyph)
		pr.Delete("/api/greek/catalog/{glyphSlug}", h.ClearCatalogGlyph)
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

	letterSlug, alphabetNumber, gallerySlug, svg, err := parseLetterCreateBody(r)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	slugFromBody := letterSlug != ""
	alphabetFromBody := alphabetNumber != 0

	if gallerySlug != "" {
		if !IsValidSlug(gallerySlug) {
			httpx.WriteError(w, http.StatusBadRequest, "invalid gallery slug")
			return
		}
		gKey := GalleryGlyphKey(owner, gallerySlug)
		body, _, ok, err := h.Objects.GetBytes(r.Context(), gKey, cid)
		if err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not load gallery glyph")
			return
		}
		if !ok {
			httpx.WriteError(w, http.StatusNotFound, "gallery glyph not found")
			return
		}
		svg = body
		if idx, err := h.loadGalleryIndex(r, owner, cid); err == nil {
			for _, g := range idx.Glyphs {
				if g.Slug != gallerySlug {
					continue
				}
				if !slugFromBody {
					letterSlug = gallerySlug
				}
				if !alphabetFromBody && g.AlphabetNumber > 0 {
					alphabetNumber = g.AlphabetNumber
				}
				break
			}
		}
		if !slugFromBody && letterSlug == "" {
			letterSlug = gallerySlug
		}
	}

	if letterSlug == "" {
		letterSlug = fmt.Sprintf("letter-%d", meta.LetterCount+1)
	}
	if !IsValidSlug(letterSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid letter slug")
		return
	}
	if alphabetNumber == 0 {
		alphabetNumber = float64(meta.LetterCount + 1)
		if alphabetNumber > MaxAlphabetNumber {
			alphabetNumber = MaxAlphabetNumber
		}
	}
	if err := ValidateAlphabetNumber(alphabetNumber); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	alphabetNumber = NormalizeAlphabetNumber(alphabetNumber)

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
	lm := LetterMeta{ID: index, Slug: letterSlug, AlphabetNumber: alphabetNumber}
	meta.LetterCount = index
	meta.LetterImages = append(meta.LetterImages, lm)
	meta.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), keyMeta, meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update word letter metadata")
		return
	}
	ref := LetterRef{
		Index:          index,
		Slug:           letterSlug,
		AlphabetNumber: alphabetNumber,
		Key:            letterKey,
		URL:            letterURL(groupSlug, chapterSlug, verseSlug, wordSlug, index),
		Size:           int64(len(svg)),
		GallerySlug:    gallerySlug,
	}
	log.Printf("[correlation=%s] greek.letter.add group=%s word=%s index=%d alphabet=%.1f", cid, groupSlug, wordSlug, index, alphabetNumber)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"letter": ref, "word": meta})
}

func (h *Handler) UpdateLetter(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		Slug           *string  `json:"slug"`
		AlphabetNumber *float64 `json:"alphabetNumber"`
		SVG            *string  `json:"svg"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxLetterSVGBytes+1024)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	idx := findLetterMetaIndex(meta.LetterImages, index)
	if idx < 0 {
		// Legacy SVG without metadata row: create one.
		meta.LetterImages = append(meta.LetterImages, LetterMeta{
			ID:             index,
			Slug:           fmt.Sprintf("letter-%d", index),
			AlphabetNumber: float64(index),
		})
		idx = len(meta.LetterImages) - 1
	}
	if body.Slug != nil {
		s := SanitizeSlug(*body.Slug)
		if s == "" {
			httpx.WriteError(w, http.StatusBadRequest, "invalid letter slug")
			return
		}
		meta.LetterImages[idx].Slug = s
	}
	if body.AlphabetNumber != nil {
		if err := ValidateAlphabetNumber(*body.AlphabetNumber); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		meta.LetterImages[idx].AlphabetNumber = NormalizeAlphabetNumber(*body.AlphabetNumber)
	}
	letterKey := LetterKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug, index)
	size := int64(0)
	if body.SVG != nil {
		svg := []byte(strings.TrimSpace(*body.SVG))
		if len(svg) == 0 || !looksLikeSVG(svg) {
			httpx.WriteError(w, http.StatusBadRequest, "svg required")
			return
		}
		if len(svg) > maxLetterSVGBytes {
			httpx.WriteError(w, http.StatusRequestEntityTooLarge, "svg too large")
			return
		}
		if err := h.Objects.PutBytes(r.Context(), letterKey, svg, "image/svg+xml", cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not store letter")
			return
		}
		size = int64(len(svg))
	}
	meta.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), keyMeta, meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update letter metadata")
		return
	}
	lm := meta.LetterImages[idx]
	ref := LetterRef{
		Index:          index,
		Slug:           lm.Slug,
		AlphabetNumber: lm.AlphabetNumber,
		Key:            letterKey,
		URL:            letterURL(groupSlug, chapterSlug, verseSlug, wordSlug, index),
		Size:           size,
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"letter": ref, "word": meta})
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
	keyMeta := WordMetaKey(owner, groupSlug, chapterSlug, verseSlug, wordSlug)
	var meta WordMeta
	if ok, err := h.Objects.GetJSON(r.Context(), keyMeta, &meta, cid); err == nil && ok {
		filtered := make([]LetterMeta, 0, len(meta.LetterImages))
		for _, lm := range meta.LetterImages {
			if lm.ID != index {
				filtered = append(filtered, lm)
			}
		}
		meta.LetterImages = filtered
		meta.UpdatedAt = nowRFC3339()
		_ = h.Objects.PutJSON(r.Context(), keyMeta, meta, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "index": index})
}

func (h *Handler) ListGallery(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err != nil {
		log.Printf("[correlation=%s] greek.gallery.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list gallery")
		return
	}
	if idx.Glyphs == nil {
		idx.Glyphs = []GalleryGlyph{}
	}
	// Refresh Drawn from SVG bytes when missing/stale (cheap for in-memory; S3 OK for admin).
	for i := range idx.Glyphs {
		g := &idx.Glyphs[i]
		if g.Key == "" {
			g.Key = GalleryGlyphKey(owner, g.Slug)
		}
		if g.URL == "" {
			g.URL = galleryURL(g.Slug)
		}
		body, _, ok, err := h.Objects.GetBytes(r.Context(), g.Key, cid)
		if err == nil && ok {
			g.Drawn = GlyphHasDrawing(body)
			g.Size = int64(len(body))
		}
	}
	sort.Slice(idx.Glyphs, func(i, j int) bool {
		if idx.Glyphs[i].AlphabetNumber == idx.Glyphs[j].AlphabetNumber {
			return idx.Glyphs[i].Slug < idx.Glyphs[j].Slug
		}
		return idx.Glyphs[i].AlphabetNumber < idx.Glyphs[j].AlphabetNumber
	})
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"glyphs": idx.Glyphs})
}

// SeedCatalog writes all Koine Greek catalog slots (upper/lower + accent variants)
// with fixed alphabet numbers. Existing drawn SVGs are kept; undrawn/missing get
// EmptyLetterSVG placeholders. Metadata (label, name, case, variant) is refreshed.
func (h *Handler) SeedCatalog(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load catalog index")
		return
	}
	bySlug := make(map[string]int, len(idx.Glyphs))
	for i, g := range idx.Glyphs {
		bySlug[g.Slug] = i
	}
	seed := KoineCatalogSeed()
	now := nowRFC3339()
	created, updated, kept := 0, 0, 0
	empty := []byte(EmptyLetterSVG)

	for _, entry := range seed {
		gKey := GalleryGlyphKey(owner, entry.Slug)
		existingBody, _, hasSVG, err := h.Objects.GetBytes(r.Context(), gKey, cid)
		if err != nil {
			log.Printf("[correlation=%s] greek.catalog.seed get error: %v", cid, err)
			httpx.WriteError(w, http.StatusBadGateway, "could not read catalog glyph")
			return
		}
		drawn := hasSVG && GlyphHasDrawing(existingBody)
		size := int64(len(empty))
		if drawn {
			size = int64(len(existingBody))
			kept++
		} else {
			if err := h.Objects.PutBytes(r.Context(), gKey, empty, "image/svg+xml", cid); err != nil {
				log.Printf("[correlation=%s] greek.catalog.seed put error: %v", cid, err)
				httpx.WriteError(w, http.StatusBadGateway, "could not write catalog glyph")
				return
			}
		}
		glyph := GalleryGlyph{
			Slug:           entry.Slug,
			AlphabetNumber: entry.AlphabetNumber,
			Label:          entry.Label,
			Name:           entry.Name,
			Case:           entry.Case,
			Variant:        entry.Variant,
			LetterIndex:    entry.LetterIndex,
			Drawn:          drawn,
			Key:            gKey,
			URL:            galleryURL(entry.Slug),
			Size:           size,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if i, ok := bySlug[entry.Slug]; ok {
			if idx.Glyphs[i].CreatedAt != "" {
				glyph.CreatedAt = idx.Glyphs[i].CreatedAt
			}
			idx.Glyphs[i] = glyph
			updated++
		} else {
			idx.Glyphs = append(idx.Glyphs, glyph)
			bySlug[entry.Slug] = len(idx.Glyphs) - 1
			created++
		}
	}
	idx.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update catalog index")
		return
	}
	log.Printf("[correlation=%s] greek.catalog.seed owner=%s created=%d updated=%d keptDrawn=%d total=%d",
		cid, owner, created, updated, kept, len(seed))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"seeded":     len(seed),
		"created":    created,
		"updated":    updated,
		"keptDrawn":  kept,
		"glyphs":     idx.Glyphs,
	})
}

func (h *Handler) AddGalleryGlyph(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	letterSlug, alphabetNumber, _, svg, err := parseLetterCreateBody(r)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if letterSlug == "" || !IsValidSlug(letterSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "glyph slug required")
		return
	}
	if alphabetNumber == 0 {
		alphabetNumber = 1
	}
	if err := ValidateAlphabetNumber(alphabetNumber); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	alphabetNumber = NormalizeAlphabetNumber(alphabetNumber)
	if len(svg) == 0 || !looksLikeSVG(svg) {
		httpx.WriteError(w, http.StatusBadRequest, "svg required")
		return
	}
	if len(svg) > maxLetterSVGBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "svg too large")
		return
	}
	gKey := GalleryGlyphKey(owner, letterSlug)
	if err := h.Objects.PutBytes(r.Context(), gKey, svg, "image/svg+xml", cid); err != nil {
		log.Printf("[correlation=%s] greek.gallery.put error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not store gallery glyph")
		return
	}
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load gallery index")
		return
	}
	now := nowRFC3339()
	glyph := GalleryGlyph{
		Slug:           letterSlug,
		AlphabetNumber: alphabetNumber,
		Drawn:          GlyphHasDrawing(svg),
		Key:            gKey,
		URL:            galleryURL(letterSlug),
		Size:           int64(len(svg)),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	// Preserve Koine catalog metadata when overriding an existing seed slot.
	for i := range idx.Glyphs {
		if idx.Glyphs[i].Slug == letterSlug {
			glyph.Label = idx.Glyphs[i].Label
			glyph.Name = idx.Glyphs[i].Name
			glyph.Case = idx.Glyphs[i].Case
			glyph.Variant = idx.Glyphs[i].Variant
			glyph.LetterIndex = idx.Glyphs[i].LetterIndex
			// Seeded Koine slots keep their fixed alphabet number on SVG override.
			if idx.Glyphs[i].LetterIndex > 0 && idx.Glyphs[i].AlphabetNumber > 0 {
				glyph.AlphabetNumber = idx.Glyphs[i].AlphabetNumber
			}
			glyph.CreatedAt = idx.Glyphs[i].CreatedAt
			if glyph.CreatedAt == "" {
				glyph.CreatedAt = now
			}
			idx.Glyphs[i] = glyph
			idx.UpdatedAt = now
			if err := h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid); err != nil {
				httpx.WriteError(w, http.StatusBadGateway, "could not update gallery index")
				return
			}
			httpx.WriteJSON(w, http.StatusCreated, map[string]any{"glyph": glyph})
			return
		}
	}
	idx.Glyphs = append(idx.Glyphs, glyph)
	idx.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update gallery index")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"glyph": glyph})
}

// UpdateGalleryGlyph overrides SVG and/or metadata for an existing catalog slot
// (same slug → same S3 key). Used by the catalog editor redraw flow.
func (h *Handler) UpdateGalleryGlyph(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	glyphSlug := chi.URLParam(r, "glyphSlug")
	if !IsValidSlug(glyphSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid gallery slug")
		return
	}
	var body struct {
		SVG            *string  `json:"svg"`
		AlphabetNumber *float64 `json:"alphabetNumber"`
		Label          *string  `json:"label"`
		Name           *string  `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxLetterSVGBytes+1024)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load gallery index")
		return
	}
	gi := -1
	for i := range idx.Glyphs {
		if idx.Glyphs[i].Slug == glyphSlug {
			gi = i
			break
		}
	}
	if gi < 0 {
		httpx.WriteError(w, http.StatusNotFound, "catalog glyph not found")
		return
	}
	glyph := idx.Glyphs[gi]
	gKey := GalleryGlyphKey(owner, glyphSlug)
	glyph.Key = gKey
	glyph.URL = galleryURL(glyphSlug)

	if body.AlphabetNumber != nil {
		if err := ValidateAlphabetNumber(*body.AlphabetNumber); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		glyph.AlphabetNumber = NormalizeAlphabetNumber(*body.AlphabetNumber)
	}
	if body.Label != nil {
		glyph.Label = strings.TrimSpace(*body.Label)
	}
	if body.Name != nil {
		glyph.Name = strings.TrimSpace(*body.Name)
	}
	if body.SVG != nil {
		svg := []byte(strings.TrimSpace(*body.SVG))
		if len(svg) == 0 || !looksLikeSVG(svg) {
			httpx.WriteError(w, http.StatusBadRequest, "svg required")
			return
		}
		if len(svg) > maxLetterSVGBytes {
			httpx.WriteError(w, http.StatusRequestEntityTooLarge, "svg too large")
			return
		}
		if err := h.Objects.PutBytes(r.Context(), gKey, svg, "image/svg+xml", cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not store gallery glyph")
			return
		}
		glyph.Size = int64(len(svg))
		glyph.Drawn = GlyphHasDrawing(svg)
	} else {
		existing, _, ok, err := h.Objects.GetBytes(r.Context(), gKey, cid)
		if err == nil && ok {
			glyph.Drawn = GlyphHasDrawing(existing)
			glyph.Size = int64(len(existing))
		}
	}
	glyph.UpdatedAt = nowRFC3339()
	if glyph.CreatedAt == "" {
		glyph.CreatedAt = glyph.UpdatedAt
	}
	idx.Glyphs[gi] = glyph
	idx.UpdatedAt = glyph.UpdatedAt
	if err := h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update gallery index")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"glyph": glyph})
}

func (h *Handler) GetGalleryGlyph(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	glyphSlug := chi.URLParam(r, "glyphSlug")
	if !IsValidSlug(glyphSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid gallery slug")
		return
	}
	key := GalleryGlyphKey(owner, glyphSlug)
	body, contentType, ok, err := h.Objects.GetBytes(r.Context(), key, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load gallery glyph")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "gallery glyph not found")
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

func (h *Handler) DeleteGalleryGlyph(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	glyphSlug := chi.URLParam(r, "glyphSlug")
	if !IsValidSlug(glyphSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid gallery slug")
		return
	}
	key := GalleryGlyphKey(owner, glyphSlug)
	if err := h.Objects.DeleteKey(r.Context(), key, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not delete gallery glyph")
		return
	}
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err == nil {
		filtered := make([]GalleryGlyph, 0, len(idx.Glyphs))
		for _, g := range idx.Glyphs {
			if g.Slug != glyphSlug {
				filtered = append(filtered, g)
			}
		}
		idx.Glyphs = filtered
		idx.UpdatedAt = nowRFC3339()
		_ = h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "slug": glyphSlug})
}

// ClearCatalogGlyph resets a catalog slot drawing to EmptyLetterSVG and marks
// the glyph undrawn. Seed metadata (slug, label, name, alphabet #, case/variant)
// stays in gallery/index.json so the admin can redraw the same slot.
func (h *Handler) ClearCatalogGlyph(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	glyphSlug := chi.URLParam(r, "glyphSlug")
	if !IsValidSlug(glyphSlug) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid gallery slug")
		return
	}
	idx, err := h.loadGalleryIndex(r, owner, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load catalog index")
		return
	}
	gi := -1
	for i := range idx.Glyphs {
		if idx.Glyphs[i].Slug == glyphSlug {
			gi = i
			break
		}
	}
	if gi < 0 {
		httpx.WriteError(w, http.StatusNotFound, "catalog glyph not found")
		return
	}
	empty := []byte(EmptyLetterSVG)
	gKey := GalleryGlyphKey(owner, glyphSlug)
	if err := h.Objects.PutBytes(r.Context(), gKey, empty, "image/svg+xml", cid); err != nil {
		log.Printf("[correlation=%s] greek.catalog.clear put error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not clear catalog glyph")
		return
	}
	glyph := idx.Glyphs[gi]
	glyph.Key = gKey
	glyph.URL = galleryURL(glyphSlug)
	glyph.Size = int64(len(empty))
	glyph.Drawn = false
	glyph.UpdatedAt = nowRFC3339()
	if glyph.CreatedAt == "" {
		glyph.CreatedAt = glyph.UpdatedAt
	}
	idx.Glyphs[gi] = glyph
	idx.UpdatedAt = glyph.UpdatedAt
	if err := h.Objects.PutJSON(r.Context(), GalleryIndexKey(owner), idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update catalog index")
		return
	}
	log.Printf("[correlation=%s] greek.catalog.clear owner=%s slug=%s", cid, owner, glyphSlug)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"cleared": true, "glyph": glyph})
}

func (h *Handler) loadGalleryIndex(r *http.Request, owner, cid string) (GalleryIndex, error) {
	var idx GalleryIndex
	ok, err := h.Objects.GetJSON(r.Context(), GalleryIndexKey(owner), &idx, cid)
	if err != nil {
		return GalleryIndex{}, err
	}
	if !ok {
		return GalleryIndex{Glyphs: []GalleryGlyph{}}, nil
	}
	if idx.Glyphs == nil {
		idx.Glyphs = []GalleryGlyph{}
	}
	return idx, nil
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
			applyLetterMetaToRefs(words[wk])
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
			slug := fmt.Sprintf("letter-%d", idx)
			alphabet := float64(idx)
			for _, lm := range wn.LetterImages {
				if lm.ID == idx {
					if lm.Slug != "" {
						slug = lm.Slug
					}
					if lm.AlphabetNumber > 0 {
						alphabet = lm.AlphabetNumber
					}
					break
				}
			}
			wn.Letters = append(wn.Letters, LetterRef{
				Index:          idx,
				Slug:           slug,
				AlphabetNumber: alphabet,
				Key:            key,
				URL:            letterURL(g.Slug, chSlug, vSlug, wSlug, idx),
			})
			ensureChapter(chapters, &chapterOrder, chSlug)
			vk := chSlug + "|" + vSlug
			if _, exists := verses[vk]; !exists {
				verses[vk] = &VerseNode{VerseMeta: VerseMeta{Slug: vSlug, Title: vSlug}, Words: []WordNode{}}
			}
		}
	}

	// Assemble nested tree; letter-images ordered by alphabetNumber ascending.
	for wk, wn := range words {
		applyLetterMetaToRefs(wn)
		sort.Slice(wn.Letters, func(i, j int) bool {
			if wn.Letters[i].AlphabetNumber == wn.Letters[j].AlphabetNumber {
				return wn.Letters[i].Index < wn.Letters[j].Index
			}
			return wn.Letters[i].AlphabetNumber < wn.Letters[j].AlphabetNumber
		})
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

// parseLetterCreateBody reads SVG + letter metadata from JSON or multipart form.
// Returns letterSlug, alphabetNumber (0 if omitted), gallerySlug, svg bytes.
func parseLetterCreateBody(r *http.Request) (letterSlug string, alphabetNumber float64, gallerySlug string, svg []byte, err error) {
	ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if strings.HasPrefix(ct, "multipart/") {
		if err := r.ParseMultipartForm(maxLetterSVGBytes); err != nil {
			return "", 0, "", nil, fmt.Errorf("invalid multipart form")
		}
		letterSlug = SanitizeSlug(r.FormValue("slug"))
		gallerySlug = SanitizeSlug(r.FormValue("gallerySlug"))
		if raw := strings.TrimSpace(r.FormValue("alphabetNumber")); raw != "" {
			n, perr := strconv.ParseFloat(raw, 64)
			if perr != nil {
				return "", 0, "", nil, fmt.Errorf("invalid alphabetNumber")
			}
			alphabetNumber = n
		}
		if gallerySlug == "" {
			file, _, ferr := r.FormFile("file")
			if ferr != nil {
				return "", 0, "", nil, fmt.Errorf("file required")
			}
			defer file.Close()
			svg, err = io.ReadAll(io.LimitReader(file, maxLetterSVGBytes+1))
			if err != nil {
				return "", 0, "", nil, fmt.Errorf("could not read upload")
			}
		}
		return letterSlug, alphabetNumber, gallerySlug, svg, nil
	}
	var body struct {
		SVG            string   `json:"svg"`
		Slug           string   `json:"slug"`
		AlphabetNumber *float64 `json:"alphabetNumber"`
		GallerySlug    string   `json:"gallerySlug"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxLetterSVGBytes+1024)).Decode(&body); err != nil {
		return "", 0, "", nil, fmt.Errorf("invalid payload")
	}
	letterSlug = SanitizeSlug(body.Slug)
	gallerySlug = SanitizeSlug(body.GallerySlug)
	if body.AlphabetNumber != nil {
		alphabetNumber = *body.AlphabetNumber
	}
	svg = []byte(strings.TrimSpace(body.SVG))
	return letterSlug, alphabetNumber, gallerySlug, svg, nil
}

func findLetterMetaIndex(items []LetterMeta, id int) int {
	for i, lm := range items {
		if lm.ID == id {
			return i
		}
	}
	return -1
}

// applyLetterMetaToRefs overlays durable word.json LetterImages onto listed SVG refs.
func applyLetterMetaToRefs(wn *WordNode) {
	if wn == nil {
		return
	}
	byID := make(map[int]LetterMeta, len(wn.LetterImages))
	for _, lm := range wn.LetterImages {
		byID[lm.ID] = lm
	}
	for i := range wn.Letters {
		lm, ok := byID[wn.Letters[i].Index]
		if !ok {
			continue
		}
		if lm.Slug != "" {
			wn.Letters[i].Slug = lm.Slug
		}
		if lm.AlphabetNumber > 0 {
			wn.Letters[i].AlphabetNumber = lm.AlphabetNumber
		}
	}
}

func galleryURL(glyphSlug string) string {
	return "/api/greek/gallery/" + path.Base(glyphSlug)
}
