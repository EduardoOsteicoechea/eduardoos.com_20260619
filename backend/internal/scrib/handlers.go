package scrib

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Handler serves JWT-protected Scrib library / book / sheet APIs.
type Handler struct {
	JWTSecret    string
	Users        auth.UserStore
	Objects      ObjectSpace
	Entitlements *payments.Store
	auth         *auth.Handler
}

// NewHandler wires defaults. Production main replaces Objects via OpenObjectSpace.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Objects:   NewMemoryObjectSpace(),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/scrib/* behind RequireJWT + scrib entitlement (or admin).
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireScribAccess)

		pr.Get("/api/scrib/library", h.GetLibrary)
		pr.Post("/api/scrib/books", h.CreateBook)
		pr.Get("/api/scrib/books/{bookId}", h.GetBook)
		pr.Put("/api/scrib/books/{bookId}", h.RenameBook)
		pr.Delete("/api/scrib/books/{bookId}", h.DeleteBook)
		pr.Post("/api/scrib/books/{bookId}/sheets", h.CreateSheet)
		pr.Get("/api/scrib/books/{bookId}/sheets/{sheetId}", h.GetSheet)
		pr.Put("/api/scrib/books/{bookId}/sheets/{sheetId}", h.PutSheet)
		pr.Delete("/api/scrib/books/{bookId}/sheets/{sheetId}", h.DeleteSheet)
	})
}

func (h *Handler) requireScribAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.Entitlements == nil {
			next.ServeHTTP(w, r)
			return
		}
		email := auth.UserEmailFromRequest(r)
		if h.isAdminUser(r, email) {
			next.ServeHTTP(w, r)
			return
		}
		ents := h.Entitlements.ListEntitlements(email)
		if payments.HasServiceAccess(false, ents, "scrib") {
			next.ServeHTTP(w, r)
			return
		}
		httpx.WriteError(w, http.StatusForbidden, "scrib subscription required")
	})
}

func (h *Handler) isAdminUser(r *http.Request, email string) bool {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
	}
	return auth.IsAdmin(email, role)
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func (h *Handler) loadLibrary(r *http.Request, email, cid string) (Library, error) {
	var lib Library
	ok, err := h.Objects.GetJSON(r.Context(), LibraryKey(email), &lib, cid)
	if err != nil {
		return Library{}, err
	}
	if !ok || lib.Books == nil {
		lib.Books = []BookMeta{}
	}
	return lib, nil
}

func (h *Handler) saveLibrary(r *http.Request, email string, lib Library, cid string) error {
	if lib.Books == nil {
		lib.Books = []BookMeta{}
	}
	return h.Objects.PutJSON(r.Context(), LibraryKey(email), lib, cid)
}

// GetLibrary returns the caller's book index.
func (h *Handler) GetLibrary(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	lib, err := h.loadLibrary(r, email, cid)
	if err != nil {
		log.Printf("[correlation=%s] scrib.library error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load library")
		return
	}
	// Enrich with live book sheets when book.json exists.
	books := make([]map[string]any, 0, len(lib.Books))
	for _, meta := range lib.Books {
		row := map[string]any{
			"id":        meta.ID,
			"name":      meta.Name,
			"updatedAt": meta.UpdatedAt,
			"sheets":    []SheetMeta{},
		}
		var book Book
		ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, meta.ID), &book, cid)
		if err == nil && ok {
			row["name"] = book.Name
			row["updatedAt"] = book.UpdatedAt
			if book.Sheets != nil {
				row["sheets"] = book.Sheets
			}
		}
		books = append(books, row)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"userSafe": SafeEmailKey(email),
		"books":    books,
	})
}

// CreateBook adds a named book and persists book.json + library entry.
func (h *Handler) CreateBook(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	now := nowRFC3339()
	book := Book{
		ID:        uuid.NewString(),
		Name:      name,
		Sheets:    []SheetMeta{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := h.Objects.PutJSON(r.Context(), BookKey(email, book.ID), book, cid); err != nil {
		log.Printf("[correlation=%s] scrib.create_book put_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save book")
		return
	}
	lib, err := h.loadLibrary(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load library")
		return
	}
	lib.Books = append(lib.Books, BookMeta{ID: book.ID, Name: book.Name, UpdatedAt: now})
	if err := h.saveLibrary(r, email, lib, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update library")
		return
	}
	log.Printf("[correlation=%s] scrib.create_book user=%s book=%s", cid, email, book.ID)
	httpx.WriteJSON(w, http.StatusCreated, book)
}

// GetBook returns one book with its sheet cards.
func (h *Handler) GetBook(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	var book Book
	ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, bookID), &book, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load book")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "book not found")
		return
	}
	if book.Sheets == nil {
		book.Sheets = []SheetMeta{}
	}
	httpx.WriteJSON(w, http.StatusOK, book)
}

// RenameBook updates the book name.
func (h *Handler) RenameBook(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	var book Book
	ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, bookID), &book, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "book not found")
		return
	}
	now := nowRFC3339()
	book.Name = name
	book.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), BookKey(email, bookID), book, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save book")
		return
	}
	lib, _ := h.loadLibrary(r, email, cid)
	for i := range lib.Books {
		if lib.Books[i].ID == bookID {
			lib.Books[i].Name = name
			lib.Books[i].UpdatedAt = now
		}
	}
	_ = h.saveLibrary(r, email, lib, cid)
	httpx.WriteJSON(w, http.StatusOK, book)
}

// DeleteBook removes book.json, all sheet.json under the book, and library entry.
func (h *Handler) DeleteBook(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	keys, err := h.Objects.ListKeys(r.Context(), BookPrefix(email, bookID), cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list book objects")
		return
	}
	// Also delete book.json itself if ListKeys only returns children.
	bookKey := BookKey(email, bookID)
	seen := false
	for _, key := range keys {
		if key == bookKey {
			seen = true
		}
		_ = h.Objects.DeleteKey(r.Context(), key, cid)
	}
	if !seen {
		_ = h.Objects.DeleteKey(r.Context(), bookKey, cid)
	}
	lib, _ := h.loadLibrary(r, email, cid)
	filtered := make([]BookMeta, 0, len(lib.Books))
	for _, b := range lib.Books {
		if b.ID != bookID {
			filtered = append(filtered, b)
		}
	}
	lib.Books = filtered
	_ = h.saveLibrary(r, email, lib, cid)
	log.Printf("[correlation=%s] scrib.delete_book user=%s book=%s", cid, email, bookID)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "bookId": bookID})
}

// CreateSheet appends a blank sheet to a book.
func (h *Handler) CreateSheet(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Hoja nueva"
	}
	var book Book
	ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, bookID), &book, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "book not found")
		return
	}
	now := nowRFC3339()
	sheet := NewEmptySheet(bookID, uuid.NewString(), name, now)
	if err := h.Objects.PutJSON(r.Context(), SheetKey(email, bookID, sheet.ID), sheet, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save sheet")
		return
	}
	book.Sheets = append(book.Sheets, SheetMeta{ID: sheet.ID, Name: sheet.Name, UpdatedAt: now})
	book.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), BookKey(email, bookID), book, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update book")
		return
	}
	lib, _ := h.loadLibrary(r, email, cid)
	for i := range lib.Books {
		if lib.Books[i].ID == bookID {
			lib.Books[i].UpdatedAt = now
		}
	}
	_ = h.saveLibrary(r, email, lib, cid)
	log.Printf("[correlation=%s] scrib.create_sheet user=%s book=%s sheet=%s", cid, email, bookID, sheet.ID)
	httpx.WriteJSON(w, http.StatusCreated, sheet)
}

// GetSheet returns the full sheet document.
func (h *Handler) GetSheet(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	sheetID := chi.URLParam(r, "sheetId")
	var sheet Sheet
	ok, err := h.Objects.GetJSON(r.Context(), SheetKey(email, bookID, sheetID), &sheet, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load sheet")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "sheet not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sheet)
}

// PutSheet replaces the full sheet body (autosave after pointer-up).
func (h *Handler) PutSheet(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	sheetID := chi.URLParam(r, "sheetId")
	var sheet Sheet
	if err := json.NewDecoder(r.Body).Decode(&sheet); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	sheet.ID = sheetID
	sheet.BookID = bookID
	if sheet.Name == "" {
		sheet.Name = "Hoja"
	}
	if !IsLayerID(sheet.ActiveLayerID) {
		sheet.ActiveLayerID = "chapter"
	}
	if sheet.StrokeWidthMm <= 0 {
		sheet.StrokeWidthMm = 0.35
	}
	if len(sheet.Layers) == 0 {
		sheet.Layers = EmptyLayers()
	}
	now := nowRFC3339()
	sheet.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), SheetKey(email, bookID, sheetID), sheet, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save sheet")
		return
	}
	// Touch book sheet meta.
	var book Book
	if ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, bookID), &book, cid); err == nil && ok {
		found := false
		for i := range book.Sheets {
			if book.Sheets[i].ID == sheetID {
				book.Sheets[i].Name = sheet.Name
				book.Sheets[i].UpdatedAt = now
				found = true
			}
		}
		if !found {
			book.Sheets = append(book.Sheets, SheetMeta{ID: sheetID, Name: sheet.Name, UpdatedAt: now})
		}
		book.UpdatedAt = now
		_ = h.Objects.PutJSON(r.Context(), BookKey(email, bookID), book, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, sheet)
}

// DeleteSheet removes one sheet and updates the book index.
func (h *Handler) DeleteSheet(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	bookID := chi.URLParam(r, "bookId")
	sheetID := chi.URLParam(r, "sheetId")
	_ = h.Objects.DeleteKey(r.Context(), SheetKey(email, bookID, sheetID), cid)
	var book Book
	if ok, err := h.Objects.GetJSON(r.Context(), BookKey(email, bookID), &book, cid); err == nil && ok {
		filtered := make([]SheetMeta, 0, len(book.Sheets))
		for _, s := range book.Sheets {
			if s.ID != sheetID {
				filtered = append(filtered, s)
			}
		}
		book.Sheets = filtered
		book.UpdatedAt = nowRFC3339()
		_ = h.Objects.PutJSON(r.Context(), BookKey(email, bookID), book, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "sheetId": sheetID})
}
