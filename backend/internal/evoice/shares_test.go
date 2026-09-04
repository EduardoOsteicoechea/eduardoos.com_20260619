package evoice

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

type captureMail struct {
	to, subject, body string
	n                 int
}

func (c *captureMail) SendPlainMail(to, subject, body string) error {
	c.n++
	c.to, c.subject, c.body = to, subject, body
	return nil
}

func TestPlaylistShareInviteCopyFlow(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	_ = users.PutUser(t.Context(), auth.User{
		Email: "friend@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	h := NewHandler("evoice-share-secret", users)
	h.Entitlements = payments.NewStore()
	h.Entitlements.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"evoice"}, "monthly", 1))
	h.Entitlements.PutEntitlements("friend@example.com", payments.BuildEntitlements([]string{"evoice"}, "monthly", 1))
	mail := &captureMail{}
	h.Mail = mail

	r := chi.NewRouter()
	h.Routes(r)

	ownerTok, err := auth.IssueJWT("owner@example.com", "evoice-share-secret")
	if err != nil {
		t.Fatal(err)
	}
	friendTok, err := auth.IssueJWT("friend@example.com", "evoice-share-secret")
	if err != nil {
		t.Fatal(err)
	}
	ownerSafe := SafeEmailKey("owner@example.com")

	// Create project + two audios.
	req := httptest.NewRequest(http.MethodPost, "/api/evoice/projects", bytes.NewBufferString(`{"name":"shareme"}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create project=%d %s", rec.Code, rec.Body.String())
	}
	_ = h.Objects.PutBytes(t.Context(), AudioKey(ownerSafe, "shareme", "track-a.mp3"), []byte("ID3aaa"), "audio/mpeg", "t")
	_ = h.Objects.PutBytes(t.Context(), AudioKey(ownerSafe, "shareme", "track-b.mp3"), []byte("ID3bbb"), "audio/mpeg", "t")

	// Share only track-a.
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/projects/"+ownerSafe+"/shareme/shares",
		bytes.NewBufferString(`{"email":"friend@example.com","files":["track-a.mp3"],"durationHours":24}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("share status=%d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	inv := created["invite"].(map[string]any)
	token, _ := inv["token"].(string)
	if token == "" || mail.n != 1 || !strings.Contains(mail.body, token) {
		t.Fatalf("invite/mail missing: token=%q mail=%+v", token, mail)
	}
	link, _ := created["link"].(string)
	if !strings.Contains(link, "/evoice/invite/?token=") {
		t.Fatalf("link=%q", link)
	}

	// Public preview.
	req = httptest.NewRequest(http.MethodGet, "/api/evoice/invite/"+token, nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"valid":true`) {
		t.Fatalf("preview=%d %s", rec.Code, rec.Body.String())
	}

	// Wrong email cannot accept.
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/invite/"+token+"/accept",
		bytes.NewBufferString(`{"project":"inbox"}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("owner accept want 403 got %d %s", rec.Code, rec.Body.String())
	}

	// Friend accepts into inbox.
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/invite/"+token+"/accept",
		bytes.NewBufferString(`{"project":"inbox"}`))
	req.Header.Set("Authorization", "Bearer "+friendTok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("accept=%d %s", rec.Code, rec.Body.String())
	}
	friendSafe := SafeEmailKey("friend@example.com")
	body, ok, err := h.Objects.GetBytes(t.Context(), AudioKey(friendSafe, "inbox", "track-a.mp3"), "t")
	if err != nil || !ok || string(body) != "ID3aaa" {
		t.Fatalf("copied audio ok=%v err=%v body=%q", ok, err, body)
	}
	_, ok, _ = h.Objects.GetBytes(t.Context(), AudioKey(friendSafe, "inbox", "track-b.mp3"), "t")
	if ok {
		t.Fatal("track-b should not have been shared")
	}

	// Collision rename on second accept.
	_ = h.Objects.PutBytes(t.Context(), AudioKey(friendSafe, "inbox", "track-a.mp3"), []byte("ID3aaa"), "audio/mpeg", "t")
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/invite/"+token+"/accept",
		bytes.NewBufferString(`{"project":"inbox"}`))
	req.Header.Set("Authorization", "Bearer "+friendTok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-accept=%d %s", rec.Code, rec.Body.String())
	}
	var acc map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &acc)
	renamed, _ := acc["renamed"].(map[string]any)
	if renamed["track-a.mp3"] != "track-a.shared2.mp3" {
		t.Fatalf("renamed=%#v", renamed)
	}
	body, ok, _ = h.Objects.GetBytes(t.Context(), AudioKey(friendSafe, "inbox", "track-a.shared2.mp3"), "t")
	if !ok || string(body) != "ID3aaa" {
		t.Fatalf("shared2 missing body=%q", body)
	}
}

func TestUniqueSharedAudioName(t *testing.T) {
	taken := map[string]bool{"a.mp3": true}
	if got := uniqueSharedAudioName(taken, "a.mp3"); got != "a.shared2.mp3" {
		t.Fatalf("got=%q", got)
	}
	taken["a.shared2.mp3"] = true
	if got := uniqueSharedAudioName(taken, "a.mp3"); got != "a.shared3.mp3" {
		t.Fatalf("got=%q", got)
	}
	if got := uniqueSharedAudioName(taken, "b.mp3"); got != "b.mp3" {
		t.Fatalf("got=%q", got)
	}
}
