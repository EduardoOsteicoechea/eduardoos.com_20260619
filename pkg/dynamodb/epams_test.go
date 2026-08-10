package dynamodb

import (
	"context"
	"testing"
)

func TestMemoryEpamStoreRoundTrip(t *testing.T) {
	store := newMemoryEpamStore()
	ctx := context.Background()

	saved, err := store.SaveEpam(ctx, EpamRecord{
		UserID:        "user@example.com",
		FileName:      "romanos_ch1.epam",
		Title:         "Romanos",
		Series:        "romanos",
		SeriesChapter: "1",
		Author:        "Eduardo",
		Date:          "2026-08-10",
	}, "cid-1")
	if err != nil {
		t.Fatalf("SaveEpam: %v", err)
	}
	if saved.EpamID == "" {
		t.Fatal("expected epamId")
	}
	if saved.S3Key == "" {
		t.Fatal("expected s3Key")
	}

	got, ok, err := store.GetEpam(ctx, "user@example.com", saved.EpamID, "cid-2")
	if err != nil || !ok {
		t.Fatalf("GetEpam ok=%v err=%v", ok, err)
	}
	if got.Title != "Romanos" || got.FileName != "romanos_ch1.epam" {
		t.Fatalf("unexpected record: %+v", got)
	}

	list, err := store.ListEpamsByUserID(ctx, "user@example.com", "cid-3")
	if err != nil {
		t.Fatalf("ListEpamsByUserID: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1, got %d", len(list))
	}

	other, err := store.ListEpamsByUserID(ctx, "other@example.com", "cid-4")
	if err != nil {
		t.Fatalf("ListEpamsByUserID other: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("expected empty for other user")
	}

	if err := store.DeleteEpam(ctx, "user@example.com", saved.EpamID, "cid-5"); err != nil {
		t.Fatalf("DeleteEpam: %v", err)
	}
	_, ok, err = store.GetEpam(ctx, "user@example.com", saved.EpamID, "cid-6")
	if err != nil || ok {
		t.Fatalf("expected missing after delete ok=%v err=%v", ok, err)
	}
}

func TestEpamObjectKey(t *testing.T) {
	got := EpamObjectKey("a@b.com", "uuid-1")
	want := "media/epams/a@b.com/uuid-1.epam"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
