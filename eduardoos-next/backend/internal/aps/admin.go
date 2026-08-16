package aps

import "eduardoos.nex/internal/auth"

// AdminEmail is the sole allowlisted APS admin (production parity).
const AdminEmail = auth.AdminEmail

// IsAdminEmail reports whether email matches the APS admin allowlist.
func IsAdminEmail(email string) bool {
	return auth.IsAdminEmail(email)
}
