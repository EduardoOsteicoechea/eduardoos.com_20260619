package instrumentalist

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func testHandler(secret string) *Handler {
	h := &Handler{
		JWTSecret: secret,
		Store:     NewMemoryStore(),
		auth:      &auth.Handler{JWTSecret: secret},
		LLM: func(_ context.Context, mode, _, user string) (string, error) {
			if mode == "analyze" {
				return "Coherence looks provisional.\n\nDetail: weighted premises need tighter group scoping for " + truncate(user, 40), nil
			}
			return "As a formal-logic agent: the higher-weight premises constrain the topic. " + truncate(user, 60), nil
		},
	}
	return h
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func TestInstrumentalistCreateListGetUpdateFlow(t *testing.T) {
	secret := "instru-secret"
	token, err := auth.IssueJWT("logic@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := testHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist",
		bytes.NewBufferString(`{"title":"Ethics tree","topic":"Is altruism rational?"}`))
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
	if id == "" || doc["type"] != "instru" || doc["title"] != "Ethics tree" {
		t.Fatalf("unexpected create doc: %#v", doc)
	}
	if key, _ := doc["s3Key"].(string); !strings.Contains(key, "media/instrumentalist/") {
		t.Fatalf("expected instru s3Key prefix, got %q", key)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/instrumentalist", nil)
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
	docs, _ := listResp["documents"].([]any)
	if len(docs) != 1 {
		t.Fatalf("want 1 document, got %#v", listResp)
	}

	treeJSON := `{
		"title":"Ethics tree v2",
		"topic":"Is altruism rational?",
		"beliefTree":{
			"nodes":[
				{"id":"g1","kind":"group","text":"Core","weight":0,"position":{"x":0,"y":0}},
				{"id":"n1","kind":"idea","text":"Agents prefer survival","weight":2,"groupId":"g1","position":{"x":100,"y":80}}
			],
			"edges":[{"id":"e1","source":"g1","target":"n1","kind":"group"}]
		}
	}`
	updReq := httptest.NewRequest(http.MethodPut, "/api/instrumentalist/"+id, bytes.NewBufferString(treeJSON))
	updReq.Header.Set("Authorization", "Bearer "+token)
	updReq.Header.Set("Content-Type", "application/json")
	updRec := httptest.NewRecorder()
	r.ServeHTTP(updRec, updReq)
	if updRec.Code != http.StatusOK {
		t.Fatalf("update status=%d body=%s", updRec.Code, updRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/instrumentalist/"+id, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status=%d", getRec.Code)
	}
	var getResp map[string]any
	if err := json.Unmarshal(getRec.Body.Bytes(), &getResp); err != nil {
		t.Fatal(err)
	}
	got, _ := getResp["document"].(map[string]any)
	if got["title"] != "Ethics tree v2" {
		t.Fatalf("title not updated: %#v", got)
	}
	tree, _ := got["beliefTree"].(map[string]any)
	nodes, _ := tree["nodes"].([]any)
	if len(nodes) != 2 {
		t.Fatalf("want 2 nodes, got %#v", tree)
	}
}

func TestInstrumentalistAnalyzeAndChat(t *testing.T) {
	secret := "instru-secret"
	token, err := auth.IssueJWT("logic@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := testHandler(secret)
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist",
		bytes.NewBufferString(`{"title":"T","topic":"Q"}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	var createResp map[string]any
	_ = json.Unmarshal(createRec.Body.Bytes(), &createResp)
	doc, _ := createResp["document"].(map[string]any)
	id, _ := doc["id"].(string)

	anReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist/"+id+"/analyze",
		bytes.NewBufferString(`{"beliefTree":{"nodes":[{"id":"n1","kind":"idea","text":"P","weight":1,"position":{"x":0,"y":0}}],"edges":[]}}`))
	anReq.Header.Set("Authorization", "Bearer "+token)
	anReq.Header.Set("Content-Type", "application/json")
	anRec := httptest.NewRecorder()
	r.ServeHTTP(anRec, anReq)
	if anRec.Code != http.StatusOK {
		t.Fatalf("analyze status=%d body=%s", anRec.Code, anRec.Body.String())
	}
	var anResp map[string]any
	_ = json.Unmarshal(anRec.Body.Bytes(), &anResp)
	analysis, _ := anResp["analysis"].(map[string]any)
	if analysis["summary"] == "" || analysis["detail"] == "" {
		t.Fatalf("expected analysis fields: %#v", analysis)
	}

	chatReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist/"+id+"/chat",
		bytes.NewBufferString(`{"message":"Does my tree support altruism?"}`))
	chatReq.Header.Set("Authorization", "Bearer "+token)
	chatReq.Header.Set("Content-Type", "application/json")
	chatRec := httptest.NewRecorder()
	r.ServeHTTP(chatRec, chatReq)
	if chatRec.Code != http.StatusOK {
		t.Fatalf("chat status=%d body=%s", chatRec.Code, chatRec.Body.String())
	}
	var chatResp map[string]any
	_ = json.Unmarshal(chatRec.Body.Bytes(), &chatResp)
	if chatResp["reply"] == "" {
		t.Fatalf("expected reply: %#v", chatResp)
	}
	updated, _ := chatResp["document"].(map[string]any)
	msgs, _ := updated["messages"].([]any)
	if len(msgs) < 3 {
		t.Fatalf("want welcome+user+assistant messages, got %#v", msgs)
	}
}

func TestInstrumentalistRequiresJWT(t *testing.T) {
	h := testHandler("secret")
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/instrumentalist", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestInstrumentalistLLMMissingReturns503(t *testing.T) {
	secret := "secret"
	token, _ := auth.IssueJWT("a@b.com", secret)
	h := testHandler(secret)
	h.LLM = nil
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist",
		bytes.NewBufferString(`{"title":"T"}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	var createResp map[string]any
	_ = json.Unmarshal(createRec.Body.Bytes(), &createResp)
	id := createResp["document"].(map[string]any)["id"].(string)

	anReq := httptest.NewRequest(http.MethodPost, "/api/instrumentalist/"+id+"/analyze",
		bytes.NewBufferString(`{}`))
	anReq.Header.Set("Authorization", "Bearer "+token)
	anRec := httptest.NewRecorder()
	r.ServeHTTP(anRec, anReq)
	if anRec.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d body=%s", anRec.Code, anRec.Body.String())
	}
}

func TestObjectKeySanitizesEmail(t *testing.T) {
	key := ObjectKey("user@example.com", "abc")
	want := "media/instrumentalist/user_at_example.com/abc.instru"
	if key != want {
		t.Fatalf("got %q want %q", key, want)
	}
}
