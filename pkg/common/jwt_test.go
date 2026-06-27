package common

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestUserEmailFromBearer(t *testing.T) {
	secret := "test-secret"
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user@example.com",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	email, err := UserEmailFromBearer("Bearer "+signed, secret)
	if err != nil {
		t.Fatal(err)
	}
	if email != "user@example.com" {
		t.Fatalf("unexpected email %q", email)
	}
}
