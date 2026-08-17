package auth

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
	"unicode"
)

// NormalizeSMTPPassForLog exposes normalizeSMTPPass for startup diagnostics
// (length / set checks only — never log the returned value in production logs
// beyond its length).
func NormalizeSMTPPassForLog(pass string) string {
	return normalizeSMTPPass(pass)
}

// normalizeSMTPPass prepares an SMTP password for Gmail (and similar providers).
// Gmail app passwords are 16 characters; Google's UI often inserts spaces for
// display — those spaces must not be sent to smtp.gmail.com or auth fails.
// Also strips every Unicode whitespace (NBSP / thin space from rich-text paste)
// and surrounding ASCII quotes if an operator pasted the secret with quotes.
func normalizeSMTPPass(pass string) string {
	pass = strings.TrimSpace(pass)
	pass = strings.Trim(pass, `"'`)
	var b strings.Builder
	b.Grow(len(pass))
	for _, r := range pass {
		if unicode.IsSpace(r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// smtpStep logs one operator-visible step of an outbound mail attempt.
// Never include OTP codes, message bodies, or the SMTP password.
func smtpStep(correlationID, phase, detail string) {
	if correlationID == "" {
		correlationID = "-"
	}
	log.Printf("[correlation=%s] auth.smtp step=%s %s", correlationID, phase, detail)
}

// SendOwnerMail delivers a plain-text message to the site owner (SMTP_USER,
// defaulting to eduardooost@gmail.com). Used by the public contact agent when
// the LLM emits a CONTACT_EMAIL handoff. Empty SMTP_PASS logs locally and
// returns nil (same as OTP delivery).
func (h *Handler) SendOwnerMail(correlationID, subject, body string) error {
	to := ""
	if h != nil {
		to = strings.TrimSpace(h.SMTPUser)
	}
	if to == "" {
		to = "eduardooost@gmail.com"
	}
	return h.sendPlainMailTraced(correlationID, to, subject, body)
}

// sendPlainMail delivers a UTF-8 text email via Gmail SMTP when SMTP_PASS is set.
// When SMTP_PASS is empty (typical local/dev), it logs that delivery was skipped
// (not the body) and returns nil so register / forgot-password never crash.
//
// Delivery uses an explicit SMTP dialogue (Dial → Hello → Auth → Mail → Rcpt →
// Data → Quit) so journalctl shows which step failed (e.g. Gmail 535 on Auth).
// OTP / body contents are never written to logs on the real-SMTP path.
func (h *Handler) sendPlainMail(to, subject, body string) error {
	return h.sendPlainMailTraced("", to, subject, body)
}

// sendPlainMailTraced is sendPlainMail with an optional correlation id for step logs.
func (h *Handler) sendPlainMailTraced(correlationID, to, subject, body string) error {
	started := time.Now()
	to = strings.TrimSpace(to)
	subject = strings.TrimSpace(subject)

	pass := ""
	if h != nil {
		pass = normalizeSMTPPass(h.SMTPPass)
	}
	rawLen := 0
	if h != nil {
		rawLen = len(h.SMTPPass)
	}

	smtpStep(correlationID, "begin", fmt.Sprintf(
		"to=%s subject=%q pass_set=%t pass_raw_len=%d pass_norm_len=%d",
		to, subject, pass != "", rawLen, len(pass),
	))

	if pass == "" {
		smtpStep(correlationID, "skip_empty_pass",
			"SMTP_PASS empty after normalize — not contacting Gmail (dev/log-only path)")
		// Body only on empty-pass path so local operators can copy OTP from journal.
		log.Printf("[correlation=%s] auth.smtp skip_empty_pass body follows for local OTP\n%s",
			correlationID, body)
		return nil
	}

	user := ""
	if h != nil {
		user = strings.TrimSpace(h.SMTPUser)
	}
	if user == "" {
		user = "eduardooost@gmail.com"
		smtpStep(correlationID, "smtp_user_default", "SMTP_USER empty — using built-in default From/auth user")
	} else {
		smtpStep(correlationID, "smtp_user", fmt.Sprintf("from_and_auth_user=%s", user))
	}

	const (
		host = "smtp.gmail.com"
		addr = "smtp.gmail.com:587"
	)

	smtpStep(correlationID, "dial", fmt.Sprintf("connecting tcp %s", addr))
	client, err := smtp.Dial(addr)
	if err != nil {
		smtpStep(correlationID, "dial_failed", err.Error())
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	defer func() {
		_ = client.Close()
	}()
	smtpStep(correlationID, "dial_ok", "tcp connected")

	smtpStep(correlationID, "hello", fmt.Sprintf("EHLO/HELO as %s", host))
	if err := client.Hello(host); err != nil {
		smtpStep(correlationID, "hello_failed", err.Error())
		return fmt.Errorf("smtp hello: %w", err)
	}
	smtpStep(correlationID, "hello_ok", "server greeting accepted")

	smtpStep(correlationID, "starttls", "upgrading to TLS if offered")
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
		if err := client.StartTLS(tlsConfig); err != nil {
			smtpStep(correlationID, "starttls_failed", err.Error())
			return fmt.Errorf("smtp starttls: %w", err)
		}
		smtpStep(correlationID, "starttls_ok", "TLS negotiated")
	} else {
		smtpStep(correlationID, "starttls_skip", "server did not advertise STARTTLS")
	}

	smtpStep(correlationID, "auth", fmt.Sprintf("PLAIN auth as user=%s pass_norm_len=%d", user, len(pass)))
	auth := smtp.PlainAuth("", user, pass, host)
	if err := client.Auth(auth); err != nil {
		smtpStep(correlationID, "auth_failed", err.Error())
		return fmt.Errorf("smtp auth user=%s: %w", user, err)
	}
	smtpStep(correlationID, "auth_ok", "credentials accepted")

	smtpStep(correlationID, "mail_from", fmt.Sprintf("MAIL FROM:<%s>", user))
	if err := client.Mail(user); err != nil {
		smtpStep(correlationID, "mail_from_failed", err.Error())
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	smtpStep(correlationID, "mail_from_ok", "sender accepted")

	smtpStep(correlationID, "rcpt_to", fmt.Sprintf("RCPT TO:<%s>", to))
	if err := client.Rcpt(to); err != nil {
		smtpStep(correlationID, "rcpt_to_failed", err.Error())
		return fmt.Errorf("smtp RCPT TO=%s: %w", to, err)
	}
	smtpStep(correlationID, "rcpt_to_ok", "recipient accepted")

	smtpStep(correlationID, "data", fmt.Sprintf("writing message bytes=%d", len(body)+len(subject)+64))
	wc, err := client.Data()
	if err != nil {
		smtpStep(correlationID, "data_open_failed", err.Error())
		return fmt.Errorf("smtp DATA: %w", err)
	}
	msg := []byte(fmt.Sprintf(
		"To: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		to, subject, body,
	))
	if _, err := wc.Write(msg); err != nil {
		_ = wc.Close()
		smtpStep(correlationID, "data_write_failed", err.Error())
		return fmt.Errorf("smtp DATA write: %w", err)
	}
	if err := wc.Close(); err != nil {
		smtpStep(correlationID, "data_close_failed", err.Error())
		return fmt.Errorf("smtp DATA close: %w", err)
	}
	smtpStep(correlationID, "data_ok", "message accepted by server")

	smtpStep(correlationID, "quit", "closing SMTP session")
	if err := client.Quit(); err != nil {
		// Quit errors are non-fatal if DATA already succeeded; still log them.
		smtpStep(correlationID, "quit_warn", err.Error())
	} else {
		smtpStep(correlationID, "quit_ok", "session closed")
	}

	smtpStep(correlationID, "done", fmt.Sprintf(
		"ok to=%s subject=%q elapsed_ms=%d",
		to, subject, time.Since(started).Milliseconds(),
	))
	return nil
}

// sendOTP emails the registration verification code (or logs it when SMTP_PASS is empty).
// When real SMTP is configured, delivery errors are returned so Register can tell the
// client the mail failed (OTP remains stored for a later retry / operator fix).
func (h *Handler) sendOTP(email, otp string) error {
	return h.sendOTPTraced("", email, otp)
}

func (h *Handler) sendOTPTraced(correlationID, email, otp string) error {
	smtpStep(correlationID, "sendOTP_start", fmt.Sprintf("email=%s otp_len=%d", email, len(strings.TrimSpace(otp))))
	if err := h.sendPlainMailTraced(correlationID, email, "Eduardo OS OTP", "Your code: "+otp+"\r\n"); err != nil {
		smtpStep(correlationID, "sendOTP_failed", err.Error())
		log.Printf("[correlation=%s] auth smtp sendOTP failed email=%s err=%v", correlationID, email, err)
		return err
	}
	if normalizeSMTPPass(h.SMTPPass) != "" {
		smtpStep(correlationID, "sendOTP_ok", fmt.Sprintf("email=%s", email))
	}
	return nil
}

// sendResetOTP emails the password-reset code (or logs it when SMTP_PASS is empty).
// Delivery errors are returned for operator/handler use; ForgotPassword keeps a
// generic HTTP body (no account enumeration) but still logs the failure.
func (h *Handler) sendResetOTP(email, otp string) error {
	return h.sendResetOTPTraced("", email, otp)
}

func (h *Handler) sendResetOTPTraced(correlationID, email, otp string) error {
	smtpStep(correlationID, "sendResetOTP_start", fmt.Sprintf("email=%s otp_len=%d", email, len(strings.TrimSpace(otp))))
	body := "Use this code to reset your Eduardo OS password:\r\n\r\n" + otp +
		"\r\n\r\nIf you did not request this, you can ignore this email.\r\n"
	if err := h.sendPlainMailTraced(correlationID, email, "Eduardo OS password reset", body); err != nil {
		smtpStep(correlationID, "sendResetOTP_failed", err.Error())
		log.Printf("[correlation=%s] auth smtp sendResetOTP failed email=%s err=%v", correlationID, email, err)
		return err
	}
	if normalizeSMTPPass(h.SMTPPass) != "" {
		smtpStep(correlationID, "sendResetOTP_ok", fmt.Sprintf("email=%s", email))
	}
	return nil
}
