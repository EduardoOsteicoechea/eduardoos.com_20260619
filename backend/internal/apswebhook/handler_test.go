package apswebhook

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

func TestIngestAndList(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: auth.AdminEmail, Role: auth.RoleAdmin, Verified: true})
	h := NewHandler("test-secret", users, "")
	r := chi.NewRouter()
	h.Routes(r)

	body := `{"hook":{"event":"dm.version.added"},"payload":{"name":"demo.rvt"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/aps/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Correlation-ID", "test-cid-1")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("ingest status=%d body=%s", rec.Code, rec.Body.String())
	}

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/aps/webhook-events", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listRec.Code, listRec.Body.String())
	}
	var payload struct {
		Count  int     `json:"count"`
		Events []Event `json:"events"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Count != 1 || len(payload.Events) != 1 {
		t.Fatalf("expected 1 event, got count=%d len=%d", payload.Count, len(payload.Events))
	}
	if !bytes.Contains(payload.Events[0].Body, []byte("dm.version.added")) {
		t.Fatalf("body missing event: %s", payload.Events[0].Body)
	}
}

func TestSyncCompleteDisposition(t *testing.T) {
	h := NewHandler("test-secret", auth.NewMemoryStore(), "")
	r := chi.NewRouter()
	h.Routes(r)
	body := `{"hook":{"system":"adsk.c4r","event":"model.sync"},"payload":{"state":"SYNC_COMPLETE"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/aps/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	var ack map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &ack)
	if ack["disposition"] != "meeting_relevant" || ack["triggersDA"] != false {
		t.Fatalf("ack=%v", ack)
	}
	evs := h.snapshot()
	if len(evs) != 1 || evs[0].Disposition != "meeting_relevant" || evs[0].SyncState != "SYNC_COMPLETE" {
		t.Fatalf("event=%+v", evs)
	}
}

func TestSyncStartIgnoredNoDA(t *testing.T) {
	h := NewHandler("test-secret", auth.NewMemoryStore(), "")
	r := chi.NewRouter()
	h.Routes(r)
	body := `{"hook":{"system":"adsk.c4r","event":"model.sync"},"payload":{"state":"SYNC_START"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/aps/webhooks", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	evs := h.snapshot()
	if len(evs) != 1 || evs[0].Disposition != "ignored_no_da" {
		t.Fatalf("event=%+v", evs)
	}
}

func TestIngestRequiresSecretWhenConfigured(t *testing.T) {
	h := NewHandler("test-secret", auth.NewMemoryStore(), "s3cr3t")
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodPost, "/api/aps/webhooks", strings.NewReader(`{"a":1}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if len(h.snapshot()) != 1 || h.snapshot()[0].Kind != "error" {
		t.Fatalf("expected error event recorded, got %+v", h.snapshot())
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/aps/webhooks", strings.NewReader(`{"a":1}`))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Aps-Webhook-Secret", "s3cr3t")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 with secret, got %d %s", rec2.Code, rec2.Body.String())
	}
}

func TestListForbiddenForNonAdmin(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{Email: "user@example.com", Role: auth.RoleUser, Verified: true})
	h := NewHandler("test-secret", users, "")
	r := chi.NewRouter()
	h.Routes(r)

	token, err := auth.IssueJWT("user@example.com", "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/admin/aps/webhook-events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}
