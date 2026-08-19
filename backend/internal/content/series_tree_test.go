package content

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestBuildSeriesTreeGroupsAndSorts(t *testing.T) {
	records := []EpamRecord{
		{EpamID: "b", Title: "Beta", Series: "Alpha", SeriesChapter: "2"},
		{EpamID: "a", Title: "Alpha", Series: "Alpha", SeriesChapter: "1"},
		{EpamID: "c", Title: "Lone", Series: "", SeriesChapter: ""},
		{EpamID: "d", Title: "Gamma", Series: "Alpha", SeriesChapter: "1"},
	}
	tree := BuildSeriesTree(records)
	if tree.Count != 4 {
		t.Fatalf("count=%d want 4", tree.Count)
	}
	if len(tree.Series) != 2 {
		t.Fatalf("series nodes=%d want 2", len(tree.Series))
	}
	// Sorted: "(sin serie)" then "Alpha" — "(" sorts before letters in Go.
	if tree.Series[0].Name != UnassignedSeriesLabel {
		t.Fatalf("first series=%q want %q", tree.Series[0].Name, UnassignedSeriesLabel)
	}
	if tree.Series[1].Name != "Alpha" {
		t.Fatalf("second series=%q want Alpha", tree.Series[1].Name)
	}
	alpha := tree.Series[1]
	if len(alpha.Chapters) != 2 {
		t.Fatalf("alpha chapters=%d want 2", len(alpha.Chapters))
	}
	if alpha.Chapters[0].Name != "1" || len(alpha.Chapters[0].Items) != 2 {
		t.Fatalf("chapter 1 unexpected: %#v", alpha.Chapters[0])
	}
	if alpha.Chapters[0].Items[0].Title != "Alpha" || alpha.Chapters[0].Items[1].Title != "Gamma" {
		t.Fatalf("chapter 1 item order: %#v", alpha.Chapters[0].Items)
	}
}

func TestApplyEpamWriteSyncsSeriesFromHeader(t *testing.T) {
	rec := EpamRecord{UserID: "u@x.com"}
	applyEpamWrite(&rec, epamWriteBody{
		Document: map[string]any{
			"id": "epam-1",
			"header": map[string]any{
				"title":          "T",
				"series":         "Serie X",
				"series_chapter": "3",
				"author":         "Eduardo",
			},
		},
	})
	if rec.EpamID != "epam-1" {
		t.Fatalf("epamId=%q", rec.EpamID)
	}
	if rec.Title != "T" || rec.Series != "Serie X" || rec.SeriesChapter != "3" || rec.Author != "Eduardo" {
		t.Fatalf("meta not synced: %#v", rec)
	}
}

func TestListEpamSeriesTreeAuthenticated(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("reader@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	store := NewMemoryEpamStore()
	_, err = store.Save(nil, EpamRecord{
		UserID:        "reader@example.com",
		Title:         "One",
		Series:        "S1",
		SeriesChapter: "Ch1",
		Body:          map[string]any{"header": map[string]any{"title": "One"}},
	}, "cid-1")
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, store)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/epams/series-tree", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var body SeriesTreeResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Count != 1 || len(body.Series) != 1 || body.Series[0].Name != "S1" {
		t.Fatalf("unexpected tree: %#v", body)
	}
	if len(body.Series[0].Chapters) != 1 || body.Series[0].Chapters[0].Name != "Ch1" {
		t.Fatalf("unexpected chapters: %#v", body.Series[0].Chapters)
	}
}

func TestListEpamSeriesTreeUnauthorized(t *testing.T) {
	h := NewHandler("secret", nil)
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/epams/series-tree", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}
