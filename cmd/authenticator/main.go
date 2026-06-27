// Authenticator — registration, login, OTP verification, JWT issuance.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"eduardoos/pkg/authstore"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
)

type state struct {
	store     authstore.Store
	jwtSecret string
	smtpUser  string
	smtpPass  string
	telemetry *common.TelemetryClient
}

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	databaseURL := common.Env("DATABASE_URL", "")
	st := &state{
		store:     authstore.New(databaseURL, secret),
		jwtSecret: common.Env("JWT_SECRET", "dev-jwt-secret"),
		smtpUser:  common.Env("SMTP_USER", "eduardooost@gmail.com"),
		smtpPass:  common.Env("SMTP_PASS", ""),
		telemetry: common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
	}
	log.Printf("authenticator user store backend=%s database_url_set=%t", st.store.BackendName(), databaseURL != "")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("authenticator", map[string]any{
		"user_store": st.store.BackendName(),
	}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/register", st.register)
		r.Post("/login", st.login)
		r.Post("/verify-otp", st.verifyOTP)
		r.Post("/user-exists", st.userExists)
	})

	log.Printf("authenticator listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func hashPassword(pw string) string {
	sum := sha256.Sum256([]byte(pw))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func (s *state) register(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		log.Printf("[correlation=%s] register invalid payload err=%v email_present=%t", cid, err, body.Email != "")
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	email := authstore.NormalizeEmail(body.Email)
	log.Printf("[correlation=%s] register started email=%s store=%s", cid, email, s.store.BackendName())

	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	user := authstore.User{
		Email:        email,
		PasswordHash: hashPassword(body.Password),
		Verified:     false,
	}
	if err := s.store.PutUser(r.Context(), user); err != nil {
		log.Printf("[correlation=%s] register put user failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	if err := s.store.PutOTP(r.Context(), email, otp); err != nil {
		log.Printf("[correlation=%s] register put otp failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not store otp")
		return
	}
	s.sendOTP(email, otp)
	s.report(r, "auth.register", "success", email)
	log.Printf("[correlation=%s] register success email=%s verified=false", cid, email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "OTP sent to email", "token": nil})
}

func (s *state) login(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("[correlation=%s] login invalid json err=%v", cid, err)
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := authstore.NormalizeEmail(body.Email)
	log.Printf("[correlation=%s] login attempt email=%s store=%s", cid, email, s.store.BackendName())

	user, ok, err := s.store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] login get user failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "login unavailable")
		return
	}
	if !ok {
		log.Printf("[correlation=%s] login rejected user_not_found email=%s", cid, email)
		common.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if user.PasswordHash != hashPassword(body.Password) {
		log.Printf("[correlation=%s] login rejected bad_password email=%s verified=%t", cid, email, user.Verified)
		common.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !user.Verified {
		log.Printf("[correlation=%s] login rejected email_not_verified email=%s", cid, email)
		common.WriteError(w, http.StatusUnauthorized, "email not verified")
		return
	}
	token, err := s.issueJWT(email)
	if err != nil {
		log.Printf("[correlation=%s] login jwt issue failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	log.Printf("[correlation=%s] login success email=%s", cid, email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "Login successful", "token": token})
}

func (s *state) verifyOTP(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("[correlation=%s] verify-otp invalid json err=%v", cid, err)
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := authstore.NormalizeEmail(body.Email)
	log.Printf("[correlation=%s] verify-otp attempt email=%s", cid, email)

	storedOTP, ok, err := s.store.GetOTP(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] verify-otp get otp failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "verification unavailable")
		return
	}
	if !ok || storedOTP != strings.TrimSpace(body.OTP) {
		log.Printf("[correlation=%s] verify-otp rejected invalid_otp email=%s otp_present=%t", cid, email, body.OTP != "")
		common.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	user, found, err := s.store.GetUser(r.Context(), email)
	if err != nil || !found {
		log.Printf("[correlation=%s] verify-otp user missing email=%s found=%t err=%v", cid, email, found, err)
		common.WriteError(w, http.StatusUnauthorized, "account not found")
		return
	}
	user.Verified = true
	if err := s.store.PutUser(r.Context(), user); err != nil {
		log.Printf("[correlation=%s] verify-otp put user failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not verify account")
		return
	}
	_ = s.store.DeleteOTP(r.Context(), email)
	token, err := s.issueJWT(email)
	if err != nil {
		log.Printf("[correlation=%s] verify-otp jwt issue failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not issue token")
		return
	}
	log.Printf("[correlation=%s] verify-otp success email=%s", cid, email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "Email verified", "token": token})
}

func (s *state) userExists(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	email := authstore.NormalizeEmail(body.Email)
	user, ok, err := s.store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] user-exists store error email=%s err=%v", cid, email, err)
		common.WriteJSON(w, http.StatusOK, map[string]bool{"exists": false, "verified": false})
		return
	}
	log.Printf("[correlation=%s] user-exists email=%s exists=%t verified=%t", cid, email, ok, ok && user.Verified)
	common.WriteJSON(w, http.StatusOK, map[string]bool{"exists": ok, "verified": ok && user.Verified})
}

func (s *state) issueJWT(email string) (string, error) {
	claims := jwt.MapClaims{"sub": email, "exp": time.Now().Add(24 * time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.jwtSecret))
}

func (s *state) sendOTP(email, otp string) {
	if s.smtpPass == "" {
		log.Printf("OTP for %s: %s (SMTP_PASS empty)", email, otp)
		return
	}
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: Eduardo OS OTP\r\n\r\nYour code: %s\r\n", email, otp))
	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPass, "smtp.gmail.com")
	if err := smtp.SendMail("smtp.gmail.com:587", auth, s.smtpUser, []string{email}, msg); err != nil {
		log.Printf("smtp send failed email=%s err=%v", email, err)
	}
}

func (s *state) report(r *http.Request, event, status, email string) {
	cid := common.CorrelationFromRequest(r)
	entry := common.NewFlightLog(cid, "authenticator", event, status)
	entry.Metadata = map[string]string{"email": email}
	s.telemetry.Emit(entry, cid)
}
