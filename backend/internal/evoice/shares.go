// Playlist share invites — email magic link → copy audios into invitee project (spec 071).
package evoice

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Mailer sends plain-text invite emails (auth SMTP). Nil = create invite, skip mail.
type Mailer interface {
	SendPlainMail(to, subject, body string) error
}

// PublicBaseURL is the absolute site origin for invite links in emails.
func PublicBaseURL() string {
	base := strings.TrimSpace(httpx.Env("PUBLIC_BASE_URL", ""))
	if base == "" {
		base = strings.TrimSpace(httpx.Env("SITE_URL", "https://eduardoos.com"))
	}
	return strings.TrimRight(base, "/")
}

func inviteLandingURL(token string) string {
	return PublicBaseURL() + "/evoice/invite/?token=" + strings.TrimSpace(token)
}

func (h *Handler) saveInvite(ctx context.Context, inv PlaylistShareInvite, cid string) error {
	body, err := json.Marshal(inv)
	if err != nil {
		return err
	}
	return h.Objects.PutBytes(ctx, InviteKey(inv.Token), body, "application/json", cid)
}

func (h *Handler) loadInvite(ctx context.Context, token, cid string) (PlaylistShareInvite, bool, error) {
	var inv PlaylistShareInvite
	raw, ok, err := h.Objects.GetBytes(ctx, InviteKey(token), cid)
	if err != nil || !ok {
		return PlaylistShareInvite{}, false, err
	}
	if err := json.Unmarshal(raw, &inv); err != nil {
		return PlaylistShareInvite{}, false, err
	}
	if strings.TrimSpace(inv.Token) == "" {
		return PlaylistShareInvite{}, false, nil
	}
	return inv, true, nil
}

func inviteExpired(inv PlaylistShareInvite, now time.Time) bool {
	if strings.TrimSpace(inv.ExpiresAt) == "" {
		return true
	}
	exp, err := time.Parse(time.RFC3339, inv.ExpiresAt)
	if err != nil {
		return true
	}
	return !now.Before(exp)
}

func (h *Handler) sendInviteMail(cid, to, subject, body string) {
	if h.Mail == nil {
		log.Printf("[correlation=%s] evoice.invite.mail skip (no mailer) to=%s", cid, to)
		return
	}
	if err := h.Mail.SendPlainMail(to, subject, body); err != nil {
		log.Printf("[correlation=%s] evoice.invite.mail error to=%s err=%v", cid, to, err)
	}
}

// CreatePlaylistShare emails a magic link to copy selected (or all) project audios (spec 071).
func (h *Handler) CreatePlaylistShare(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	if !ValidProjectName(project) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid project")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		Email         string   `json:"email"`
		Files         []string `json:"files"`
		DurationHours int      `json:"durationHours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	to := auth.NormalizeEmail(body.Email)
	if to == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email required")
		return
	}
	hours := body.DurationHours
	if hours < 1 {
		hours = 72
	}
	if hours > 24*30 {
		hours = 24 * 30
	}

	prefix := AudiosPrefix(owner, project) + "/"
	objs, err := h.Objects.ListObjects(r.Context(), prefix, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list audios")
		return
	}
	byName := map[string]ObjectInfo{}
	for _, o := range objs {
		name := strings.TrimPrefix(o.Key, prefix)
		if name == "" || name == ".keep" || strings.Contains(name, "/") || o.Size <= 0 {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(name), ".mp3") {
			continue
		}
		byName[name] = o
	}
	want := make([]string, 0, len(body.Files))
	for _, f := range body.Files {
		f = strings.TrimSpace(f)
		if f != "" {
			want = append(want, path.Base(f))
		}
	}
	var files []PlaylistShareFile
	if len(want) == 0 {
		for name, o := range byName {
			files = append(files, PlaylistShareFile{Name: name, Size: o.Size})
		}
	} else {
		for _, name := range want {
			o, ok := byName[name]
			if !ok || !ValidFileName(name) {
				httpx.WriteError(w, http.StatusBadRequest, "unknown audio: "+name)
				return
			}
			files = append(files, PlaylistShareFile{Name: name, Size: o.Size})
		}
	}
	if len(files) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "no audios to share")
		return
	}
	// Stable order for previews.
	sortPlaylistShareFiles(files)

	now := time.Now().UTC()
	token := uuid.NewString()
	inv := PlaylistShareInvite{
		Token:     token,
		OwnerSafe: SafeEmailKey(owner),
		Project:   project,
		Email:     to,
		Files:     files,
		ExpiresAt: now.Add(time.Duration(hours) * time.Hour).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
	}
	if err := h.saveInvite(r.Context(), inv, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save invite")
		return
	}
	link := inviteLandingURL(token)
	subject := "eVoice playlist share — Eduardo OS"
	mailBody := fmt.Sprintf(
		"Someone shared an eVoice audio playlist with you (%d track(s) from project %q).\n\n"+
			"Sign in with %s (eVoice access required), then open:\n%s\n\n"+
			"This link expires at %s UTC.\n",
		len(files), project, to, link, inv.ExpiresAt,
	)
	h.sendInviteMail(cid, to, subject, mailBody)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"invite": inv,
		"link":   link,
	})
}

func sortPlaylistShareFiles(files []PlaylistShareFile) {
	for i := 0; i < len(files); i++ {
		for j := i + 1; j < len(files); j++ {
			if files[j].Name < files[i].Name {
				files[i], files[j] = files[j], files[i]
			}
		}
	}
}

// GetPlaylistShareInvite is a public preview of a share invite (no audio bytes).
func (h *Handler) GetPlaylistShareInvite(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		httpx.WriteError(w, http.StatusBadRequest, "token required")
		return
	}
	inv, ok, err := h.loadInvite(r.Context(), token, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load invite")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "invite not found")
		return
	}
	expired := inviteExpired(inv, time.Now().UTC())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"valid":   !expired,
		"expired": expired,
		"invite": map[string]any{
			"token":     inv.Token,
			"email":     inv.Email,
			"ownerSafe": inv.OwnerSafe,
			"project":   inv.Project,
			"files":     inv.Files,
			"expiresAt": inv.ExpiresAt,
			"createdAt": inv.CreatedAt,
		},
	})
}

// AcceptPlaylistShareInvite copies shared MP3s into the caller's project (spec 071).
func (h *Handler) AcceptPlaylistShareInvite(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.NormalizeEmail(auth.UserEmailFromRequest(r))
	token := strings.TrimSpace(chi.URLParam(r, "token"))
	if token == "" {
		httpx.WriteError(w, http.StatusBadRequest, "token required")
		return
	}
	inv, ok, err := h.loadInvite(r.Context(), token, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load invite")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "invite not found")
		return
	}
	if inviteExpired(inv, time.Now().UTC()) {
		httpx.WriteError(w, http.StatusGone, "invite expired")
		return
	}
	if caller != auth.NormalizeEmail(inv.Email) {
		httpx.WriteError(w, http.StatusForbidden, "sign in as "+inv.Email+" to accept this share")
		return
	}
	var body struct {
		Project string `json:"project"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	project := sanitizeProject(body.Project)
	if !ValidProjectName(project) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid project name")
		return
	}
	inviteeSafe := SafeEmailKey(caller)
	if err := h.ensureUserFolder(r, inviteeSafe, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not ensure user folder")
		return
	}
	for _, key := range []string{DocsKeepKey(inviteeSafe, project), AudiosKeepKey(inviteeSafe, project)} {
		if err := h.Objects.PutBytes(r.Context(), key, []byte("evoice\n"), "text/plain", cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not ensure project")
			return
		}
	}

	destPrefix := AudiosPrefix(inviteeSafe, project) + "/"
	existing, err := h.Objects.ListObjects(r.Context(), destPrefix, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list target audios")
		return
	}
	taken := map[string]bool{}
	for _, o := range existing {
		name := strings.TrimPrefix(o.Key, destPrefix)
		if name != "" && !strings.Contains(name, "/") {
			taken[name] = true
		}
	}

	imported := make([]string, 0, len(inv.Files))
	renamed := map[string]string{}
	for _, f := range inv.Files {
		srcName := f.Name
		if !ValidFileName(srcName) {
			continue
		}
		srcKey := AudioKey(inv.OwnerSafe, inv.Project, srcName)
		raw, ok, err := h.Objects.GetBytes(r.Context(), srcKey, cid)
		if err != nil || !ok || len(raw) == 0 {
			httpx.WriteError(w, http.StatusBadGateway, "missing shared audio: "+srcName)
			return
		}
		destName := uniqueSharedAudioName(taken, srcName)
		if destName != srcName {
			renamed[srcName] = destName
		}
		destKey := AudioKey(inviteeSafe, project, destName)
		if err := h.Objects.PutBytes(r.Context(), destKey, raw, "audio/mpeg", cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not copy "+srcName)
			return
		}
		taken[destName] = true
		imported = append(imported, destName)
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"project":  project,
		"imported": imported,
		"renamed":  renamed,
	})
}

func uniqueSharedAudioName(taken map[string]bool, name string) string {
	if !taken[name] {
		return name
	}
	base := strings.TrimSuffix(name, path.Ext(name))
	ext := path.Ext(name)
	if ext == "" {
		ext = ".mp3"
	}
	for n := 2; n < 10000; n++ {
		cand := fmt.Sprintf("%s.shared%d%s", base, n, ext)
		if !taken[cand] {
			return cand
		}
	}
	return fmt.Sprintf("%s.shared-%s%s", base, uuid.NewString()[:8], ext)
}
