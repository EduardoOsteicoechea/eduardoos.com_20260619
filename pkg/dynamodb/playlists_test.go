package dynamodb

import (
	"context"
	"testing"
)

func TestMemoryPlaylistStoreSaveAndList(t *testing.T) {
	store := newMemoryPlaylistStore()
	ctx := context.Background()

	saved, err := store.SavePlaylist(ctx, Playlist{
		UserID:   "user@test.com",
		Name:     "Sunday",
		TrackIDs: []string{"worship_playlists/a.mp3"},
	}, "corr-1")
	if err != nil {
		t.Fatal(err)
	}
	if saved.PlaylistID == "" {
		t.Fatal("expected generated playlist id")
	}

	list, err := store.GetPlaylistsByUserID(ctx, "user@test.com", "corr-2")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "Sunday" {
		t.Fatalf("unexpected list: %+v", list)
	}
}
