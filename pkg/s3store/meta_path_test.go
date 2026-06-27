package s3store

import "testing"

func TestEncodeRelativePathKeepsSlashes(t *testing.T) {
	got := EncodeRelativePath("worship_playlists/Ayúdame. Cánticos espirituales..mp3")
	want := "worship_playlists/Ay%C3%BAdame.%20C%C3%A1nticos%20espirituales..mp3"
	if got != want {
		t.Fatalf("EncodeRelativePath() = %q, want %q", got, want)
	}
}

func TestEncodeRelativePathDoesNotUseEncodedSlash(t *testing.T) {
	got := EncodeRelativePath("worship_playlists/song.mp3")
	if got == "worship_playlists%2Fsong.mp3" {
		t.Fatal("slash must stay literal, not %2F")
	}
}
