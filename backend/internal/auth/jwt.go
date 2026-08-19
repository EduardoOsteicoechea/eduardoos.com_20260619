package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// IssueJWT creates an HS256 token with claim sub=<email>, role (admin|user),
// and 24h expiry. Bootstrap AdminEmail always resolves to role admin.
// Secret comes from JWT_SECRET (passed in by the caller / Handler).
func IssueJWT(email, secret string) (string, error) {
	return IssueJWTWithRole(email, RoleUser, secret)
}

// IssueJWTWithRole issues a JWT whose role claim is ResolveRole(email, storedRole).
// Prefer this at login/verify so stored RBAC admin is reflected in the token.
func IssueJWTWithRole(email, storedRole, secret string) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return "", errors.New("jwt secret required")
	}
	claims := jwt.MapClaims{
		"sub":  NormalizeEmail(email),
		"role": ResolveRole(email, storedRole),
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// EmailFromBearer extracts the email subject from an Authorization Bearer token.
func EmailFromBearer(authHeader, secret string) (string, error) {
	const prefix = "Bearer "
	if !strings.HasPrefix(authHeader, prefix) {
		return "", errors.New("missing bearer token")
	}
	tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, prefix))
	if tokenStr == "" {
		return "", errors.New("empty bearer token")
	}
	parsed, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !parsed.Valid {
		return "", errors.New("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	if strings.TrimSpace(sub) == "" {
		return "", errors.New("missing subject")
	}
	return NormalizeEmail(sub), nil
}
