package auth

import (
	"context"
	"log"
	"strings"
)

// RegisterAccountInput is one unverified account to create (public register or
// admin bulk). Password is never logged — callers must not print it either.
type RegisterAccountInput struct {
	Email    string
	Password string
	Name     string
	// EnforceSpamFilter applies IsSpammyLocalPart (public register only).
	// Admin bulk skips it so operators can seed intentional accounts.
	EnforceSpamFilter bool
}

// RegisterAccountOutcome describes one create + OTP-mail attempt.
// Reason is empty when OK is true. Password is never included.
type RegisterAccountOutcome struct {
	Email string
	Name  string
	OK    bool
	Reason string
}

// RegisterUnverifiedAccount mirrors the public /api/auth/register persistence
// path: hash password, PutUser (Verified=false), PutOTP, sendOTP via SMTP.
// Bot-check is intentionally omitted (admin bulk and internal callers).
//
// On mail failure the account + OTP may already exist (same as Register HTTP).
// Never logs plaintext passwords or OTP codes (only lengths / email).
func (h *Handler) RegisterUnverifiedAccount(ctx context.Context, cid string, in RegisterAccountInput) RegisterAccountOutcome {
	name := strings.TrimSpace(in.Name)
	email := NormalizeEmail(in.Email)
	out := RegisterAccountOutcome{Email: email, Name: name}

	if email == "" || !strings.Contains(email, "@") {
		out.Reason = "invalid email"
		return out
	}
	if len(in.Password) < minPasswordLen {
		out.Reason = "password too short"
		return out
	}
	if in.EnforceSpamFilter && IsSpammyLocalPart(email) {
		out.Reason = "email not accepted"
		return out
	}
	if h == nil || h.Store == nil {
		out.Reason = "store not configured"
		return out
	}

	log.Printf("[correlation=%s] auth.register_account lookup email=%s", cid, email)
	if _, exists, err := h.Store.GetUser(ctx, email); err != nil {
		log.Printf("[correlation=%s] auth.register_account store_error err=%v", cid, err)
		out.Reason = "store error"
		return out
	} else if exists {
		out.Reason = "account already exists"
		return out
	}

	otp := GenerateOTP()
	user := User{
		Email:        email,
		PasswordHash: HashPassword(in.Password),
		Verified:     false,
		Name:         name,
		Role:         ResolveRole(email, RoleUser),
		CreatedAt:    NowRFC3339(),
	}
	if err := h.Store.PutUser(ctx, user); err != nil {
		log.Printf("[correlation=%s] auth.register_account put_user_failed err=%v", cid, err)
		out.Reason = "could not create account"
		return out
	}
	log.Printf("[correlation=%s] auth.register_account user_created email=%s name_set=%t", cid, email, name != "")

	if err := h.Store.PutOTP(ctx, email, otp); err != nil {
		log.Printf("[correlation=%s] auth.register_account put_otp_failed err=%v", cid, err)
		out.Reason = "could not store otp"
		return out
	}
	log.Printf("[correlation=%s] auth.register_account otp_stored otp_len=%d — delivering mail", cid, len(otp))

	if err := h.sendOTPTraced(cid, email, otp); err != nil {
		log.Printf("[correlation=%s] auth.register_account mail_failed err=%v", cid, err)
		out.Reason = "could not send verification email"
		return out
	}

	log.Printf("[correlation=%s] auth.register_account done email=%s", cid, email)
	out.OK = true
	return out
}
