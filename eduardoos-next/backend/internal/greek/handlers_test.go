package greek

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func seedAdmin(t *testing.T, store auth.UserStore, email string) {
	t.Helper()
	if err := store.PutUser(t.Context(), auth.User{
		Email:        email,
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleAdmin,
	}); err != nil {
		t.Fatal(err)
	}
}

func seedUser(t *testing.T, store auth.UserStore, email string) {
	t.Helper()
	if err := store.PutUser(t.Context(), auth.User{
		Email:        email,
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleUser,
	}); err != nil {
		t.Fatal(err)
	}
}

func testRouter(t *testing.T) (*Handler, chi.Router, auth.UserStore) {
	t.Helper()
	users := auth.NewMemoryStore()
	h := NewHandler("greek-secret", users)
	r := chi.NewRouter()
	h.Routes(r)
	return h, r, users
}

func bearer(t *testing.T, email, role string) string {
	t.Helper()
	tok, err := auth.IssueJWTWithRole(email, role, "greek-secret")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestKeysAndSlugs(t *testing.T) {
	if got := SafeEmailKey("A@Example.COM"); got != "a_at_example.com" {
		t.Fatalf("SafeEmailKey=%s", got)
	}
	if got := SanitizeSlug("John 3:16!"); got != "john-316" {
		t.Fatalf("SanitizeSlug=%s", got)
	}
	if !IsValidSlug("genesis") || IsValidSlug("../x") {
		t.Fatal("slug validation")
	}
	if got := GroupPrefix("a@b.com", "genesis"); got != "greek/a_at_b.com/genesis" {
		t.Fatalf("GroupPrefix=%s", got)
	}
	if got := LetterKey("a@b.com", "g", "c1", "v1", "w1", 3); !strings.HasSuffix(got, "/letters/3.svg") {
		t.Fatalf("LetterKey=%s", got)
	}
	if err := ValidateOrdinals(1, 1); err != nil {
		t.Fatal(err)
	}
	if err := ValidateOrdinals(0, 1); err == nil {
		t.Fatal("expected ordinalChapter error")
	}
	if err := ValidateOrdinals(1, 10001); err == nil {
		t.Fatal("expected ordinalBook error")
	}
}

func TestAdminGate(t *testing.T) {
	_, r, users := testRouter(t)
	seedUser(t, users, "user@example.com")
	tok := bearer(t, "user@example.com", auth.RoleUser)

	req := httptest.NewRequest(http.MethodGet, "/api/greek/groups", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestCreateGroupHierarchyAndLetter(t *testing.T) {
	h, r, users := testRouter(t)
	seedAdmin(t, users, "admin@example.com")
	tok := bearer(t, "admin@example.com", auth.RoleAdmin)

	// Create group
	req := httptest.NewRequest(http.MethodPost, "/api/greek/groups",
		bytes.NewBufferString(`{"title":"Genesis","slug":"genesis"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create group status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Chapter
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters",
		bytes.NewBufferString(`{"title":"Chapter 1","slug":"ch1"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create chapter status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Verse
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters/ch1/verses",
		bytes.NewBufferString(`{"title":"Verse 1","slug":"v1"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create verse status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Word
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words",
		bytes.NewBufferString(`{"slug":"en-arche","translation1":"In the beginning","translation2":"En el principio","ordinalChapter":1,"ordinalBook":1}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create word status=%d body=%s", rec.Code, rec.Body.String())
	}

	svg := `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="64" viewBox="0 0 32 64"><path d="M4 60 L16 4 L28 60" fill="none" stroke="black"/></svg>`
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words/en-arche/letters",
		bytes.NewBufferString(`{"svg":`+jsonString(svg)+`}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add letter status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Get letter
	req = httptest.NewRequest(http.MethodGet, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words/en-arche/letters/1", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get letter status=%d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "<svg") {
		t.Fatalf("expected svg body, got %s", rec.Body.String())
	}

	// Tree
	req = httptest.NewRequest(http.MethodGet, "/api/greek/groups/genesis", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get group status=%d body=%s", rec.Code, rec.Body.String())
	}
	var tree GroupTree
	if err := json.Unmarshal(rec.Body.Bytes(), &tree); err != nil {
		t.Fatal(err)
	}
	if tree.Group.Slug != "genesis" || len(tree.Chapters) != 1 {
		t.Fatalf("unexpected tree %#v", tree)
	}
	if len(tree.Chapters[0].Verses) != 1 || len(tree.Chapters[0].Verses[0].Words) != 1 {
		t.Fatalf("unexpected hierarchy %#v", tree.Chapters)
	}
	word := tree.Chapters[0].Verses[0].Words[0]
	if word.LetterCount != 1 || len(word.Letters) != 1 {
		t.Fatalf("expected 1 letter, got %#v", word)
	}
	if !strings.HasPrefix(word.Letters[0].Key, "greek/") {
		t.Fatalf("letter key must be under greek/: %s", word.Letters[0].Key)
	}

	// Bootstrap admin email also allowed
	seedUser(t, users, auth.AdminEmail) // role user but email is bootstrap admin
	adminTok := bearer(t, auth.AdminEmail, auth.RoleUser)
	req = httptest.NewRequest(http.MethodGet, "/api/greek/groups", nil)
	req.Header.Set("Authorization", "Bearer "+adminTok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("bootstrap admin status=%d body=%s", rec.Code, rec.Body.String())
	}

	_ = h
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
