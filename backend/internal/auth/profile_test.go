package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestGetProfileReturnsImageURL(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{Store: store, JWTSecret: "test-jwt-secret"}
	email := "avatar@example.com"
	if err := store.PutUser(context.Background(), User{
		Email:           email,
		PasswordHash:    HashPassword("password123"),
		Verified:        true,
		ProfileImageKey: "media/profiles/avatar@example.com/avatar.png",
	}); err != nil {
		t.Fatal(err)
	}
	token, err := IssueJWT(email, h.JWTSecret)
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/profile", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["email"] != email {
		t.Fatalf("email=%v", resp["email"])
	}
	wantURL := "/api/media/file/profiles/avatar@example.com/avatar.png"
	if resp["profileImageUrl"] != wantURL {
		t.Fatalf("profileImageUrl=%v want %s", resp["profileImageUrl"], wantURL)
	}
	if resp["profileImageKey"] != "media/profiles/avatar@example.com/avatar.png" {
		t.Fatalf("profileImageKey=%v", resp["profileImageKey"])
	}
}

func TestGetProfileWithoutImage(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{Store: store, JWTSecret: "test-jwt-secret"}
	email := "plain@example.com"
	if err := store.PutUser(context.Background(), User{
		Email:        email,
		PasswordHash: HashPassword("password123"),
		Verified:     true,
	}); err != nil {
		t.Fatal(err)
	}
	token, err := IssueJWT(email, h.JWTSecret)
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)
	req := httptest.NewRequest(http.MethodGet, "/api/auth/profile", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if url, _ := resp["profileImageUrl"].(string); url != "" {
		t.Fatalf("expected empty profileImageUrl, got %q", url)
	}
}

func TestGetProfileRequiresJWT(t *testing.T) {
	h := &Handler{Store: NewMemoryStore(), JWTSecret: "test-jwt-secret"}
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/profile", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
}
