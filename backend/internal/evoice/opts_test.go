package evoice

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeModeAndPercent(t *testing.T) {
	if got := NormalizeMode("", false); got != ModeStandard {
		t.Fatalf("empty=%s", got)
	}
	if got := NormalizeMode("", true); got != ModePremium {
		t.Fatalf("legacy premium=%s", got)
	}
	if got := NormalizeMode("super_premium", false); got != ModeSuperPremium {
		t.Fatalf("super=%s", got)
	}
	if got := NormalizeContentPercent(50); got != 50 {
		t.Fatalf("50=%d", got)
	}
	if got := NormalizeContentPercent(33); got != 100 {
		t.Fatalf("bad=%d", got)
	}
	o := GenerateOpts{Mode: ModeStandard, ContentPercent: 25}
	if !o.UsesDeepSeek() {
		t.Fatal("standard+25 should use DeepSeek")
	}
	o100 := GenerateOpts{Mode: ModeStandard, ContentPercent: 100}
	if o100.UsesDeepSeek() {
		t.Fatal("standard+100 should not use DeepSeek")
	}
}

func TestNextAudioVersion(t *testing.T) {
	dir := t.TempDir()
	if n := NextAudioVersion(dir, "book"); n != 1 {
		t.Fatalf("empty=%d", n)
	}
	mustWrite := func(name string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite("book.v2.c01-x.mp3")
	mustWrite("book.v1.mp3")
	mustWrite("book.mp3") // legacy ignored for max
	if n := NextAudioVersion(dir, "book"); n != 3 {
		t.Fatalf("next=%d want 3", n)
	}
}
