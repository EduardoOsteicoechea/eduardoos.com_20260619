package dynamodb

import (
	"context"
	"testing"
)

func TestMemoryIfcBimStoreRoundTrip(t *testing.T) {
	store := newMemoryIfcBimStore()
	ctx := context.Background()

	saved, err := store.SaveModel(ctx, IfcBimRecord{
		UserID:   "user@example.com",
		FileName: "school.ifc",
		Title:    "School",
	}, "cid-1")
	if err != nil {
		t.Fatalf("SaveModel: %v", err)
	}
	if saved.ModelID == "" {
		t.Fatal("expected modelId")
	}
	if saved.S3Key == "" {
		t.Fatal("expected s3Key")
	}

	got, ok, err := store.GetModel(ctx, "user@example.com", saved.ModelID, "cid-2")
	if err != nil || !ok {
		t.Fatalf("GetModel ok=%v err=%v", ok, err)
	}
	if got.Title != "School" || got.FileName != "school.ifc" {
		t.Fatalf("unexpected record: %+v", got)
	}

	list, err := store.ListModelsByUserID(ctx, "user@example.com", "cid-3")
	if err != nil {
		t.Fatalf("ListModelsByUserID: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1, got %d", len(list))
	}

	other, err := store.ListModelsByUserID(ctx, "other@example.com", "cid-4")
	if err != nil {
		t.Fatalf("ListModelsByUserID other: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("expected empty for other user")
	}

	if err := store.DeleteModel(ctx, "user@example.com", saved.ModelID, "cid-5"); err != nil {
		t.Fatalf("DeleteModel: %v", err)
	}
	_, ok, err = store.GetModel(ctx, "user@example.com", saved.ModelID, "cid-6")
	if err != nil || ok {
		t.Fatalf("expected missing after delete ok=%v err=%v", ok, err)
	}
}

func TestIfcBimObjectKey(t *testing.T) {
	got := IfcBimObjectKey("a@b.com", "uuid-1")
	want := "ifcbim/a_at_b.com/uuid-1.ifc"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestIfcBimStoreIsolatesUsers(t *testing.T) {
	store := newMemoryIfcBimStore()
	ctx := context.Background()
	_, err := store.SaveModel(ctx, IfcBimRecord{UserID: "alice@x.com", FileName: "a.ifc", Title: "A"}, "c1")
	if err != nil {
		t.Fatal(err)
	}
	got, ok, err := store.GetModel(ctx, "bob@x.com", "missing", "c2")
	if err != nil || ok {
		t.Fatalf("bob must not see alice models ok=%v rec=%+v", ok, got)
	}
}
