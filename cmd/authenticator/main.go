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
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
)

type userRecord struct {
	Email        string `json:"email"`
	PasswordHash string `json:"passwordHash"`
	Verified     bool   `json:"verified"`
}

type state struct {
	mu         sync.RWMutex
	users      map[string]userRecord
	otps       map[string]string
	jwtSecret  string
	smtpUser   string
	smtpPass   string
	telemetry  *common.TelemetryClient
}

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	st := &state{
		users:     make(map[string]userRecord),
		otps:      make(map[string]string),
		jwtSecret: common.Env("JWT_SECRET", "dev-jwt-secret"),
		smtpUser:  common.Env("SMTP_USER", "eduardooost@gmail.com"),
		smtpPass:  common.Env("SMTP_PASS", ""),
		telemetry: common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("authenticator", nil))
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
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	s.mu.Lock()
	s.users[body.Email] = userRecord{Email: body.Email, PasswordHash: hashPassword(body.Password), Verified: false}
	s.otps[body.Email] = otp
	s.mu.Unlock()
	s.sendOTP(body.Email, otp)
	s.report(r, "auth.register", "success", body.Email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "OTP sent to email", "token": nil})
}

func (s *state) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	s.mu.RLock()
	user, ok := s.users[body.Email]
	s.mu.RUnlock()
	if !ok || user.PasswordHash != hashPassword(body.Password) {
		common.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !user.Verified {
		common.WriteError(w, http.StatusUnauthorized, "email not verified")
		return
	}
	token, _ := s.issueJWT(body.Email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "Login successful", "token": token})
}

func (s *state) verifyOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.otps[body.Email] != body.OTP {
		common.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	u := s.users[body.Email]
	u.Verified = true
	s.users[body.Email] = u
	delete(s.otps, body.Email)
	token, _ := s.issueJWT(body.Email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "Email verified", "token": token})
}

func (s *state) userExists(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	email := strings.ToLower(body.Email)
	s.mu.RLock()
	u, ok := s.users[email]
	if !ok {
		for k, v := range s.users {
			if strings.EqualFold(k, body.Email) {
				u, ok = v, true
				break
			}
		}
	}
	s.mu.RUnlock()
	common.WriteJSON(w, http.StatusOK, map[string]bool{"exists": ok, "verified": ok && u.Verified})
}

func (s *state) issueJWT(email string) (string, error) {
	claims := jwt.MapClaims{"sub": email, "exp": time.Now().Add(time.Hour).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.jwtSecret))
}

func (s *state) sendOTP(email, otp string) {
	if s.smtpPass == "" {
		log.Printf("OTP for %s: %s (SMTP_PASS empty)", email, otp)
		return
	}
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: Eduardo OS OTP\r\n\r\nYour code: %s\r\n", email, otp))
	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPass, "smtp.gmail.com")
	_ = smtp.SendMail("smtp.gmail.com:587", auth, s.smtpUser, []string{email}, msg)
}

func (s *state) report(r *http.Request, event, status, email string) {
	cid := common.CorrelationFromRequest(r)
	entry := common.NewFlightLog(cid, "authenticator", event, status)
	entry.Metadata = map[string]string{"email": email}
	s.telemetry.Emit(entry, cid)
}
