package common

import (
	"fmt"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// UserEmailFromBearer extracts the JWT subject (email) from an Authorization header.
func UserEmailFromBearer(authHeader, secret string) (string, error) {
	if secret == "" {
		return "", fmt.Errorf("jwt secret not configured")
	}
	tokenStr := strings.TrimSpace(authHeader)
	if strings.HasPrefix(strings.ToLower(tokenStr), "bearer ") {
		tokenStr = strings.TrimSpace(tokenStr[7:])
	}
	if tokenStr == "" {
		return "", fmt.Errorf("authorization required")
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return "", fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	sub = strings.TrimSpace(sub)
	if sub == "" {
		return "", fmt.Errorf("missing subject")
	}
	return sub, nil
}
