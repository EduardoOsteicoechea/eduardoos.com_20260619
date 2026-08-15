package content

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestPlaylistCreateAndAddTrack(t *testing.T) {
	secret := "playlist-secret"
	token, err := auth.IssueJWT("dj@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, NewMemoryEpamStore(), NewMemoryBIMStore())
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/playlists",
		bytes.NewBufferString(`{"name":"Sunday set","tracks":[{"title":"Stub hymn","url":""}]}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var created Playlist
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.PlaylistID == "" || created.Name != "Sunday set" {
		t.Fatalf("created=%#v", created)
	}
	if len(created.Tracks) != 1 || created.Tracks[0].Title != "Stub hymn" {
		t.Fatalf("tracks=%#v", created.Tracks)
	}

	addBody := `{"title":"Demo stream","url":"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"}`
	addReq := httptest.NewRequest(http.MethodPost, "/api/playlists/"+created.PlaylistID+"/tracks",
		bytes.NewBufferString(addBody))
	addReq.Header.Set("Authorization", "Bearer "+token)
	addReq.Header.Set("Content-Type", "application/json")
	addRec := httptest.NewRecorder()
	r.ServeHTTP(addRec, addReq)
	if addRec.Code != http.StatusCreated {
		t.Fatalf("add track status=%d body=%s", addRec.Code, addRec.Body.String())
	}
	var updated Playlist
	if err := json.Unmarshal(addRec.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated.Tracks) != 2 {
		t.Fatalf("expected 2 tracks, got %#v", updated.Tracks)
	}
	if updated.Tracks[1].URL == "" {
		t.Fatal("expected url on second track")
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/playlists", nil)
	listReq.Header.Set("Authorization", "Bearer "+token)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d", listRec.Code)
	}
	var list map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	items, _ := list["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("list items=%#v", list)
	}
}
