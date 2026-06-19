// Package common holds shared gateway and microservice primitives.
package common

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const InternalTokenHeader = "x-internal-token"

// SignInternalToken builds a short-lived HMAC token: timestamp:correlationId:signature.
func SignInternalToken(secret, correlationID string) string {
	ts := time.Now().Unix()
	payload := fmt.Sprintf("%d:%s", ts, correlationID)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return fmt.Sprintf("%s:%s", payload, hex.EncodeToString(mac.Sum(nil)))
}

// VerifyInternalToken checks the 60-second window and HMAC signature.
func VerifyInternalToken(secret, token string) bool {
	parts := strings.Split(token, ":")
	if len(parts) != 3 {
		return false
	}
	ts, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}
	if time.Now().Unix()-ts > 60 {
		return false
	}
	payload := parts[0] + ":" + parts[1]
	sig, err := hex.DecodeString(parts[2])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return hmac.Equal(sig, mac.Sum(nil))
}
