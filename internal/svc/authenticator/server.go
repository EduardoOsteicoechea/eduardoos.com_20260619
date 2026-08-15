package authenticator

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
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

const minPasswordLen = 8

type state struct {
	store     authstore.Store
	jwtSecret string
	smtpUser  string
	smtpPass  string
	telemetry *common.TelemetryClient
}

func Run(addr string) error {
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
		r.Post("/forgot-password", st.forgotPassword)
		r.Post("/reset-password", st.resetPassword)
		r.Post("/logout", st.logout)
		r.Post("/user-exists", st.userExists)
		r.Get("/profile", st.getProfile)
		r.Put("/profile", st.putProfile)
		r.Post("/notify-contact", st.notifyContact)
	})

	log.Printf("authenticator listening on %s", addr)
	return http.ListenAndServe(addr, r)
}

func hashPassword(pw string) string {
	sum := sha256.Sum256([]byte(pw))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func generateOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	}
	return fmt.Sprintf("%06d", n.Int64())
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

	otp := generateOTP()
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

func (s *state) forgotPassword(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := authstore.NormalizeEmail(body.Email)
	if !strings.Contains(email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	log.Printf("[correlation=%s] forgot-password started email=%s", cid, email)

	user, ok, err := s.store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] forgot-password get user failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "reset unavailable")
		return
	}
	if ok && user.Email != "" {
		otp := generateOTP()
		if err := s.store.PutResetOTP(r.Context(), email, otp); err != nil {
			log.Printf("[correlation=%s] forgot-password put otp failed email=%s err=%v", cid, email, err)
			common.WriteError(w, http.StatusInternalServerError, "could not store reset code")
			return
		}
		s.sendResetOTP(email, otp)
		s.report(r, "auth.forgot-password", "success", email)
		log.Printf("[correlation=%s] forgot-password code sent email=%s", cid, email)
	} else {
		s.report(r, "auth.forgot-password", "success", email)
		log.Printf("[correlation=%s] forgot-password no account email=%s (generic ok)", cid, email)
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "If that email is registered, we sent a reset code.",
	})
}

func (s *state) resetPassword(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		Email    string `json:"email"`
		OTP      string `json:"otp"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid request")
		return
	}
	email := authstore.NormalizeEmail(body.Email)
	otp := strings.TrimSpace(body.OTP)
	password := body.Password
	if !strings.Contains(email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(otp) != 6 {
		common.WriteError(w, http.StatusBadRequest, "invalid otp")
		return
	}
	if len(password) < minPasswordLen {
		common.WriteError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	log.Printf("[correlation=%s] reset-password attempt email=%s", cid, email)

	storedOTP, ok, err := s.store.GetResetOTP(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] reset-password get otp failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "reset unavailable")
		return
	}
	if !ok || storedOTP != otp {
		log.Printf("[correlation=%s] reset-password rejected invalid_otp email=%s", cid, email)
		common.WriteError(w, http.StatusUnauthorized, "invalid otp")
		return
	}
	user, found, err := s.store.GetUser(r.Context(), email)
	if err != nil || !found {
		log.Printf("[correlation=%s] reset-password user missing email=%s found=%t err=%v", cid, email, found, err)
		common.WriteError(w, http.StatusUnauthorized, "account not found")
		return
	}
	user.PasswordHash = hashPassword(password)
	user.Verified = true
	if err := s.store.PutUser(r.Context(), user); err != nil {
		log.Printf("[correlation=%s] reset-password put user failed email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "could not update password")
		return
	}
	_ = s.store.DeleteResetOTP(r.Context(), email)
	s.report(r, "auth.reset-password", "success", email)
	log.Printf("[correlation=%s] reset-password success email=%s", cid, email)
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"message": "Password updated. You can sign in.",
	})
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

func (s *state) logout(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		log.Printf("[correlation=%s] logout rejected reason=missing_authorization", cid)
		common.WriteError(w, http.StatusUnauthorized, "authorization required")
		return
	}

	tokenStr := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	email := ""
	if tokenStr != "" {
		parsed, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if t.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return []byte(s.jwtSecret), nil
		})
		if err == nil && parsed.Valid {
			if sub, ok := parsed.Claims.(jwt.MapClaims)["sub"].(string); ok {
				email = sub
			}
		}
	}

	s.report(r, "auth.logout", "success", email)
	log.Printf("[correlation=%s] logout success email=%s", cid, email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"message": "Logged out"})
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
	if err := s.sendPlainMail(email, "Eduardo OS OTP", "Your code: "+otp+"\r\n"); err != nil {
		log.Printf("auth smtp sendOTP failed email=%s err=%v", email, err)
	}
}

func (s *state) sendResetOTP(email, otp string) {
	body := "Use this code to reset your Eduardo OS password:\r\n\r\n" + otp +
		"\r\n\r\nIf you did not request this, you can ignore this email.\r\n"
	if err := s.sendPlainMail(email, "Eduardo OS password reset", body); err != nil {
		log.Printf("auth smtp sendResetOTP failed email=%s err=%v", email, err)
	}
}

func (s *state) report(r *http.Request, event, status, email string) {
	cid := common.CorrelationFromRequest(r)
	entry := common.NewFlightLog(cid, "authenticator", event, status)
	entry.Metadata = map[string]string{"email": email}
	s.telemetry.Emit(entry, cid)
}

func (s *state) getProfile(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	email := strings.TrimSpace(r.Header.Get("X-User-Email"))
	if email == "" {
		common.WriteError(w, http.StatusBadRequest, "user email required")
		return
	}
	email = authstore.NormalizeEmail(email)
	user, ok, err := s.store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] profile get store error email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "profile lookup failed")
		return
	}
	if !ok {
		common.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"email":           user.Email,
		"profileImageKey": strings.TrimSpace(user.ProfileImageKey),
	})
}

func (s *state) putProfile(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	email := strings.TrimSpace(r.Header.Get("X-User-Email"))
	if email == "" {
		common.WriteError(w, http.StatusBadRequest, "user email required")
		return
	}
	email = authstore.NormalizeEmail(email)
	var body struct {
		ProfileImageKey string `json:"profileImageKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	user, ok, err := s.store.GetUser(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] profile put store error email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "profile update failed")
		return
	}
	if !ok {
		common.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	user.ProfileImageKey = strings.TrimSpace(body.ProfileImageKey)
	if err := s.store.PutUser(r.Context(), user); err != nil {
		log.Printf("[correlation=%s] profile put save error email=%s err=%v", cid, email, err)
		common.WriteError(w, http.StatusInternalServerError, "profile update failed")
		return
	}
	s.report(r, "auth.profile.update", "success", email)
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"email":           user.Email,
		"profileImageKey": user.ProfileImageKey,
	})
}

// notifyContact emails the site owner (SMTP_USER) with a visitor lead from the public chat.
func (s *state) notifyContact(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	var body struct {
		VisitorName  string `json:"visitorName"`
		VisitorEmail string `json:"visitorEmail"`
		VisitorPhone string `json:"visitorPhone"`
		Message      string `json:"message"`
		Channel      string `json:"channel"` // email | whatsapp | chat
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	email := strings.TrimSpace(body.VisitorEmail)
	phone := strings.TrimSpace(body.VisitorPhone)
	name := strings.TrimSpace(body.VisitorName)
	msg := strings.TrimSpace(body.Message)
	channel := strings.TrimSpace(body.Channel)
	if channel == "" {
		channel = "chat"
	}
	if email == "" && phone == "" && msg == "" {
		common.WriteError(w, http.StatusBadRequest, "visitor email, phone, or message required")
		return
	}
	if len(msg) > 4000 {
		msg = msg[:4000]
	}
	to := s.smtpUser
	if to == "" {
		to = "eduardooost@gmail.com"
	}
	subject := "Eduardo OS — nuevo contacto desde el sitio"
	var b strings.Builder
	b.WriteString("Nuevo lead de contacto\r\n\r\n")
	b.WriteString("Canal: " + channel + "\r\n")
	if name != "" {
		b.WriteString("Nombre: " + name + "\r\n")
	}
	if email != "" {
		b.WriteString("Email visitante: " + email + "\r\n")
	}
	if phone != "" {
		b.WriteString("Teléfono: " + phone + "\r\n")
	}
	if msg != "" {
		b.WriteString("\r\nMensaje:\r\n" + msg + "\r\n")
	}
	if err := s.sendPlainMail(to, subject, b.String()); err != nil {
		log.Printf("[correlation=%s] notify-contact smtp err=%v", cid, err)
		common.WriteError(w, http.StatusBadGateway, "email send failed")
		return
	}
	s.report(r, "auth.contact.notify", "success", email)
	common.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "to": to})
}

func (s *state) sendPlainMail(to, subject, body string) error {
	// Gmail app passwords are 16 chars; UI display spaces must not be sent to SMTP.
	pass := strings.ReplaceAll(strings.TrimSpace(s.smtpPass), " ", "")
	if pass == "" {
		log.Printf("SMTP_PASS empty — contact mail to=%s subject=%s\n%s", to, subject, body)
		return nil
	}
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		to, subject, body))
	auth := smtp.PlainAuth("", s.smtpUser, pass, "smtp.gmail.com")
	if err := smtp.SendMail("smtp.gmail.com:587", auth, s.smtpUser, []string{to}, msg); err != nil {
		return fmt.Errorf("smtp send to=%s subject=%q: %w", to, subject, err)
	}
	return nil
}
