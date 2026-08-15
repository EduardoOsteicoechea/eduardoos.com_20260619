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

	h := NewHandler(secret, NewMemoryEpamStore(), NewMemoryBIMStore())
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
	h := NewHandler("secret", nil, nil)
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

func TestIfcBimObjectKey(t *testing.T) {
	got := IfcBimObjectKey("a@b.com", "uuid-1")
	want := "ifcbim/a_at_b.com/uuid-1.ifc"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
