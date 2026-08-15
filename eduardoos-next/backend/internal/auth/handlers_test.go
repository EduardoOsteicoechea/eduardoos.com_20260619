package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterLoginHappyPath(t *testing.T) {
	h := &Handler{
		Store:     NewMemoryStore(),
		JWTSecret: "test-jwt-secret",
	}
	r := chi.NewRouter()
	h.Routes(r)

	// Register
	regBody := `{"email":"user@example.com","password":"password123"}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBufferString(regBody)))
	if rec.Code != http.StatusOK {
		t.Fatalf("register status=%d body=%s", rec.Code, rec.Body.String())
	}
	var regResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &regResp); err != nil {
		t.Fatal(err)
	}
	otp, _ := regResp["otp"].(string)
	if len(otp) != 6 {
		t.Fatalf("expected otp in register response, got %#v", regResp)
	}

	// Verify OTP (marks verified + returns JWT)
	verBody := `{"email":"user@example.com","otp":"` + otp + `"}`
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/api/auth/verify-otp", bytes.NewBufferString(verBody)))
	if rec2.Code != http.StatusOK {
		t.Fatalf("verify status=%d body=%s", rec2.Code, rec2.Body.String())
	}

	// Login
	loginBody := `{"email":"user@example.com","password":"password123"}`
	rec3 := httptest.NewRecorder()
	r.ServeHTTP(rec3, httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(loginBody)))
	if rec3.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", rec3.Code, rec3.Body.String())
	}
	var loginResp map[string]any
	if err := json.Unmarshal(rec3.Body.Bytes(), &loginResp); err != nil {
		t.Fatal(err)
	}
	token, _ := loginResp["token"].(string)
	if token == "" {
		t.Fatalf("expected token, got %#v", loginResp)
	}

	email, err := EmailFromBearer("Bearer "+token, h.JWTSecret)
	if err != nil || email != "user@example.com" {
		t.Fatalf("token subject=%q err=%v", email, err)
	}
}
