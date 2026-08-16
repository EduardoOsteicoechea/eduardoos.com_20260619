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

func TestLoginRejectsUnverified(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{Store: store, JWTSecret: "test-jwt-secret"}
	if err := store.PutUser(context.Background(), User{
		Email:        "pending@example.com",
		PasswordHash: HashPassword("password123"),
		Verified:     false,
	}); err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/login",
		bytes.NewBufferString(`{"email":"pending@example.com","password":"password123"}`)))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("login status=%d body=%s want 401", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	msg, _ := resp["error"].(string)
	if msg != "email not verified" {
		t.Fatalf("expected email not verified, got %#v", resp)
	}
	if token, ok := resp["token"]; ok && token != nil && token != "" {
		t.Fatalf("unverified login must not issue token, got %#v", resp)
	}
}

func TestRegisterDoesNotIssueToken(t *testing.T) {
	h := &Handler{Store: NewMemoryStore(), JWTSecret: "test-jwt-secret", DevReturnOTP: true}
	r := chi.NewRouter()
	h.Routes(r)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/register",
		bytes.NewBufferString(`{"email":"new@example.com","password":"password123"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("register status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if token := resp["token"]; token != nil {
		t.Fatalf("register must not issue a usable session token, got %#v", resp)
	}
	user, ok, err := h.Store.GetUser(context.Background(), "new@example.com")
	if err != nil || !ok || user.Verified {
		t.Fatalf("new user must exist unverified ok=%v verified=%v err=%v", ok, user.Verified, err)
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

func TestNormalizeSMTPPassStripsSpaces(t *testing.T) {
	got := normalizeSMTPPass(" abcd efgh ijkl mnop ")
	want := "abcdefghijklmnop"
	if got != want {
		t.Fatalf("normalizeSMTPPass=%q want %q", got, want)
	}
	if normalizeSMTPPass("   ") != "" {
		t.Fatal("whitespace-only pass must normalize to empty")
	}
}

func TestResetPasswordAcceptsPasswordField(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{Store: store, JWTSecret: "test-jwt-secret", SMTPPass: ""}
	if err := store.PutUser(context.Background(), User{
		Email:        "reset2@example.com",
		PasswordHash: HashPassword("password123"),
		Verified:     true,
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.PutResetOTP(context.Background(), "reset2@example.com", "654321"); err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	// Frontend sends "password" (not "newPassword").
	body := `{"email":"reset2@example.com","otp":"654321","password":"newpass99"}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewBufferString(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("reset with password field status=%d body=%s", rec.Code, rec.Body.String())
	}
	user, ok, err := store.GetUser(context.Background(), "reset2@example.com")
	if err != nil || !ok || !CheckPassword("newpass99", user.PasswordHash) {
		t.Fatalf("password not updated ok=%v err=%v", ok, err)
	}
}

func TestResetPasswordAcceptsNewPasswordField(t *testing.T) {
	store := NewMemoryStore()
	h := &Handler{Store: store, JWTSecret: "test-jwt-secret", SMTPPass: ""}
	if err := store.PutUser(context.Background(), User{
		Email:        "reset3@example.com",
		PasswordHash: HashPassword("password123"),
		Verified:     true,
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.PutResetOTP(context.Background(), "reset3@example.com", "111222"); err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	body := `{"email":"reset3@example.com","otp":"111222","newPassword":"newerpass1"}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewBufferString(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("reset with newPassword field status=%d body=%s", rec.Code, rec.Body.String())
	}
	user, ok, err := store.GetUser(context.Background(), "reset3@example.com")
	if err != nil || !ok || !CheckPassword("newerpass1", user.PasswordHash) {
		t.Fatalf("password not updated ok=%v err=%v", ok, err)
	}
}
