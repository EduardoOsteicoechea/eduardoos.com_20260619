package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const minPasswordLen = 8

// Handler wires auth routes against an in-memory store and JWT secret.
type Handler struct {
	Store     *Store
	JWTSecret string
}

// Routes mounts the public auth API under /api/auth/*.
func (h *Handler) Routes(r chi.Router) {
	r.Post("/api/auth/register", h.Register)
	r.Post("/api/auth/login", h.Login)
	r.Post("/api/auth/verify-otp", h.VerifyOTP)
	r.Post("/api/auth/forgot-password", h.ForgotPassword)
	r.Post("/api/auth/reset-password", h.ResetPassword)
	r.Post("/api/auth/logout", h.Logout)
}

// RequireJWT is middleware that rejects requests without a valid Bearer JWT.
// On success it sets X-User-Email so downstream handlers can read the subject
// without re-parsing the token.
func (h *Handler) RequireJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email, err := EmailFromBearer(r.Header.Get("Authorization"), h.JWTSecret)
		if err != nil {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		r.Header.Set("X-User-Email", email)
		next.ServeHTTP(w, r)
	})
}

// UserEmailFromRequest returns the email injected by RequireJWT.
func UserEmailFromRequest(r *http.Request) string {
	return NormalizeEmail(r.Header.Get("X-User-Email"))
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	_ = httpx.CorrelationFromRequest(r)
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(body.Password) < minPasswordLen {
		httpx.WriteError(w, http.StatusBadRequest, "password too short")
		return
	}
	email := NormalizeEmail(body.Email)
	if _, exists := h.Store.GetUser(email); exists {
		httpx.WriteError(w, http.StatusConflict, "account already exists")
		return
	}
	otp := GenerateOTP()
	h.Store.PutUser(User{
		Email:        email,
		PasswordHash: HashPassword(body.Password),
		Verified:     false,
	})
	h.Store.PutOTP(email, otp)
	// Local/memory mode: OTP is returned so tests and local UI can verify
	// without SMTP. Production Next should omit this field once SMTP lands.
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "OTP sent to email",
		"token":   nil,
		"otp":     otp,
	})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	email := NormalizeEmail(body.Email)
	user, ok := h.Store.GetUser(email)
	if !ok || !CheckPassword(body.Password, user.PasswordHash) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !user.Verified {
		httpx.WriteError(w, http.StatusForbidden, "email not verified")
		return
	}
	token, err := IssueJWT(email, h.JWTSecret)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"email": email,
	})
}

func (h *Handler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	email := NormalizeEmail(body.Email)
	stored, ok := h.Store.GetOTP(email)
	if !ok || stored != strings.TrimSpace(body.OTP) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	if !h.Store.SetVerified(email, true) {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	h.Store.ClearOTP(email)
	token, err := IssueJWT(email, h.JWTSecret)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"token":   token,
		"message": "verified",
		"email":   email,
	})
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	email := NormalizeEmail(body.Email)
	// Always return OK to avoid account enumeration; only store OTP if user exists.
	otp := GenerateOTP()
	if _, ok := h.Store.GetUser(email); ok {
		h.Store.PutResetOTP(email, otp)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "If the account exists, a reset code was sent",
		"otp":     otp, // local/memory convenience; strip when SMTP is wired
	})
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		OTP         string `json:"otp"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if len(body.NewPassword) < minPasswordLen {
		httpx.WriteError(w, http.StatusBadRequest, "password too short")
		return
	}
	email := NormalizeEmail(body.Email)
	stored, ok := h.Store.GetResetOTP(email)
	if !ok || stored != strings.TrimSpace(body.OTP) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	if !h.Store.UpdatePassword(email, HashPassword(body.NewPassword)) {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	h.Store.ClearResetOTP(email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "password updated"})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	// Stateless JWT: client discards the token. Endpoint exists for API parity.
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "logged out"})
}
