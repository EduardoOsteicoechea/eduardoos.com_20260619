package greek

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
	if got := GalleryGlyphKey("a@b.com", "alpha"); got != "greek/a_at_b.com/gallery/alpha.svg" {
		t.Fatalf("GalleryGlyphKey=%s", got)
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
	if err := ValidateAlphabetNumber(1.1); err != nil {
		t.Fatal(err)
	}
	if err := ValidateAlphabetNumber(1.15); err == nil {
		t.Fatal("expected alphabetNumber step error")
	}
	if err := ValidateAlphabetNumber(0); err == nil {
		t.Fatal("expected alphabetNumber range error")
	}
	if err := ValidateAlphabetNumber(31); err == nil {
		t.Fatal("expected alphabetNumber max error")
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
		bytes.NewBufferString(`{"svg":`+jsonString(svg)+`,"slug":"alpha","alphabetNumber":2.1}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add letter status=%d body=%s", rec.Code, rec.Body.String())
	}
	var addResp struct {
		Letter LetterRef `json:"letter"`
		Word   WordMeta  `json:"word"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &addResp); err != nil {
		t.Fatal(err)
	}
	if addResp.Letter.Slug != "alpha" || addResp.Letter.AlphabetNumber != 2.1 {
		t.Fatalf("letter meta %#v", addResp.Letter)
	}
	if len(addResp.Word.LetterImages) != 1 || addResp.Word.LetterImages[0].Slug != "alpha" {
		t.Fatalf("word letterImages %#v", addResp.Word.LetterImages)
	}

	// Second letter with lower alphabetNumber should sort first in tree.
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words/en-arche/letters",
		bytes.NewBufferString(`{"svg":`+jsonString(svg)+`,"slug":"beta","alphabetNumber":1.2}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add letter 2 status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Gallery: save reusable glyph, then attach to word.
	req = httptest.NewRequest(http.MethodPost, "/api/greek/gallery",
		bytes.NewBufferString(`{"svg":`+jsonString(svg)+`,"slug":"shared-gamma","alphabetNumber":3}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("gallery add status=%d body=%s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/greek/gallery", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("gallery list status=%d", rec.Code)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words/en-arche/letters",
		bytes.NewBufferString(`{"gallerySlug":"shared-gamma","slug":"gamma","alphabetNumber":1.1}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add from gallery status=%d body=%s", rec.Code, rec.Body.String())
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

	// Update letter metadata
	req = httptest.NewRequest(http.MethodPut, "/api/greek/groups/genesis/chapters/ch1/verses/v1/words/en-arche/letters/1",
		bytes.NewBufferString(`{"slug":"alpha-prime","alphabetNumber":2.2}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update letter status=%d body=%s", rec.Code, rec.Body.String())
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
	if word.LetterCount != 3 || len(word.Letters) != 3 {
		t.Fatalf("expected 3 letters, got %#v", word)
	}
	// Sorted by alphabetNumber: gamma 1.1, beta 1.2, alpha-prime 2.2
	if word.Letters[0].Slug != "gamma" || word.Letters[0].AlphabetNumber != 1.1 {
		t.Fatalf("expected gamma first, got %#v", word.Letters)
	}
	if word.Letters[1].Slug != "beta" || word.Letters[2].Slug != "alpha-prime" {
		t.Fatalf("unexpected letter order %#v", word.Letters)
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

// failPutObjects wraps MemoryObjectSpace and forces PutJSON/PutBytes to fail.
type failPutObjects struct {
	*MemoryObjectSpace
	err error
}

func (f *failPutObjects) PutJSON(ctx context.Context, key string, value any, cid string) error {
	if f.err != nil {
		return f.err
	}
	return f.MemoryObjectSpace.PutJSON(ctx, key, value, cid)
}

func (f *failPutObjects) PutBytes(ctx context.Context, key string, body []byte, contentType, cid string) error {
	if f.err != nil {
		return f.err
	}
	return f.MemoryObjectSpace.PutBytes(ctx, key, body, contentType, cid)
}

func TestCreateGroupS3FailureReturnsCleanJSON502(t *testing.T) {
	h, r, users := testRouter(t)
	seedAdmin(t, users, "admin@example.com")
	tok := bearer(t, "admin@example.com", auth.RoleAdmin)
	h.Objects = &failPutObjects{
		MemoryObjectSpace: NewMemoryObjectSpace(),
		err:               errors.New("AccessDenied: User is not authorized to perform: s3:PutObject on greek/*"),
	}

	req := httptest.NewRequest(http.MethodPost, "/api/greek/groups",
		bytes.NewBufferString(`{"title":"Romans","slug":"romans"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected JSON body: %v body=%s", err, rec.Body.String())
	}
	errMsg, ok := payload["error"]
	if !ok || errMsg == "" {
		t.Fatalf("expected string error field, got %#v", payload)
	}
	if !strings.Contains(errMsg, "could not write group metadata") {
		t.Fatalf("unexpected error message: %s", errMsg)
	}
	if !strings.Contains(errMsg, "AccessDenied") || !strings.Contains(errMsg, "greek/*") {
		t.Fatalf("expected IAM hint in message: %s", errMsg)
	}
	// Catalog row must be rolled back so retry is not a 409.
	if _, ok, err := h.Catalog.Get(t.Context(), "admin@example.com", "romans"); err != nil || ok {
		t.Fatalf("expected catalog rollback, ok=%v err=%v", ok, err)
	}
}

func TestCatalogSeedAndOverride(t *testing.T) {
	_, r, users := testRouter(t)
	seedAdmin(t, users, "admin@example.com")
	tok := bearer(t, "admin@example.com", auth.RoleAdmin)

	req := httptest.NewRequest(http.MethodPost, "/api/greek/catalog/seed", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("seed status=%d body=%s", rec.Code, rec.Body.String())
	}
	var seedResp struct {
		Seeded  int            `json:"seeded"`
		Created int            `json:"created"`
		Glyphs  []GalleryGlyph `json:"glyphs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &seedResp); err != nil {
		t.Fatal(err)
	}
	want := len(KoineCatalogSeed())
	if seedResp.Seeded != want || seedResp.Created != want {
		t.Fatalf("seeded=%d created=%d want=%d", seedResp.Seeded, seedResp.Created, want)
	}
	var nu *GalleryGlyph
	for i := range seedResp.Glyphs {
		if seedResp.Glyphs[i].Slug == "nu-lower" {
			nu = &seedResp.Glyphs[i]
			break
		}
	}
	if nu == nil || nu.AlphabetNumber != 13.1 || nu.Label != "ν" || nu.Drawn {
		t.Fatalf("expected undrawn nu-lower @13.1, got %#v", nu)
	}

	drawnSVG := `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="64" viewBox="0 0 32 64"><path d="M4 60 L16 4 L28 60" fill="none" stroke="black"/></svg>`
	req = httptest.NewRequest(http.MethodPut, "/api/greek/catalog/nu-lower",
		bytes.NewBufferString(`{"svg":`+jsonString(drawnSVG)+`}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("override status=%d body=%s", rec.Code, rec.Body.String())
	}
	var putResp struct {
		Glyph GalleryGlyph `json:"glyph"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &putResp); err != nil {
		t.Fatal(err)
	}
	if !putResp.Glyph.Drawn || putResp.Glyph.AlphabetNumber != 13.1 {
		t.Fatalf("expected drawn nu-lower keeping 13.1, got %#v", putResp.Glyph)
	}

	// Re-seed must keep drawn SVG.
	req = httptest.NewRequest(http.MethodPost, "/api/greek/catalog/seed", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-seed status=%d", rec.Code)
	}
	var reseed struct {
		KeptDrawn int `json:"keptDrawn"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &reseed)
	if reseed.KeptDrawn < 1 {
		t.Fatalf("expected keptDrawn>=1, got %d", reseed.KeptDrawn)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/greek/catalog/nu-lower", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<path") {
		t.Fatalf("expected drawn svg kept, status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestKoineCatalogSeedNumbering(t *testing.T) {
	seed := KoineCatalogSeed()
	if len(seed) < 100 {
		t.Fatalf("expected rich catalog, got %d", len(seed))
	}
	seen := map[float64]string{}
	for _, e := range seed {
		if err := ValidateAlphabetNumber(e.AlphabetNumber); err != nil {
			t.Fatalf("%s: %v", e.Slug, err)
		}
		if prev, ok := seen[e.AlphabetNumber]; ok {
			t.Fatalf("duplicate alphabetNumber %.1f for %s and %s", e.AlphabetNumber, prev, e.Slug)
		}
		seen[e.AlphabetNumber] = e.Slug
		if e.LetterIndex < 1 || e.LetterIndex > 24 {
			t.Fatalf("letterIndex out of range for %s", e.Slug)
		}
	}
	if seen[1] != "alpha-upper" || seen[13.1] != "nu-lower" || seen[24.9] != "omega-iota-sub" {
		t.Fatalf("unexpected fixed numbers: 1=%s 13.1=%s 24.9=%s", seen[1], seen[13.1], seen[24.9])
	}
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

