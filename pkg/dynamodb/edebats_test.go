package dynamodb

import "testing"

func TestEdebatObjectKey(t *testing.T) {
	got := EdebatObjectKey("eduardooost@gmail.com", "abc-123")
	want := "media/edebats/eduardooost_at_gmail.com/abc-123.edebat"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
