package documents

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestPamphletPDFReturnsFullLandscapePDF(t *testing.T) {
	secret := "doc-secret"
	token, err := auth.IssueJWT("writer@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	body := `{
		"type":"pamphlet_single_sheet",
		"header":{"title":"¿Cómo sabemos que interpretamos correctamente?","author":"Eduardo","series":"Romanos","series_chapter":"1","date":"2026-08-14"},
		"footer":{"action":"","message":"","label1":"WhatsApp","value1":"","label2":"Teléfono","value2":"","label3":"Dirección","value3":"","label4":"Actividades","value4":""},
		"column_1":[{"type":"paragraph","content":"Primera columna con acentos: niño y más."}],
		"column_2":[],
		"column_3":[{"type":"heading_1","content":"Capítulo"}],
		"column_4":[],
		"column_5":[],
		"column_6":[],
		"column_7":[],
		"column_8":[]
	}`
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
	cd := rec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "filename*=UTF-8''") {
		t.Fatalf("expected UTF-8 filename*: %s", cd)
	}
	raw := rec.Body.Bytes()
	if !bytes.HasPrefix(raw, []byte("%PDF-1.4")) {
		t.Fatalf("not a PDF: %q", raw[:min(24, len(raw))])
	}
	if !bytes.Contains(raw, []byte("%%EOF")) {
		t.Fatal("missing PDF EOF")
	}
	// Two-page landscape pamphlet, not the one-page Helvetica stub.
	if !bytes.Contains(raw, []byte("/Count 2")) {
		t.Fatal("expected two-page pamphlet PDF")
	}
	if !bytes.Contains(raw, []byte("/Roboto-Regular")) || !bytes.Contains(raw, []byte("/WinAnsiEncoding")) {
		t.Fatal("expected embedded Roboto with WinAnsiEncoding")
	}
	if bytes.Contains(raw, []byte("/BaseFont /Helvetica")) {
		t.Fatal("pamphlet print must not use Helvetica stub")
	}
	// Spanish accents as WinAnsi single bytes (not UTF-8 mojibake).
	if !bytes.Contains(raw, []byte{0xBF}) { // ¿
		t.Fatal("missing WinAnsi inverted question mark in PDF stream")
	}
	if !bytes.Contains(raw, []byte{0xF3}) { // ó in Cómo
		t.Fatal("missing WinAnsi o-acute in PDF stream")
	}
	if bytes.Contains(raw, []byte("Â¿")) || bytes.Contains(raw, []byte("Ã³")) {
		t.Fatal("UTF-8 mojibake present in PDF")
	}
	// Letter landscape MediaBox ≈ 792 × 612
	if !bytes.Contains(raw, []byte("791.99")) && !bytes.Contains(raw, []byte("792.00")) {
		t.Fatalf("expected US Letter landscape MediaBox width")
	}
}

func TestPamphletPDFRejectsBadType(t *testing.T) {
	secret := "doc-secret"
	token, err := auth.IssueJWT("writer@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	body := `{"type":"not_a_pamphlet","header":{"title":"X"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/documents/pamphlet/pdf", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", rec.Code)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
