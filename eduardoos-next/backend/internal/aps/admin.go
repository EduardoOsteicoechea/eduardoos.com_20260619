package aps

import (
	"strings"
)

// AdminEmail is the sole allowlisted APS admin (production parity).
const AdminEmail = "eduardooost@gmail.com"

// IsAdminEmail reports whether email matches the APS admin allowlist.
func IsAdminEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), AdminEmail)
}
