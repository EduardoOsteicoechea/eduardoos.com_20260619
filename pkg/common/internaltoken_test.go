package common

import "testing"

func TestSignAndVerifyRoundtrip(t *testing.T) {
	secret := "test-internal-secret-key-32chars!"
	token := SignInternalToken(secret, "corr-abc")
	if !VerifyInternalToken(secret, token) {
		t.Fatal("expected valid token")
	}
}

func TestRejectWrongSecret(t *testing.T) {
	token := SignInternalToken("secret-a", "corr-1")
	if VerifyInternalToken("secret-b", token) {
		t.Fatal("expected invalid token")
	}
}
