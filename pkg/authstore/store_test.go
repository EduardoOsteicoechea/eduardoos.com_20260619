package authstore

import (
	"context"
	"testing"
)

func TestMemoryResetOTPDoesNotCollideWithRegisterOTP(t *testing.T) {
	store := New("", "")
	ctx := context.Background()
	email := "User@Example.com"

	if err := store.PutOTP(ctx, email, "111111"); err != nil {
		t.Fatal(err)
	}
	if err := store.PutResetOTP(ctx, email, "222222"); err != nil {
		t.Fatal(err)
	}

	reg, ok, err := store.GetOTP(ctx, email)
	if err != nil || !ok || reg != "111111" {
		t.Fatalf("register otp got %q ok=%v err=%v", reg, ok, err)
	}
	reset, ok, err := store.GetResetOTP(ctx, email)
	if err != nil || !ok || reset != "222222" {
		t.Fatalf("reset otp got %q ok=%v err=%v", reset, ok, err)
	}

	if err := store.DeleteResetOTP(ctx, email); err != nil {
		t.Fatal(err)
	}
	_, ok, err = store.GetResetOTP(ctx, "user@example.com")
	if err != nil || ok {
		t.Fatalf("expected reset otp gone ok=%v err=%v", ok, err)
	}
	reg, ok, err = store.GetOTP(ctx, email)
	if err != nil || !ok || reg != "111111" {
		t.Fatalf("register otp should remain got %q ok=%v err=%v", reg, ok, err)
	}
}

func TestNormalizeEmail(t *testing.T) {
	got := NormalizeEmail("  Foo@Bar.COM ")
	if got != "foo@bar.com" {
		t.Fatalf("got %q", got)
	}
}
