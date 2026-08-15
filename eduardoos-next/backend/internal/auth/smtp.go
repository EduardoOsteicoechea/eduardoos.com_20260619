package auth

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
)

// normalizeSMTPPass prepares an SMTP password for Gmail (and similar providers).
// Gmail app passwords are 16 characters; Google's UI often inserts spaces for
// display — those spaces must not be sent to smtp.gmail.com or auth fails.
// Leading/trailing whitespace from .env / EnvironmentFile loading is also trimmed.
func normalizeSMTPPass(pass string) string {
	return strings.ReplaceAll(strings.TrimSpace(pass), " ", "")
}

// sendPlainMail delivers a UTF-8 text email via Gmail SMTP when SMTP_PASS is set.
// When SMTP_PASS is empty (typical local/dev), it logs the message and returns nil
// so register / forgot-password never crash without credentials — matching production
// authenticator sendPlainMail behavior in internal/svc/authenticator/server.go.
//
// Real SMTP failures are returned (and should be logged by callers). OTP contents
// are only written to process logs when the empty-pass / log-only path is taken —
// never included in HTTP error bodies.
func (h *Handler) sendPlainMail(to, subject, body string) error {
	pass := ""
	if h != nil {
		pass = normalizeSMTPPass(h.SMTPPass)
	}
	if pass == "" {
		log.Printf("SMTP_PASS empty - mail to=%s subject=%s\n%s", to, subject, body)
		return nil
	}
	user := ""
	if h != nil {
		user = strings.TrimSpace(h.SMTPUser)
	}
	if user == "" {
		user = "eduardooost@gmail.com"
	}
	msg := []byte(fmt.Sprintf(
		"To: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		to, subject, body,
	))
	auth := smtp.PlainAuth("", user, pass, "smtp.gmail.com")
	if err := smtp.SendMail("smtp.gmail.com:587", auth, user, []string{to}, msg); err != nil {
		return fmt.Errorf("smtp send to=%s subject=%q: %w", to, subject, err)
	}
	return nil
}

// sendOTP emails the registration verification code (or logs it when SMTP_PASS is empty).
// SMTP errors are logged with enough detail for operators; they are not returned to
// HTTP clients (account creation already succeeded and OTP is stored).
func (h *Handler) sendOTP(email, otp string) {
	if err := h.sendPlainMail(email, "Eduardo OS OTP", "Your code: "+otp+"\r\n"); err != nil {
		log.Printf("auth smtp sendOTP failed email=%s err=%v", email, err)
	} else if normalizeSMTPPass(h.SMTPPass) != "" {
		log.Printf("auth smtp sendOTP ok email=%s", email)
	}
}

// sendResetOTP emails the password-reset code (or logs it when SMTP_PASS is empty).
// Same logging rules as sendOTP: failures are operator-visible in journalctl, never
// leaked as OTP in API responses.
func (h *Handler) sendResetOTP(email, otp string) {
	body := "Use this code to reset your Eduardo OS password:\r\n\r\n" + otp +
		"\r\n\r\nIf you did not request this, you can ignore this email.\r\n"
	if err := h.sendPlainMail(email, "Eduardo OS password reset", body); err != nil {
		log.Printf("auth smtp sendResetOTP failed email=%s err=%v", email, err)
	} else if normalizeSMTPPass(h.SMTPPass) != "" {
		log.Printf("auth smtp sendResetOTP ok email=%s", email)
	}
}
