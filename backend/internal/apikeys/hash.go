package apikeys

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

// SecretPrefix is the stable recognition prefix for Eduardo OS live API keys (spec 055).
const SecretPrefix = "eos_live_"

// GenerateSecret creates a high-entropy opaque key: eos_live_<64 hex chars>.
func GenerateSecret() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("rand: %w", err)
	}
	return SecretPrefix + hex.EncodeToString(raw), nil
}

// HashSecret returns the SHA-256 hex digest used for at-rest storage and lookup.
func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(secret)))
	return hex.EncodeToString(sum[:])
}

// DisplayPrefix returns a short non-secret label for UI lists (first 12 chars + ellipsis).
func DisplayPrefix(secret string) string {
	secret = strings.TrimSpace(secret)
	if len(secret) <= 12 {
		return secret + "…"
	}
	return secret[:12] + "…"
}

// LooksLikeAPIKey reports whether a Bearer token is shaped like an API key (not a JWT).
func LooksLikeAPIKey(token string) bool {
	token = strings.TrimSpace(token)
	return strings.HasPrefix(token, SecretPrefix) && len(token) > len(SecretPrefix)+16
}
