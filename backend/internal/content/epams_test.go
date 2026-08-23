package content

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestEpamsListEmptyWhenAuthenticated(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("reader@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, NewMemoryEpamStore())
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/epams", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items []any `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Items == nil {
		t.Fatal("items should be present (empty slice)")
	}
	if len(body.Items) != 0 {
		t.Fatalf("expected empty list, got %#v", body.Items)
	}
}

func TestEpamsUnauthorizedWithoutToken(t *testing.T) {
	h := NewHandler("secret", nil)
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/epams", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestEpamObjectKey(t *testing.T) {
	got := EpamObjectKey("a@b.com", "uuid-1")
	want := "media/epams/a_at_b.com/uuid-1.epam"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestEpamRecycleObjectKey(t *testing.T) {
	got := EpamRecycleObjectKey("a@b.com", "uuid-1")
	want := "media/epams/a_at_b.com/recycle-bin/uuid-1.epam"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestDeleteEpamRemovesFromList(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("owner@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	store := NewMemoryEpamStore()
	rec, err := store.Save(t.Context(), EpamRecord{
		UserID:  "owner@example.com",
		EpamID:  "epam-del-1",
		Title:   "To delete",
		FileName: "to-delete.epam",
		Body:    map[string]any{"type": "pamphlet_single_sheet"},
	}, "cid-del")
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, store)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodDelete, "/api/epams/"+rec.EpamID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	recw := httptest.NewRecorder()
	r.ServeHTTP(recw, req)
	if recw.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", recw.Code, recw.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/epams", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d", listRec.Code)
	}
	var body struct {
		Count int           `json:"count"`
		Epams []EpamRecord  `json:"epams"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Count != 0 || len(body.Epams) != 0 {
		t.Fatalf("expected empty list after delete, got count=%d epams=%d", body.Count, len(body.Epams))
	}
}
