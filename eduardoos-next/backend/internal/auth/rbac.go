package auth

import (
	"strings"
	"time"
)

// Role constants for RBAC.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// AdminEmail is the bootstrap platform admin (APS + user dashboard).
const AdminEmail = "eduardooost@gmail.com"

// IsAdminEmail reports whether email is the hard-coded platform admin.
func IsAdminEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), AdminEmail)
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
