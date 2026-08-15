package documents

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestPamphletPDFRequiresJWT(t *testing.T) {
	h := NewHandler("doc-secret")
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodPost, "/api/documents/pamphlet/pdf", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
}

func TestPamphletPDFReturnsPDF(t *testing.T) {
	secret := "doc-secret"
	token, err := auth.IssueJWT("writer@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	body := `{"header":{"title":"Stub Pamphlet Title"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/documents/pamphlet/pdf", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/pdf" {
		t.Fatalf("Content-Type=%q want application/pdf", ct)
	}
	raw := rec.Body.Bytes()
	if !bytes.HasPrefix(raw, []byte("%PDF-1.4")) {
		t.Fatalf("not a PDF: %q", raw[:min(24, len(raw))])
	}
	if !bytes.Contains(raw, []byte("Stub Pamphlet Title")) {
		t.Fatal("expected title embedded in stub PDF")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
