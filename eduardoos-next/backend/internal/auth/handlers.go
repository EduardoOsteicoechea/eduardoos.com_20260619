package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const minPasswordLen = 8

// Handler wires auth routes against a UserStore and JWT secret.
type Handler struct {
	Store     UserStore
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
	if _, exists, err := h.Store.GetUser(r.Context(), email); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	} else if exists {
		httpx.WriteError(w, http.StatusConflict, "account already exists")
		return
	}
	otp := GenerateOTP()
	if err := h.Store.PutUser(r.Context(), User{
		Email:        email,
		PasswordHash: HashPassword(body.Password),
		Verified:     false,
	}); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not create account")
		return
	}
	if err := h.Store.PutOTP(r.Context(), email, otp); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not store otp")
		return
	}
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
	user, ok, err := h.Store.GetUser(r.Context(), email)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	}
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
	stored, ok, err := h.Store.GetOTP(r.Context(), email)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	}
	if !ok || stored != strings.TrimSpace(body.OTP) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	user, exists, err := h.Store.GetUser(r.Context(), email)
	if err != nil || !exists {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	user.Verified = true
	if err := h.Store.PutUser(r.Context(), user); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not verify")
		return
	}
	_ = h.Store.DeleteOTP(r.Context(), email)
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
	otp := GenerateOTP()
	if _, ok, err := h.Store.GetUser(r.Context(), email); err == nil && ok {
		_ = h.Store.PutResetOTP(r.Context(), email, otp)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "If the account exists, a reset code was sent",
		"otp":     otp,
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
	stored, ok, err := h.Store.GetResetOTP(r.Context(), email)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	}
	if !ok || stored != strings.TrimSpace(body.OTP) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	user, exists, err := h.Store.GetUser(r.Context(), email)
	if err != nil || !exists {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	user.PasswordHash = HashPassword(body.NewPassword)
	if err := h.Store.PutUser(r.Context(), user); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update password")
		return
	}
	_ = h.Store.DeleteResetOTP(r.Context(), email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "password updated"})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "logged out"})
}
