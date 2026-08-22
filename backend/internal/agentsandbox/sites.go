// Site persistence for Agent Sandbox: websites own files; chats group under a site.
package agentsandbox

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var siteIDRe = chatIDRe

// Site is one website workspace shared by many chats.
type Site struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Spec    string   `json:"spec"`
	Files   []File   `json:"files"`
	Tabs    []Tab    `json:"tabs"`
	ChatIDs []string `json:"chatIds"`
	Updated string   `json:"updated"`
}

// SiteSummary is a row for the sites list.
type SiteSummary struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Updated string `json:"updated"`
}

// SiteIndex lists all sites for an admin.
type SiteIndex struct {
	Sites []SiteSummary `json:"sites"`
}

func (h *Handler) sitesIndexKey(email string) string {
	return h.adminPrefix(email) + "/sites/index.json"
}

func (h *Handler) siteKey(email, id string) string {
	return h.adminPrefix(email) + "/sites/" + id + ".json"
}

func emptySite(id, name string) Site {
	now := time.Now().UTC().Format(time.RFC3339)
	return Site{
		ID:      id,
		Name:    name,
		Spec:    "",
		Files:   []File{},
		Tabs:    []Tab{},
		ChatIDs: []string{},
		Updated: now,
	}
}

func (h *Handler) loadSiteIndex(ctx context.Context, email string) (SiteIndex, bool, error) {
	var idx SiteIndex
	ok, err := h.getJSON(ctx, h.sitesIndexKey(email), &idx)
	if err != nil {
		return SiteIndex{}, false, err
	}
	if !ok || idx.Sites == nil {
		idx.Sites = []SiteSummary{}
	}
	return idx, ok, nil
}

func (h *Handler) saveSiteIndex(ctx context.Context, email string, idx SiteIndex) error {
	sort.Slice(idx.Sites, func(i, j int) bool {
		return idx.Sites[i].Updated > idx.Sites[j].Updated
	})
	return h.putJSON(ctx, h.sitesIndexKey(email), idx)
}

func (h *Handler) loadSite(ctx context.Context, email, id string) (Site, error) {
	if !siteIDRe.MatchString(id) {
		return Site{}, fmt.Errorf("invalid site id")
	}
	var site Site
	ok, err := h.getJSON(ctx, h.siteKey(email, id), &site)
	if err != nil {
		return Site{}, err
	}
	if !ok {
		return Site{}, fmt.Errorf("site not found")
	}
	if site.Files == nil {
		site.Files = []File{}
	}
	if site.Tabs == nil {
		site.Tabs = []Tab{}
	}
	if site.ChatIDs == nil {
		site.ChatIDs = []string{}
	}
	return site, nil
}

func (h *Handler) saveSite(ctx context.Context, email string, site Site) error {
	site.Updated = time.Now().UTC().Format(time.RFC3339)
	if err := h.putJSON(ctx, h.siteKey(email, site.ID), site); err != nil {
		return err
	}
	idx, _, err := h.loadSiteIndex(ctx, email)
	if err != nil {
		return err
	}
	found := false
	for i := range idx.Sites {
		if idx.Sites[i].ID == site.ID {
			idx.Sites[i] = SiteSummary{ID: site.ID, Name: site.Name, Updated: site.Updated}
			found = true
			break
		}
	}
	if !found {
		idx.Sites = append(idx.Sites, SiteSummary{ID: site.ID, Name: site.Name, Updated: site.Updated})
	}
	return h.saveSiteIndex(ctx, email, idx)
}

func upsertSiteFile(site *Site, f File) error {
	if err := validateFile(f); err != nil {
		return err
	}
	f = normalizeFileForStore(f)
	for i := range site.Files {
		if site.Files[i].Name == f.Name {
			site.Files[i] = f
			return nil
		}
	}
	if len(site.Files) >= maxFiles {
		return fmt.Errorf("workspace file limit reached")
	}
	site.Files = append(site.Files, f)
	return nil
}

func fileRows(files []File) []map[string]any {
	out := make([]map[string]any, 0, len(files))
	for _, f := range files {
		bytesLen := len(f.Text)
		if f.Encoding == "base64" {
			if raw, err := decodeBase64(f.Text); err == nil {
				bytesLen = len(raw)
			}
		}
		out = append(out, map[string]any{
			"name":     f.Name,
			"type":     f.Type,
			"bytes":    bytesLen,
			"text":     f.Text,
			"encoding": f.Encoding,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i]["name"].(string) < out[j]["name"].(string)
	})
	return out
}

// ensureSites migrates legacy chat-only storage into a Default site when needed.
func (h *Handler) ensureSites(ctx context.Context, email string) (SiteIndex, error) {
	idx, ok, err := h.loadSiteIndex(ctx, email)
	if err != nil {
		return SiteIndex{}, err
	}
	if ok && len(idx.Sites) > 0 {
		return idx, nil
	}

	legacy, err := h.loadIndex(ctx, email)
	if err != nil {
		return SiteIndex{}, err
	}

	siteID := uuid.NewString()
	site := emptySite(siteID, "Default")
	bestFiles := 0

	for _, row := range legacy.Chats {
		chat, err := h.loadChat(ctx, email, row.ID)
		if err != nil {
			continue
		}
		chat.SiteID = siteID
		if len(chat.Files) > bestFiles {
			site.Files = append([]File{}, chat.Files...)
			site.Tabs = append([]Tab{}, chat.Tabs...)
			site.Spec = chat.Spec
			bestFiles = len(chat.Files)
		} else if bestFiles == 0 && site.Spec == "" && chat.Spec != "" {
			site.Spec = chat.Spec
		}
		chat.Files = nil
		chat.Tabs = nil
		chat.Spec = ""
		if err := h.putJSON(ctx, h.chatKey(email, chat.ID), chat); err != nil {
			return SiteIndex{}, err
		}
		site.ChatIDs = append(site.ChatIDs, chat.ID)
	}

	if len(site.ChatIDs) == 0 {
		chat := emptyChat(uuid.NewString(), siteID)
		if err := h.putJSON(ctx, h.chatKey(email, chat.ID), chat); err != nil {
			return SiteIndex{}, err
		}
		site.ChatIDs = []string{chat.ID}
	}

	if err := h.saveSite(ctx, email, site); err != nil {
		return SiteIndex{}, err
	}
	idx2, _, err := h.loadSiteIndex(ctx, email)
	return idx2, err
}

// ListSites returns site summaries (migrating legacy data if needed).
func (h *Handler) ListSites(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	idx, err := h.ensureSites(r.Context(), auth.UserEmailFromRequest(r))
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, idx)
}

type createSiteRequest struct {
	Name string `json:"name"`
}

// CreateSite creates a named site and one empty chat.
func (h *Handler) CreateSite(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var req createSiteRequest
	_ = json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&req)
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Nuevo site"
	}
	if len(name) > 80 {
		name = name[:80]
	}
	email := auth.UserEmailFromRequest(r)
	if _, err := h.ensureSites(r.Context(), email); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	siteID := uuid.NewString()
	site := emptySite(siteID, name)
	chat := emptyChat(uuid.NewString(), siteID)
	site.ChatIDs = []string{chat.ID}
	if err := h.putJSON(r.Context(), h.chatKey(email, chat.ID), chat); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := h.saveSite(r.Context(), email, site); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"site": site, "chat": chat})
}

// GetSite loads one site.
func (h *Handler) GetSite(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	if _, err := h.ensureSites(r.Context(), email); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	site, err := h.loadSite(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		code := http.StatusBadGateway
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "invalid") {
			code = http.StatusNotFound
		}
		httpx.WriteError(w, code, err.Error())
		return
	}
	site, repaired := h.recoverSiteFilesFromChats(r.Context(), email, site)
	if repaired {
		_ = h.saveSite(r.Context(), email, site)
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, site)
}

type patchSiteRequest struct {
	Name string `json:"name"`
}

// PatchSite renames a site.
func (h *Handler) PatchSite(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var req patchSiteRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	if len(name) > 80 {
		name = name[:80]
	}
	email := auth.UserEmailFromRequest(r)
	site, err := h.loadSite(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	site.Name = name
	if err := h.saveSite(r.Context(), email, site); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, site)
}

// ListSiteFiles returns files for the editor (includes text).
func (h *Handler) ListSiteFiles(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	site, err := h.loadSite(r.Context(), auth.UserEmailFromRequest(r), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	site, repaired := h.recoverSiteFilesFromChats(r.Context(), email, site)
	if repaired {
		_ = h.saveSite(r.Context(), email, site)
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"siteId": site.ID, "files": fileRows(site.Files)})
}

// PutSiteFile upserts one file into the site JSON.
func (h *Handler) PutSiteFile(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var f File
	if err := json.NewDecoder(io.LimitReader(r.Body, maxFileBytes*2+4096)).Decode(&f); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid file")
		return
	}
	email := auth.UserEmailFromRequest(r)
	site, err := h.loadSite(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := upsertSiteFile(&site, f); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.saveSite(r.Context(), email, site); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, site)
}

// DownloadSiteFile streams a site file as an attachment (decodes base64 binaries).
func (h *Handler) DownloadSiteFile(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	name := strings.TrimSpace(chi.URLParam(r, "name"))
	site, err := h.loadSite(r.Context(), auth.UserEmailFromRequest(r), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	var found *File
	for i := range site.Files {
		if site.Files[i].Name == name {
			found = &site.Files[i]
			break
		}
	}
	if found == nil {
		httpx.WriteError(w, http.StatusNotFound, "file not found")
		return
	}
	ctype := found.Type
	if ctype == "" {
		ctype = allowedExtensions[strings.ToLower(path.Ext(found.Name))]
	}
	var body []byte
	if found.Encoding == "base64" || binaryExtensions[strings.ToLower(path.Ext(found.Name))] {
		raw, err := decodeBase64(found.Text)
		if err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "corrupt binary file")
			return
		}
		body = raw
	} else {
		body = []byte(found.Text)
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, strings.ReplaceAll(found.Name, `"`, "")))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func siteHasNonEmptyFiles(site Site) bool {
	for _, f := range site.Files {
		if strings.TrimSpace(f.Text) != "" {
			return true
		}
	}
	return false
}

// recoverSiteFilesFromChats fills empty site files from assistant messages that
// embedded ARTIFACTS JSON or a raw JSON object with files[].
func (h *Handler) recoverSiteFilesFromChats(ctx context.Context, email string, site Site) (Site, bool) {
	if siteHasNonEmptyFiles(site) {
		return site, false
	}
	changed := false
	for _, chatID := range site.ChatIDs {
		chat, err := h.loadChat(ctx, email, chatID)
		if err != nil {
			continue
		}
		for _, m := range chat.Messages {
			if m.Role != "assistant" {
				continue
			}
			if applyArtifactsToSite(&site, m.Text) {
				changed = true
			}
		}
	}
	return site, changed
}

func applyArtifactsToSite(site *Site, raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	changed := false
	_, art := splitArtifacts(raw)
	candidates := []string{art}
	if strings.HasPrefix(raw, "{") {
		candidates = append(candidates, raw)
	}
	for _, blob := range candidates {
		blob = strings.TrimSpace(blob)
		if blob == "" {
			continue
		}
		var p proposal
		if err := json.Unmarshal([]byte(blob), &p); err != nil {
			continue
		}
		if p.Spec != "" && site.Spec == "" {
			site.Spec = p.Spec
			changed = true
		}
		if len(p.Tabs) > 0 && len(site.Tabs) == 0 {
			site.Tabs = p.Tabs
			changed = true
		}
		for _, pf := range p.Files {
			f := pf.toFile()
			if f.Name == "" || strings.TrimSpace(f.Text) == "" {
				continue
			}
			existingLen := -1
			for _, ex := range site.Files {
				if ex.Name == f.Name {
					existingLen = len(ex.Text)
					break
				}
			}
			if existingLen >= len(f.Text) {
				continue
			}
			if err := upsertSiteFile(site, f); err == nil {
				changed = true
			}
		}
	}
	return changed
}

func (h *Handler) chatSummariesForSite(ctx context.Context, email string, site Site) ([]ChatSummary, error) {
	out := make([]ChatSummary, 0, len(site.ChatIDs))
	for _, id := range site.ChatIDs {
		chat, err := h.loadChat(ctx, email, id)
		if err != nil {
			continue
		}
		out = append(out, ChatSummary{ID: chat.ID, Title: chat.Title, Updated: chat.Updated, SiteID: site.ID})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Updated > out[j].Updated })
	return out, nil
}
