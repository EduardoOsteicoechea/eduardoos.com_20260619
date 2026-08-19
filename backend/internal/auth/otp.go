package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"time"
)

// GenerateOTP returns a six-digit numeric one-time password, zero-padded.
// On crypto/rand failure it falls back to a time-based modulus so callers
// still receive a usable code during local/dev edge cases.
func GenerateOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	}
	return fmt.Sprintf("%06d", n.Int64())
}
