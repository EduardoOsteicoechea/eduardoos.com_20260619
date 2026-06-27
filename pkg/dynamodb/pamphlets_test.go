package dynamodb

import (
	"context"
	"testing"

	"eduardoos/pkg/pamphlet"
)

func TestNewPamphletDocumentStoreMemory(t *testing.T) {
	t.Setenv("PAMPHLETS_BACKEND", "memory")
	store, err := NewPamphletDocumentStore(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if store.BackendName() != "memory" {
		t.Fatalf("expected memory backend, got %s", store.BackendName())
	}
	doc, err := store.Get(context.Background(), "user@example.com", pamphlet.DefaultPamphletID)
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Content.Ideas) == 0 {
		t.Fatal("expected default ideas")
	}
}
