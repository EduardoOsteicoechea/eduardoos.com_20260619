package auth

import (
	"fmt"
	"log"
	"net/smtp"
	"strings"
)

// sendPlainMail delivers a UTF-8 text email via Gmail SMTP when SMTP_PASS is set.
// When SMTP_PASS is empty (typical local/dev), it logs the message and returns nil
// so register / forgot-password never crash without credentials — matching production
// authenticator sendPlainMail behavior in internal/svc/authenticator/server.go.
func (h *Handler) sendPlainMail(to, subject, body string) error {
	if h == nil || strings.TrimSpace(h.SMTPPass) == "" {
		log.Printf("SMTP_PASS empty - mail to=%s subject=%s\n%s", to, subject, body)
		return nil
	}
	user := h.SMTPUser
	if user == "" {
		user = "eduardooost@gmail.com"
	}
	msg := []byte(fmt.Sprintf(
		"To: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		to, subject, body,
	))
	auth := smtp.PlainAuth("", user, h.SMTPPass, "smtp.gmail.com")
	return smtp.SendMail("smtp.gmail.com:587", auth, user, []string{to}, msg)
}

// sendOTP emails the registration verification code (or logs it when SMTP_PASS is empty).
func (h *Handler) sendOTP(email, otp string) {
	_ = h.sendPlainMail(email, "Eduardo OS OTP", "Your code: "+otp+"\r\n")
}

// sendResetOTP emails the password-reset code (or logs it when SMTP_PASS is empty).
func (h *Handler) sendResetOTP(email, otp string) {
	body := "Use this code to reset your Eduardo OS password:\r\n\r\n" + otp +
		"\r\n\r\nIf you did not request this, you can ignore this email.\r\n"
	_ = h.sendPlainMail(email, "Eduardo OS password reset", body)
}
