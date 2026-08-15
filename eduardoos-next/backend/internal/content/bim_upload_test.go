package content

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestBIMUploadStoresRealBytesAndGetReturnsThem(t *testing.T) {
	secret := "bim-upload-secret"
	token, err := auth.IssueJWT("bim@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	store := NewMemoryBIMStore()
	h := NewHandler(secret, NewMemoryEpamStore(), store)
	r := chi.NewRouter()
	h.Routes(r)

	payload := []byte("ISO-10303-21;\nHEADER;\nFILE_NAME('real-upload.ifc');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n")
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("name", "real-upload.ifc")
	part, err := w.CreateFormFile("file", "real-upload.ifc")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/bim/models", &body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", rec.Code, rec.Body.String())
	}
	var created IfcBimRecord
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.ModelID == "" {
		t.Fatal("expected modelId")
	}
	if created.ContentSizeBytes != int64(len(payload)) {
		t.Fatalf("contentSizeBytes=%d want %d", created.ContentSizeBytes, len(payload))
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/bim/models/"+created.ModelID+"/file", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", getRec.Code, getRec.Body.String())
	}
	if !bytes.Equal(getRec.Body.Bytes(), payload) {
		t.Fatalf("file body mismatch: got %q", getRec.Body.String())
	}
}

func TestEpamDocumentCreateReturnsMetaDocument(t *testing.T) {
	secret := "epam-doc-secret"
	token, err := auth.IssueJWT("writer@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret, NewMemoryEpamStore(), NewMemoryBIMStore())
	r := chi.NewRouter()
	h.Routes(r)

	payload := map[string]any{
		"fileName": "demo.epam",
		"document": map[string]any{
			"type": "pamphlet_single_sheet",
			"id":   "doc-1",
			"header": map[string]any{
				"title": "Cloud Pamphlet",
			},
		},
	}
	raw, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/epams", bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var out struct {
		Meta     EpamRecord    `json:"meta"`
		Document map[string]any `json:"document"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Meta.EpamID == "" {
		t.Fatal("expected meta.epamId")
	}
	if out.Document["type"] != "pamphlet_single_sheet" {
		t.Fatalf("document=%#v", out.Document)
	}
}
