package auth

import (
	"strings"
	"time"
	"unicode/utf8"
)

// Role constants for RBAC.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// AdminEmail is the bootstrap platform admin (APS + user dashboard).
// Do not weaken this allowlist.
const AdminEmail = "eduardooost@gmail.com"

// MaxLocalPartDots is the registration spam threshold for dotted local-parts
// (e.g. b.ero.h.iy.ed.o6.2.0@gmail.com). More than this many dots is rejected.
const MaxLocalPartDots = 3

// IsAdminEmail reports whether email is the hard-coded platform admin.
func IsAdminEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), AdminEmail)
}

// IsSpammyLocalPart reports emails whose local-part looks like bot/spam
// (excessive dots — common Gmail plus-style evasion).
func IsSpammyLocalPart(email string) bool {
	email = strings.TrimSpace(email)
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return false
	}
	local := email[:at]
	dots := strings.Count(local, ".")
	if dots > MaxLocalPartDots {
		return true
	}
	// Also reject pathological local-parts (noise / abuse).
	if utf8.RuneCountInString(local) > 64 {
		return true
	}
	return false
}

// NormalizeRole returns admin|user (defaults to user).
func NormalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case RoleAdmin:
		return RoleAdmin
	default:
		return RoleUser
	}
}

// ResolveRole prefers stored admin, then bootstrap admin email, else user.
func ResolveRole(email, storedRole string) string {
	if IsAdminEmail(email) {
		return RoleAdmin
	}
	return NormalizeRole(storedRole)
}

// IsAdmin reports platform admin (email allowlist or stored role).
func IsAdmin(email, storedRole string) bool {
	return ResolveRole(email, storedRole) == RoleAdmin
}

// NowRFC3339 is a shared UTC timestamp helper for CreatedAt fields.
func NowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
