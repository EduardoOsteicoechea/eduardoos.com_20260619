package s3store

import "testing"

func TestToAudioItemsFiltersNonAudio(t *testing.T) {
	items := []ObjectMeta{
		{Key: "media/worship_playlists/song.mp3", ContentType: "audio/mpeg", Size: 1000},
		{Key: "media/worship_playlists/cover.png", ContentType: "image/png", Size: 500},
	}
	out := ToAudioItems(items)
	if len(out) != 1 {
		t.Fatalf("expected 1 audio item, got %d", len(out))
	}
	if out[0].Name != "song.mp3" {
		t.Fatalf("unexpected name %q", out[0].Name)
	}
}
