package s3store

import "testing"

func TestHumanizeAccessError(t *testing.T) {
	msg := HumanizeAccessError("api error AccessDenied: not authorized to perform: s3:PutObject")
	if msg == "" || msg == "api error AccessDenied" {
		t.Fatalf("expected humanized message, got %q", msg)
	}
}
