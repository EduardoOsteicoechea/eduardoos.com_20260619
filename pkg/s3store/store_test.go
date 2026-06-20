package s3store

import (
	"bytes"
	"context"
	"testing"
)

func TestObjectKey(t *testing.T) {
	tests := []struct {
		prefix, key, want string
	}{
		{"media", "favicon.svg", "media/favicon.svg"},
		{"media/", "favicon.svg", "media/favicon.svg"},
		{"", "favicon.svg", "favicon.svg"},
	}
	for _, tc := range tests {
		got := ObjectKey(tc.prefix, tc.key)
		if got != tc.want {
			t.Fatalf("ObjectKey(%q,%q)=%q want %q", tc.prefix, tc.key, got, tc.want)
		}
	}
}

func TestValidateKey(t *testing.T) {
	if err := ValidateKey(""); err == nil {
		t.Fatal("expected error for empty key")
	}
	if err := ValidateKey("../etc/passwd"); err == nil {
		t.Fatal("expected error for traversal")
	}
	if err := ValidateKey("favicon.svg"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStubStorePutGetList(t *testing.T) {
	ctx := context.Background()
	st := newStubStore(Config{Bucket: "test-bucket", Prefix: "media"})
	data := []byte("<svg></svg>")
	res, err := st.Put(ctx, "icons.svg", "image/svg+xml", data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Stored || res.Key != "media/icons.svg" {
		t.Fatalf("unexpected result: %+v", res)
	}
	got, ct, err := st.Get(ctx, "icons.svg")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, data) || ct != "image/svg+xml" {
		t.Fatalf("get mismatch: len=%d ct=%s", len(got), ct)
	}
	list, err := st.List(ctx, "")
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v err=%v", list, err)
	}
}

func TestStubStoreRejectInvalidKey(t *testing.T) {
	st := newStubStore(Config{Bucket: "b", Prefix: "media"})
	_, err := st.Put(context.Background(), "..", "text/plain", []byte("x"))
	if err == nil {
		t.Fatal("expected validation error")
	}
}
