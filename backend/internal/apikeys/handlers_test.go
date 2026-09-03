package apikeys

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestHashAndLooksLike(t *testing.T) {
	secret, err := GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	if !LooksLikeAPIKey(secret) {
		t.Fatalf("expected LooksLikeAPIKey for %s", secret)
	}
	if LooksLikeAPIKey("eyJhbGciOiJIUzI1NiJ9.payload.sig") {
		t.Fatal("JWT must not look like api key")
	}
	h1 := HashSecret(secret)
	h2 := HashSecret(secret)
	if h1 != h2 || len(h1) != 64 {
		t.Fatalf("hash unstable or wrong len: %s", h1)
	}
	if !strings.HasPrefix(DisplayPrefix(secret), SecretPrefix[:8]) {
		t.Fatalf("prefix=%s", DisplayPrefix(secret))
	}
}

func TestMemoryCreateListRevokeAuth(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email: "member@example.com", Role: auth.RoleUser, PasswordHash: "x",
	})
	ents := payments.NewStore()
	ents.PutEntitlements("member@example.com", payments.BuildEntitlements([]string{"api", "ereport"}, "monthly", 1))

	keys := NewMemoryStore()
	h := NewHandler("test-secret", users, keys, ents)

	r := chi.NewRouter()
	h.Routes(r)
	h.MountV1(r, func(vr chi.Router) {
		vr.Use(h.RequireProductAccess("ereport"))
		vr.Get("/api/v1/ereport/ping", func(w http.ResponseWriter, req *http.Request) {
			httpxWriteOK(w, map[string]any{
				"email":  auth.UserEmailFromRequest(req),
				"prefix": KeyPrefixFromRequest(req),
			})
		})
	})

	// JWT create
	token, err := auth.IssueJWTWithRole("member@example.com", auth.RoleUser, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	createReq := httptest.NewRequest(http.MethodPost, "/api/apikeys", bytes.NewBufferString(`{"label":"ci"}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		Key    string     `json:"key"`
		Record PublicView `json:"record"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Key == "" || created.Record.ID == "" || created.Record.Label != "ci" {
		t.Fatalf("created=%+v", created)
	}

	// v1 ping with API key
	ping := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/ping", nil)
	ping.Header.Set("Authorization", "Bearer "+created.Key)
	pingRec := httptest.NewRecorder()
	r.ServeHTTP(pingRec, ping)
	if pingRec.Code != http.StatusOK {
		t.Fatalf("ping status=%d body=%s", pingRec.Code, pingRec.Body.String())
	}

	// revoke
	del := httptest.NewRequest(http.MethodDelete, "/api/apikeys/"+created.Record.ID, nil)
	del.Header.Set("Authorization", "Bearer "+token)
	delRec := httptest.NewRecorder()
	r.ServeHTTP(delRec, del)
	if delRec.Code != http.StatusOK {
		t.Fatalf("revoke status=%d", delRec.Code)
	}

	ping2 := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/ping", nil)
	ping2.Header.Set("Authorization", "Bearer "+created.Key)
	ping2Rec := httptest.NewRecorder()
	r.ServeHTTP(ping2Rec, ping2)
	if ping2Rec.Code != http.StatusUnauthorized {
		t.Fatalf("after revoke want 401 got %d", ping2Rec.Code)
	}
}

func TestConfirmOverwriteGateNeedsAPIAndProduct(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{Email: "onlyapi@example.com", Role: auth.RoleUser})
	ents := payments.NewStore()
	ents.PutEntitlements("onlyapi@example.com", payments.BuildEntitlements([]string{"api"}, "monthly", 1))
	keys := NewMemoryStore()
	h := NewHandler("test-secret", users, keys, ents)
	secret, _ := GenerateSecret()
	rec, _ := NewRecord("onlyapi@example.com", "x", secret)
	_ = keys.Create(context.Background(), rec)

	r := chi.NewRouter()
	h.MountV1(r, func(vr chi.Router) {
		vr.Use(h.RequireProductAccess("ereport"))
		vr.Get("/api/v1/ereport/ping", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/ping", nil)
	req.Header.Set("Authorization", "Bearer "+secret)
	recW := httptest.NewRecorder()
	r.ServeHTTP(recW, req)
	if recW.Code != http.StatusForbidden {
		t.Fatalf("want 403 without ereport, got %d body=%s", recW.Code, recW.Body.String())
	}
}

func TestRateLimit(t *testing.T) {
	lim := NewRateLimiter(2)
	if ok, _ := lim.Allow("k1"); !ok {
		t.Fatal("first should allow")
	}
	if ok, _ := lim.Allow("k1"); !ok {
		t.Fatal("second should allow")
	}
	if ok, retry := lim.Allow("k1"); ok || retry < 1 {
		t.Fatalf("third should deny retry=%d", retry)
	}
}

func TestDocsPublic(t *testing.T) {
	h := NewHandler("test-secret", auth.NewMemoryStore(), NewMemoryStore(), nil)
	r := chi.NewRouter()
	h.RoutesPublicDocs(r)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/docs", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var cat DocsCatalog
	if err := json.Unmarshal(rec.Body.Bytes(), &cat); err != nil {
		t.Fatal(err)
	}
	if cat.Version != "1" || len(cat.Routes) < 2 {
		t.Fatalf("catalog=%+v", cat)
	}
	if cat.RateLimit.RequestsPerMinute != DefaultRateLimit {
		t.Fatalf("rate=%d", cat.RateLimit.RequestsPerMinute)
	}
	if strings.TrimSpace(cat.KeyPolicy) == "" {
		t.Fatal("expected keyPolicy (UI-only keys)")
	}
	if !strings.Contains(cat.Skill, "eduardoos-ereport-connector") && !strings.Contains(cat.Skill, "skills/eduardoos-ereport") {
		t.Fatalf("expected connector/skill URL, got %q", cat.Skill)
	}
	raw := rec.Body.String()
	if strings.Contains(raw, "keyManagement") || strings.Contains(raw, `"/api/apikeys"`) {
		t.Fatalf("key CRUD must not appear in public docs catalog: %s", raw)
	}
}

func httpxWriteOK(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(payload)
}
