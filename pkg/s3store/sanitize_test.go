package s3store

import (
	"bytes"
	"testing"
)

func pngBytes() []byte {
	return []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01}
}

func TestSanitizeAssetRejectsEmpty(t *testing.T) {
	_, err := SanitizeAsset("photo.png", nil)
	if err != ErrEmptyAsset {
		t.Fatalf("expected ErrEmptyAsset, got %v", err)
	}
}

func TestSanitizeAssetRejectsBadExtension(t *testing.T) {
	_, err := SanitizeAsset("virus.exe", pngBytes())
	if err == nil {
		t.Fatal("expected error for .exe")
	}
}

func TestSanitizeAssetRejectsContentMismatch(t *testing.T) {
	_, err := SanitizeAsset("photo.png", []byte("not-a-png"))
	if err != ErrContentMismatch {
		t.Fatalf("expected ErrContentMismatch, got %v", err)
	}
}

func TestSanitizeAssetAcceptsPNG(t *testing.T) {
	ct, err := SanitizeAsset("photo.png", pngBytes())
	if err != nil || ct != "image/png" {
		t.Fatalf("unexpected: ct=%s err=%v", ct, err)
	}
}

func TestSanitizeAssetAcceptsJPEG(t *testing.T) {
	data := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}
	ct, err := SanitizeAsset("photo.jpeg", data)
	if err != nil || ct != "image/jpeg" {
		t.Fatalf("unexpected: ct=%s err=%v", ct, err)
	}
}

func TestSanitizeAssetAcceptsPDF(t *testing.T) {
	ct, err := SanitizeAsset("doc.pdf", []byte("%PDF-1.4"))
	if err != nil || ct != "application/pdf" {
		t.Fatalf("unexpected: ct=%s err=%v", ct, err)
	}
}

func TestSanitizeAssetAcceptsDocx(t *testing.T) {
	data := append([]byte{0x50, 0x4B, 0x03, 0x04}, []byte("word/document.xml")...)
	ct, err := SanitizeAsset("file.docx", data)
	if err != nil || ct == "" {
		t.Fatalf("unexpected: ct=%s err=%v", ct, err)
	}
}

func TestSanitizeFilenameRejectsTraversal(t *testing.T) {
	_, err := SanitizeFilename("../secret.png")
	if err != ErrInvalidFilename {
		t.Fatalf("expected ErrInvalidFilename, got %v", err)
	}
}

func TestPrepareUpload(t *testing.T) {
	key, ct, err := PrepareUpload("test.png", pngBytes())
	if err != nil || key != "test.png" || ct != "image/png" {
		t.Fatalf("key=%s ct=%s err=%v", key, ct, err)
	}
}

func TestContentMatchesExtGIF(t *testing.T) {
	if !contentMatchesExt([]byte("GIF89a"), ".gif") {
		t.Fatal("expected gif match")
	}
	if contentMatchesExt(bytes.Repeat([]byte("x"), 20), ".gif") {
		t.Fatal("expected gif mismatch")
	}
}
