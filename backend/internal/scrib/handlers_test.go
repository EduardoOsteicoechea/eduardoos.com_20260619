package scrib

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func testRouter(t *testing.T) (*Handler, chi.Router) {
	t.Helper()
	users := auth.NewMemoryStore()
	h := NewHandler("scrib-secret", users)
	r := chi.NewRouter()
	h.Routes(r)
	return h, r
}

func bearer(t *testing.T, email string) string {
	t.Helper()
	tok, err := auth.IssueJWT(email, "scrib-secret")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestKeys(t *testing.T) {
	if got := SafeEmailKey("A@Example.COM"); got != "a_at_example.com" {
		t.Fatalf("SafeEmailKey=%s", got)
	}
	if got := LibraryKey("u@x.com"); got != "scrib/u_at_x.com/library.json" {
		t.Fatalf("LibraryKey=%s", got)
	}
	if got := BookKey("u@x.com", "b1"); got != "scrib/u_at_x.com/books/b1/book.json" {
		t.Fatalf("BookKey=%s", got)
	}
	if got := SheetKey("u@x.com", "b1", "s1"); got != "scrib/u_at_x.com/books/b1/sheets/s1/sheet.json" {
		t.Fatalf("SheetKey=%s", got)
	}
}

func TestLibraryBookSheetRoundTrip(t *testing.T) {
	_, r := testRouter(t)
	token := bearer(t, "writer@example.com")

	// Empty library
	req := httptest.NewRequest(http.MethodGet, "/api/scrib/library", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("library status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Create book
	req = httptest.NewRequest(http.MethodPost, "/api/scrib/books",
		bytes.NewBufferString(`{"name":"Mateo"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create book status=%d body=%s", rec.Code, rec.Body.String())
	}
	var book Book
	if err := json.Unmarshal(rec.Body.Bytes(), &book); err != nil {
		t.Fatal(err)
	}
	if book.ID == "" || book.Name != "Mateo" {
		t.Fatalf("unexpected book %#v", book)
	}

	// Create sheet
	req = httptest.NewRequest(http.MethodPost, "/api/scrib/books/"+book.ID+"/sheets",
		bytes.NewBufferString(`{"name":"Hoja 1"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create sheet status=%d body=%s", rec.Code, rec.Body.String())
	}
	var sheet Sheet
	if err := json.Unmarshal(rec.Body.Bytes(), &sheet); err != nil {
		t.Fatal(err)
	}
	if sheet.ID == "" || len(sheet.Layers) != 6 || sheet.ActiveLayerID != "chapter" {
		t.Fatalf("unexpected sheet %#v", sheet)
	}

	// Draw path and save
	sheet.Layers[0].Paths = append(sheet.Layers[0].Paths, StrokePath{D: "M 10 10 L 20 20", StrokeWidth: 0.4})
	body, _ := json.Marshal(sheet)
	req = httptest.NewRequest(http.MethodPut, "/api/scrib/books/"+book.ID+"/sheets/"+sheet.ID,
		bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("put sheet status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/scrib/books/"+book.ID+"/sheets/"+sheet.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get sheet status=%d", rec.Code)
	}
	var loaded Sheet
	if err := json.Unmarshal(rec.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Layers[0].Paths) != 1 {
		t.Fatalf("expected 1 path, got %#v", loaded.Layers[0].Paths)
	}

	// Library lists book with sheet card
	req = httptest.NewRequest(http.MethodGet, "/api/scrib/library", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var lib map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &lib); err != nil {
		t.Fatal(err)
	}
	if lib["userSafe"] != "writer_at_example.com" {
		t.Fatalf("userSafe=%v", lib["userSafe"])
	}
	books, _ := lib["books"].([]any)
	if len(books) != 1 {
		t.Fatalf("books=%#v", books)
	}
}

func TestEmptyLayers(t *testing.T) {
	layers := EmptyLayers()
	if len(layers) != 6 {
		t.Fatalf("len=%d", len(layers))
	}
	if !IsLayerID("translation2") || IsLayerID("other") {
		t.Fatal("layer id validation")
	}
}
