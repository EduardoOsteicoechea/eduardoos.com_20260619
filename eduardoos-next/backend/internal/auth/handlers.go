package auth

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const minPasswordLen = 8

// Handler wires auth routes against a UserStore and JWT secret.
// SMTP fields mirror production authenticator (SMTP_USER / SMTP_PASS).
// DevReturnOTP enables including the OTP in JSON responses (DEV_RETURN_OTP=1).
type Handler struct {
	Store        UserStore
	JWTSecret    string
	SMTPUser     string
	SMTPPass     string
	DevReturnOTP bool
}

// Routes mounts the public auth API under /api/auth/* plus JWT profile routes.
func (h *Handler) Routes(r chi.Router) {
	r.Post("/api/auth/register", h.Register)
	r.Post("/api/auth/login", h.Login)
	r.Post("/api/auth/verify-otp", h.VerifyOTP)
	r.Post("/api/auth/forgot-password", h.ForgotPassword)
	r.Post("/api/auth/reset-password", h.ResetPassword)
	r.Post("/api/auth/logout", h.Logout)
	h.MountProfileRoutes(r)
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

// maybeOTPField returns a response map with optional "otp" when DevReturnOTP is set.
func (h *Handler) maybeOTPField(base map[string]any, otp string) map[string]any {
	if h.DevReturnOTP && otp != "" {
		base["otp"] = otp
	}
	return base
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] auth.register begin", cid)
	var body struct {
		Email      string `json:"email"`
		Password   string `json:"password"`
		HumanToken string `json:"humanToken"`
		NotABot    bool   `json:"notABot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		log.Printf("[correlation=%s] auth.register reject invalid_email", cid)
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(body.Password) < minPasswordLen {
		log.Printf("[correlation=%s] auth.register reject password_too_short", cid)
		httpx.WriteError(w, http.StatusBadRequest, "password too short")
		return
	}
	email := NormalizeEmail(body.Email)
	if IsSpammyLocalPart(email) {
		log.Printf("[correlation=%s] auth.register reject spammy_local_part email=%s", cid, email)
		httpx.WriteError(w, http.StatusBadRequest, "email not accepted")
		return
	}
	// Client bot gate: register form sends notABot after the hold checkbox (Contact pattern).
	if !body.NotABot && strings.TrimSpace(body.HumanToken) == "" {
		log.Printf("[correlation=%s] auth.register reject missing_bot_check", cid)
		httpx.WriteError(w, http.StatusBadRequest, "confirm you are not a bot")
		return
	}
	log.Printf("[correlation=%s] auth.register lookup email=%s", cid, email)
	if _, exists, err := h.Store.GetUser(r.Context(), email); err != nil {
		log.Printf("[correlation=%s] auth.register store_error err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	} else if exists {
		log.Printf("[correlation=%s] auth.register conflict email=%s", cid, email)
		httpx.WriteError(w, http.StatusConflict, "account already exists")
		return
	}
	otp := GenerateOTP()
	if err := h.Store.PutUser(r.Context(), User{
		Email:        email,
		PasswordHash: HashPassword(body.Password),
		Verified:     false,
		Role:         ResolveRole(email, RoleUser),
		CreatedAt:    NowRFC3339(),
	}); err != nil {
		log.Printf("[correlation=%s] auth.register put_user_failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create account")
		return
	}
	log.Printf("[correlation=%s] auth.register user_created email=%s", cid, email)
	if err := h.Store.PutOTP(r.Context(), email, otp); err != nil {
		log.Printf("[correlation=%s] auth.register put_otp_failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not store otp")
		return
	}
	log.Printf("[correlation=%s] auth.register otp_stored otp_len=%d — delivering mail", cid, len(otp))
	if err := h.sendOTPTraced(cid, email, otp); err != nil {
		// Account + OTP are stored; surface mail failure so the UI does not claim
		// "OTP sent" when Gmail rejected the message (wrong SMTP_PASS, blocked 587, etc.).
		log.Printf("[correlation=%s] auth.register mail_failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not send verification email")
		return
	}
	log.Printf("[correlation=%s] auth.register done email=%s", cid, email)
	httpx.WriteJSON(w, http.StatusOK, h.maybeOTPField(map[string]any{
		"message": "OTP sent to email",
		"token":   nil,
	}, otp))
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
	// Unverified accounts must not receive a JWT — same message/status as legacy authenticator.
	if !user.Verified {
		httpx.WriteError(w, http.StatusUnauthorized, "email not verified")
		return
	}
	token, err := IssueJWTWithRole(email, user.Role, h.JWTSecret)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "Login successful",
		"token":   token,
		"email":   email,
		"role":    ResolveRole(email, user.Role),
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
	token, err := IssueJWTWithRole(email, user.Role, h.JWTSecret)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"token":   token,
		"message": "verified",
		"email":   email,
		"role":    ResolveRole(email, user.Role),
	})
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] auth.forgot-password begin", cid)
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		log.Printf("[correlation=%s] auth.forgot-password reject invalid_email", cid)
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	email := NormalizeEmail(body.Email)
	log.Printf("[correlation=%s] auth.forgot-password lookup email=%s", cid, email)
	var otp string
	if _, ok, err := h.Store.GetUser(r.Context(), email); err != nil {
		log.Printf("[correlation=%s] auth.forgot-password store_error err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	} else if ok {
		log.Printf("[correlation=%s] auth.forgot-password account_found email=%s", cid, email)
		otp = GenerateOTP()
		if err := h.Store.PutResetOTP(r.Context(), email, otp); err != nil {
			log.Printf("[correlation=%s] auth.forgot-password put_reset_otp_failed err=%v", cid, err)
			httpx.WriteError(w, http.StatusBadGateway, "could not store reset code")
			return
		}
		log.Printf("[correlation=%s] auth.forgot-password reset_otp_stored otp_len=%d smtp_pass_set=%t — delivering mail",
			cid, len(otp), normalizeSMTPPass(h.SMTPPass) != "")
		// Delivery errors are logged step-by-step; HTTP stays generic (no account enumeration).
		if err := h.sendResetOTPTraced(cid, email, otp); err != nil {
			log.Printf("[correlation=%s] auth.forgot-password mail_failed err=%v", cid, err)
		}
		log.Printf("[correlation=%s] auth.forgot-password mail_attempt_finished email=%s", cid, email)
	} else {
		log.Printf("[correlation=%s] auth.forgot-password no_account email=%s (generic ok)", cid, email)
	}
	log.Printf("[correlation=%s] auth.forgot-password done email=%s issued=%t", cid, email, otp != "")
	httpx.WriteJSON(w, http.StatusOK, h.maybeOTPField(map[string]any{
		"message": "If the account exists, a reset code was sent",
	}, otp))
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	// Frontend historically sends "password"; older clients may send "newPassword".
	// Accept either so reset works regardless of which field the client used.
	var body struct {
		Email       string `json:"email"`
		OTP         string `json:"otp"`
		Password    string `json:"password"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	newPassword := body.NewPassword
	if newPassword == "" {
		newPassword = body.Password
	}
	if len(newPassword) < minPasswordLen {
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
		log.Printf("[correlation=%s] reset-password rejected invalid_otp email=%s", cid, email)
		httpx.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	user, exists, err := h.Store.GetUser(r.Context(), email)
	if err != nil || !exists {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	user.PasswordHash = HashPassword(newPassword)
	if err := h.Store.PutUser(r.Context(), user); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update password")
		return
	}
	_ = h.Store.DeleteResetOTP(r.Context(), email)
	log.Printf("[correlation=%s] reset-password success email=%s", cid, email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "password updated"})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "logged out"})
}
