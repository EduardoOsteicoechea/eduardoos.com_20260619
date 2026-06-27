package authstore

import (
	"context"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail("  User@Example.COM "); got != "user@example.com" {
		t.Fatalf("NormalizeEmail() = %q", got)
	}
}

func TestMemoryStoreRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := New("", "secret")
	user := User{Email: "user@example.com", PasswordHash: "sha256:abc", Verified: true}
	if err := store.PutUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	got, ok, err := store.GetUser(ctx, "USER@example.com")
	if err != nil || !ok {
		t.Fatalf("GetUser: ok=%v err=%v", ok, err)
	}
	if got.PasswordHash != user.PasswordHash || !got.Verified {
		t.Fatalf("unexpected user %+v", got)
	}
	if err := store.PutOTP(ctx, user.Email, "123456"); err != nil {
		t.Fatal(err)
	}
	otp, ok, err := store.GetOTP(ctx, user.Email)
	if err != nil || !ok || otp != "123456" {
		t.Fatalf("GetOTP: otp=%q ok=%v err=%v", otp, ok, err)
	}
	if err := store.DeleteOTP(ctx, user.Email); err != nil {
		t.Fatal(err)
	}
	_, ok, err = store.GetOTP(ctx, user.Email)
	if err != nil || ok {
		t.Fatalf("expected otp deleted, ok=%v err=%v", ok, err)
	}
}
