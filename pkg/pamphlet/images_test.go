package pamphlet

import "testing"

func TestContentImageObjectKey(t *testing.T) {
	key := ContentImageObjectKey("user@example.com", "active", "0-subidea-7.png")
	want := "media/pamphlets/content-images/user@example.com/active/0-subidea-7.png"
	if key != want {
		t.Fatalf("got %q want %q", key, want)
	}
}

func TestNormalizeContentImageObjectKey(t *testing.T) {
	got := NormalizeContentImageObjectKey("pamphlets/content-images/user@example.com/active/0-subidea-7.png")
	want := "media/pamphlets/content-images/user@example.com/active/0-subidea-7.png"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestGatewayImagePath(t *testing.T) {
	path := GatewayImagePath("pamphlets/content-images/user@example.com/active/0-subidea-7.png")
	if path == "" || path[0] != '/' {
		t.Fatalf("expected absolute gateway path, got %q", path)
	}
}

func TestResolveContentImageObjectKey(t *testing.T) {
	got := ResolveContentImageObjectKey("images/0-subidea-7.png", "user@example.com", "active")
	want := "media/pamphlets/content-images/user@example.com/active/0-subidea-7.png"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
