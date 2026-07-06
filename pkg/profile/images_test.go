package profile

import "testing"

func TestImageObjectKey(t *testing.T) {
	key := ImageObjectKey("User@Example.com", "avatar.png")
	want := "profiles/user@example.com/avatar.png"
	if key != want {
		t.Fatalf("got %q want %q", key, want)
	}
}

func TestGatewayMediaFilePath(t *testing.T) {
	path := GatewayMediaFilePath("profiles/user@example.com/avatar.png")
	if path == "" || path[0] != '/' {
		t.Fatalf("expected absolute path, got %q", path)
	}
}
