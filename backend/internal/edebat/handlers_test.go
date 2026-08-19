package edebat

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestEdebatCreateListTurnFlow(t *testing.T) {
	secret := "edebat-secret"
	token, err := auth.IssueJWT("debater@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	// Create
	createReq := httptest.NewRequest(http.MethodPost, "/api/edebat",
		bytes.NewBufferString(`{"topic":"Is Go great?"}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var createResp map[string]any
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatal(err)
	}
	doc, _ := createResp["document"].(map[string]any)
	id, _ := doc["id"].(string)
	if id == "" || doc["topic"] != "Is Go great?" {
		t.Fatalf("unexpected create doc: %#v", doc)
	}

	// List
	listReq := httptest.NewRequest(http.MethodGet, "/api/edebat", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d", listRec.Code)
	}
	var listResp map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &listResp); err != nil {
		t.Fatal(err)
	}
	edebats, _ := listResp["edebats"].([]any)
	if len(edebats) != 1 {
		t.Fatalf("want 1 edebat, got %#v", listResp)
	}

	// Turn
	turnReq := httptest.NewRequest(http.MethodPost, "/api/edebat/"+id+"/turn",
		bytes.NewBufferString(`{"role":"challenger","text":"Yes, because of simplicity."}`))
	turnReq.Header.Set("Authorization", "Bearer "+token)
	turnReq.Header.Set("Content-Type", "application/json")
	turnRec := httptest.NewRecorder()
	r.ServeHTTP(turnRec, turnReq)
	if turnRec.Code != http.StatusOK {
		t.Fatalf("turn status=%d body=%s", turnRec.Code, turnRec.Body.String())
	}
	var turnResp map[string]any
	if err := json.Unmarshal(turnRec.Body.Bytes(), &turnResp); err != nil {
		t.Fatal(err)
	}
	updated, _ := turnResp["document"].(map[string]any)
	turns, _ := updated["turns"].([]any)
	if len(turns) != 1 {
		t.Fatalf("want 1 turn, got %#v", updated)
	}
	first, _ := turns[0].(map[string]any)
	if first["role"] != "challenger" || first["text"] != "Yes, because of simplicity." {
		t.Fatalf("unexpected turn: %#v", first)
	}

	// Get
	getReq := httptest.NewRequest(http.MethodGet, "/api/edebat/"+id, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status=%d", getRec.Code)
	}
}

func TestEdebatRequiresJWT(t *testing.T) {
	h := NewHandler("secret")
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/edebat", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
}

func TestEdebatIsolatesUsers(t *testing.T) {
	secret := "edebat-secret"
	aToken, _ := auth.IssueJWT("a@example.com", secret)
	bToken, _ := auth.IssueJWT("b@example.com", secret)
	h := NewHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/edebat",
		bytes.NewBufferString(`{"topic":"private"}`))
	createReq.Header.Set("Authorization", "Bearer "+aToken)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	var createResp map[string]any
	_ = json.Unmarshal(createRec.Body.Bytes(), &createResp)
	doc, _ := createResp["document"].(map[string]any)
	id, _ := doc["id"].(string)

	getReq := httptest.NewRequest(http.MethodGet, "/api/edebat/"+id, nil)
	getReq.Header.Set("Authorization", "Bearer "+bToken)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("status=%d want 404 for other user", getRec.Code)
	}
}
