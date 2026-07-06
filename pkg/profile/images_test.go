package profile

import "testing"

func TestImageObjectKey(t *testing.T) {
	key := ImageObjectKey("User@Example.com", "avatar.png")
	want := "media/profiles/user@example.com/avatar.png"
	if key != want {
		t.Fatalf("got %q want %q", key, want)
	}
}

func TestNormalizeImageObjectKey(t *testing.T) {
	got := NormalizeImageObjectKey("profiles/user@example.com/avatar.png")
	want := "media/profiles/user@example.com/avatar.png"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestGatewayMediaFilePath(t *testing.T) {
	path := GatewayMediaFilePath("media/profiles/user@example.com/avatar.png")
	if path == "" || path[0] != '/' {
		t.Fatalf("expected absolute path, got %q", path)
	}
	if path != "/api/media/file/profiles/user@example.com/avatar.png" &&
		path != "/api/media/file/profiles/user%40example.com/avatar.png" {
		t.Fatalf("unexpected path %q", path)
	}
}
