package auth

import (
	"strings"
	"testing"
)

func TestHashPasswordStableAndDistinct(t *testing.T) {
	a := HashPassword("secret-pass")
	b := HashPassword("secret-pass")
	c := HashPassword("other-pass")
	if a != b {
		t.Fatal("same password must hash the same")
	}
	if a == c {
		t.Fatal("different passwords must not collide")
	}
	if !strings.HasPrefix(a, "sha256:") {
		t.Fatalf("unexpected prefix %q", a)
	}
	if !CheckPassword("secret-pass", a) {
		t.Fatal("CheckPassword should accept matching hash")
	}
	if CheckPassword("wrong", a) {
		t.Fatal("CheckPassword should reject mismatch")
	}
}

func TestGenerateOTPIsSixDigits(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		otp := GenerateOTP()
		if len(otp) != 6 {
			t.Fatalf("len=%d otp=%q", len(otp), otp)
		}
		for _, r := range otp {
			if r < '0' || r > '9' {
				t.Fatalf("non-digit in %q", otp)
			}
		}
		seen[otp] = true
	}
	if len(seen) < 2 {
		t.Fatalf("expected some variation, got %v", seen)
	}
}
