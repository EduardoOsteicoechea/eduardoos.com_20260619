package auth

import "testing"

func TestProfileImageObjectKey(t *testing.T) {
	got := ProfileImageObjectKey("User@Example.COM", "photo.JPG")
	want := "media/profiles/user@example.com/photo.JPG"
	if got != want {
		t.Fatalf("object key=%q want %q", got, want)
	}
}

func TestProfileImageFilenameFromUpload(t *testing.T) {
	if got := ProfileImageFilenameFromUpload("face.JPEG"); got != "avatar.jpeg" {
		t.Fatalf("filename=%q", got)
	}
	if got := ProfileImageFilenameFromUpload("noext"); got != "avatar.png" {
		t.Fatalf("default ext=%q", got)
	}
}

func TestNormalizeAndURLFromKey(t *testing.T) {
	if got := NormalizeProfileImageObjectKey("profiles/a@b.com/avatar.png"); got != "media/profiles/a@b.com/avatar.png" {
		t.Fatalf("normalize profiles-only=%q", got)
	}
	// Go url.PathEscape leaves "@" unescaped (RFC 3986 path); matches production gateway.
	url := ProfileImageURLFromKey("media/profiles/user@example.com/avatar.png")
	want := "/api/media/file/profiles/user@example.com/avatar.png"
	if url != want {
		t.Fatalf("url=%q want %q", url, want)
	}
	if ProfileImageURLFromKey("") != "" {
		t.Fatal("empty key must yield empty url")
	}
}
