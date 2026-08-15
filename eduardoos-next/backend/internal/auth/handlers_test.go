package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterLoginHappyPath(t *testing.T) {
	h := &Handler{
		Store:        NewMemoryStore(),
		JWTSecret:    "test-jwt-secret",
		DevReturnOTP: true, // tests read OTP from JSON; production leaves this off
	}
	r := chi.NewRouter()
	h.Routes(r)

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

	verBody := `{"email":"user@example.com","otp":"` + otp + `"}`
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/api/auth/verify-otp", bytes.NewBufferString(verBody)))
	if rec2.Code != http.StatusOK {
		t.Fatalf("verify status=%d body=%s", rec2.Code, rec2.Body.String())
	}

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

func TestRegisterOmitsOTPWithoutDevFlag(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{
		Store:     store,
		JWTSecret: "test-jwt-secret",
		SMTPPass:  "", // empty → log-only delivery, no crash
	}
	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/register",
		bytes.NewBufferString(`{"email":"nodev@example.com","password":"password123"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("register status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, ok := resp["otp"]; ok {
		t.Fatalf("otp must not appear without DEV_RETURN_OTP, got %#v", resp)
	}
	stored, ok, err := store.GetOTP(context.Background(), "nodev@example.com")
	if err != nil || !ok || len(stored) != 6 {
		t.Fatalf("otp should still be stored err=%v ok=%v otp=%q", err, ok, stored)
	}
}

func TestForgotPasswordWithoutSMTPDoesNotCrash(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{
		Store:        store,
		JWTSecret:    "test-jwt-secret",
		SMTPPass:     "", // empty pass → log path, no panic
		DevReturnOTP: true,
	}
	if err := store.PutUser(context.Background(), User{
		Email:        "reset@example.com",
		PasswordHash: HashPassword("password123"),
		Verified:     true,
	}); err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password",
		bytes.NewBufferString(`{"email":"reset@example.com"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("forgot-password status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	otp, _ := resp["otp"].(string)
	if len(otp) != 6 {
		t.Fatalf("expected otp with DevReturnOTP, got %#v", resp)
	}
	stored, ok, err := store.GetResetOTP(context.Background(), "reset@example.com")
	if err != nil || !ok || stored != otp {
		t.Fatalf("reset otp store mismatch stored=%q ok=%v err=%v", stored, ok, err)
	}
}

func TestForgotPasswordUnknownEmailStillOK(t *testing.T) {
	h := &Handler{
		Store:     NewMemoryStore(),
		JWTSecret: "test-jwt-secret",
		SMTPPass:  "",
	}
	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password",
		bytes.NewBufferString(`{"email":"nobody@example.com"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("forgot-password status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if _, ok := resp["otp"]; ok {
		t.Fatalf("must not return otp for unknown email, got %#v", resp)
	}
}

func TestSendPlainMailEmptyPassSucceeds(t *testing.T) {
	h := &Handler{SMTPPass: ""}
	if err := h.sendPlainMail("dev@example.com", "test", "body"); err != nil {
		t.Fatalf("empty SMTP_PASS must not error: %v", err)
	}
}
