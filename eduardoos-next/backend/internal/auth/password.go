package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// HashPassword returns the production-compatible password digest.
// Format is exactly "sha256:" + lowercase hex of SHA-256(password bytes).
// Existing users in eduardoos_users were stored this way; Next must match.
func HashPassword(password string) string {
	sum := sha256.Sum256([]byte(password))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// CheckPassword compares a plaintext password to a stored hash using the
// same HashPassword scheme. Timing is not constant-time here because the
// production authenticator also used a simple string compare for this format.
func CheckPassword(password, storedHash string) bool {
	if storedHash == "" {
		return false
	}
	return HashPassword(password) == storedHash
}

// NormalizeEmail trims and lowercases email so store keys stay unique.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
