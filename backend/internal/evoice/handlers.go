// Package evoice HTTP handlers — JWT + entitlement/allowlist/admin (spec 044).
package evoice

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

const maxUploadBytes = 32 << 20

// Handler serves JWT-protected eVoice APIs.
type Handler struct {
	JWTSecret    string
	Users        auth.UserStore
	Objects      ObjectSpace
	Entitlements *payments.Store
	Jobs         *JobStore
	auth         *auth.Handler
}

// NewHandler wires defaults (memory objects + fake TTS for tests).
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Objects:   NewMemoryObjectSpace(),
		Jobs:      NewJobStore(FakeRunner{}),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/evoice/* behind RequireJWT + evoice access.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireEvoiceAccess)

		pr.Get("/api/evoice/me", h.GetMe)
		pr.Get("/api/evoice/users", h.ListUsers)
		pr.Get("/api/evoice/projects", h.ListProjects)
		pr.Post("/api/evoice/projects", h.CreateProject)
		pr.Get("/api/evoice/projects/{ownerSafe}/{project}/docs", h.ListDocs)
		pr.Post("/api/evoice/projects/{ownerSafe}/{project}/docs", h.UploadDoc)
		pr.Post("/api/evoice/projects/{ownerSafe}/{project}/docs/text", h.PasteDocText)
		pr.Delete("/api/evoice/projects/{ownerSafe}/{project}/docs", h.DeleteDoc)
		pr.Delete("/api/evoice/projects/{ownerSafe}/{project}/docs/*", h.DeleteDoc)
		pr.Get("/api/evoice/projects/{ownerSafe}/{project}/audios", h.ListAudios)
		pr.Delete("/api/evoice/projects/{ownerSafe}/{project}/audios", h.DeleteAudio)
		pr.Delete("/api/evoice/projects/{ownerSafe}/{project}/audios/*", h.DeleteAudio)
		pr.Get("/api/evoice/file/{ownerSafe}/{project}/{kind}", h.GetFile)
		pr.Head("/api/evoice/file/{ownerSafe}/{project}/{kind}", h.GetFile)
		pr.Get("/api/evoice/file/{ownerSafe}/{project}/{kind}/*", h.GetFile)
		pr.Head("/api/evoice/file/{ownerSafe}/{project}/{kind}/*", h.GetFile)
		pr.Post("/api/evoice/projects/{ownerSafe}/{project}/generate", h.StartGenerate)
		pr.Get("/api/evoice/jobs/{jobId}", h.GetJob)
		pr.Post("/api/evoice/jobs/{jobId}/stop", h.StopJob)
		pr.Post("/api/evoice/jobs/{jobId}/resume", h.ResumeJob)
	})
}

func (h *Handler) requireEvoiceAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		if h.hasEvoiceAccess(r, email) {
			next.ServeHTTP(w, r)
			return
		}
		httpx.WriteError(w, http.StatusForbidden, "evoice subscription required")
	})
}

func (h *Handler) hasEvoiceAccess(r *http.Request, email string) bool {
	if h.isAdminUser(r, email) {
		return true
	}
	if payments.IsEvoiceAllowlisted(email) {
		return true
	}
	if h.Entitlements == nil {
		return true
	}
	ents := h.Entitlements.ListEntitlements(email)
	return payments.HasServiceAccess(false, ents, "evoice")
}

func (h *Handler) isAdminUser(r *http.Request, email string) bool {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
	}
	return auth.IsAdmin(email, role)
}

func (h *Handler) canAccessOwner(r *http.Request, caller, ownerSafe string) bool {
	if h.isAdminUser(r, caller) {
		return true
	}
	return SafeEmailKey(caller) == strings.TrimSpace(ownerSafe)
}

func (h *Handler) ensureUserFolder(r *http.Request, email, cid string) error {
	key := UserKeepKey(email)
	_, ok, err := h.Objects.GetBytes(r.Context(), key, cid)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	return h.Objects.PutBytes(r.Context(), key, []byte("evoice-user\n"), "text/plain", cid)
}

// GetMe ensures the caller's S3 prefix and returns identity.
func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if err := h.ensureUserFolder(r, email, cid); err != nil {
		log.Printf("[correlation=%s] evoice.me ensure: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not ensure user folder")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":    email,
		"userSafe": SafeEmailKey(email),
		"isAdmin":  h.isAdminUser(r, email),
	})
}

// ListUsers lists owner candidates for the admin picker (spec 044):
// all UserStore accounts as userSafe ∪ eVoice allowlist ∪ existing S3 prefixes.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !h.isAdminUser(r, email) {
		httpx.WriteError(w, http.StatusForbidden, "admin only")
		return
	}
	seen := map[string]struct{}{}
	add := func(safe string) {
		safe = strings.TrimSpace(safe)
		if safe == "" || safe == ".keep" {
			return
		}
		seen[safe] = struct{}{}
	}
	if h.Users != nil {
		if all, err := h.Users.ListUsers(r.Context()); err == nil {
			for _, u := range all {
				add(SafeEmailKey(u.Email))
			}
		} else {
			log.Printf("[correlation=%s] evoice.users store: %v", cid, err)
		}
	}
	for _, a := range payments.EvoiceAllowlistEmails {
		add(SafeEmailKey(a))
	}
	add(SafeEmailKey(email))
	if prefixes, err := h.Objects.ListPrefixes(r.Context(), RootPrefix+"/", cid); err == nil {
		for _, p := range prefixes {
			if p == "_jobs" {
				continue
			}
			add(p)
		}
	} else {
		log.Printf("[correlation=%s] evoice.users s3: %v", cid, err)
	}
	users := make([]string, 0, len(seen))
	for u := range seen {
		users = append(users, u)
	}
	sort.Strings(users)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}

// ListProjects lists project names for owner (self or admin via ?owner=).
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := strings.TrimSpace(r.URL.Query().Get("owner"))
	if owner == "" {
		owner = SafeEmailKey(caller)
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if err := h.ensureUserFolder(r, owner, cid); err != nil {
		log.Printf("[correlation=%s] evoice.projects ensure: %v", cid, err)
	}
	names, err := h.Objects.ListPrefixes(r.Context(), UserPrefix(owner)+"/", cid)
	if err != nil {
		log.Printf("[correlation=%s] evoice.projects: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list projects")
		return
	}
	projects := make([]string, 0, len(names))
	for _, n := range names {
		if n == ProjectMarkerName || n == ".keep" || n == "_jobs" {
			continue
		}
		projects = append(projects, n)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ownerSafe": owner,
		"projects":  projects,
	})
}

type createProjectBody struct {
	Name  string `json:"name"`
	Owner string `json:"owner"`
}

// CreateProject creates docs/ + audios/ markers under the owner prefix.
func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	var body createProjectBody
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := sanitizeProject(body.Name)
	if !ValidProjectName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid project name")
		return
	}
	owner := strings.TrimSpace(body.Owner)
	if owner == "" {
		owner = SafeEmailKey(caller)
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if err := h.ensureUserFolder(r, owner, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not ensure user folder")
		return
	}
	for _, key := range []string{DocsKeepKey(owner, name), AudiosKeepKey(owner, name)} {
		if err := h.Objects.PutBytes(r.Context(), key, []byte("evoice\n"), "text/plain", cid); err != nil {
			log.Printf("[correlation=%s] evoice.create put: %v", cid, err)
			httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not create project"))
			return
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"ownerSafe": owner,
		"project":   name,
	})
}

func (h *Handler) listKind(w http.ResponseWriter, r *http.Request, kind string) {
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
	prefix := DocsPrefix(owner, project) + "/"
	if kind == "audios" {
		prefix = AudiosPrefix(owner, project) + "/"
	}
	objs, err := h.Objects.ListObjects(r.Context(), prefix, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list "+kind)
		return
	}
	items := make([]ObjectMeta, 0, len(objs))
	for _, o := range objs {
		name := strings.TrimPrefix(o.Key, prefix)
		if name == "" || name == ".keep" || strings.Contains(name, "/") {
			continue
		}
		// Skip empty phantom objects (cannot play / often leftover markers).
		if kind == "audios" && o.Size <= 0 {
			continue
		}
		meta := ObjectMeta{
			Name: name,
			Key:  o.Key,
			Size: o.Size,
			URL: fmt.Sprintf("/api/evoice/file/%s/%s/%s?name=%s",
				url.PathEscape(owner), url.PathEscape(project), kind, url.QueryEscape(path.Base(name))),
		}
		if !o.LastModified.IsZero() {
			meta.LastModified = o.LastModified.UTC().Format(time.RFC3339)
		}
		items = append(items, meta)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ownerSafe": owner,
		"project":   project,
		kind:        items,
	})
}

func (h *Handler) ListDocs(w http.ResponseWriter, r *http.Request) {
	h.listKind(w, r, "docs")
}

func (h *Handler) ListAudios(w http.ResponseWriter, r *http.Request) {
	h.listKind(w, r, "audios")
}

// UploadDoc accepts multipart field "file".
func (h *Handler) UploadDoc(w http.ResponseWriter, r *http.Request) {
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
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	name := sanitizeFileName(hdr.Filename)
	if !ValidFileName(name) || !isConvertible(name) {
		httpx.WriteError(w, http.StatusBadRequest, "unsupported or invalid file name")
		return
	}
	body, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read file")
		return
	}
	if len(body) > maxUploadBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	}
	key := DocKey(owner, project, name)
	if err := h.Objects.PutBytes(r.Context(), key, body, contentTypeForKey(key), cid); err != nil {
		log.Printf("[correlation=%s] evoice.upload: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not upload"))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"ownerSafe": owner,
		"project":   project,
		"name":      name,
		"key":       key,
		"size":      len(body),
		"url": fmt.Sprintf("/api/evoice/file/%s/%s/docs?name=%s", owner, project, url.QueryEscape(name)),
	})
}

type pasteDocBody struct {
	Text string `json:"text"`
}

// PasteDocText creates docs/paste-YYYYMMDD-HHMMSS.txt from pasted UTF-8 text.
func (h *Handler) PasteDocText(w http.ResponseWriter, r *http.Request) {
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
	var body pasteDocBody
	if err := json.NewDecoder(io.LimitReader(r.Body, maxUploadBytes+1)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" {
		httpx.WriteError(w, http.StatusBadRequest, "text required")
		return
	}
	if len(text) > maxUploadBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "text too large")
		return
	}
	name := fmt.Sprintf("paste-%s.txt", time.Now().UTC().Format("20060102-150405"))
	if !ValidFileName(name) || !isConvertible(name) {
		httpx.WriteError(w, http.StatusBadRequest, "could not build paste file name")
		return
	}
	key := DocKey(owner, project, name)
	raw := []byte(text)
	if err := h.Objects.PutBytes(r.Context(), key, raw, "text/plain; charset=utf-8", cid); err != nil {
		log.Printf("[correlation=%s] evoice.paste: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save text"))
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"ownerSafe": owner,
		"project":   project,
		"name":      name,
		"key":       key,
		"size":      len(raw),
		"url": fmt.Sprintf("/api/evoice/file/%s/%s/docs?name=%s", owner, project, url.QueryEscape(name)),
	})
}

// fileNameFromRequest reads basename from ?name= (preferred) or chi wildcard *.
func fileNameFromRequest(r *http.Request) string {
	if q := strings.TrimSpace(r.URL.Query().Get("name")); q != "" {
		return sanitizeFileName(q)
	}
	return sanitizeFileName(strings.TrimPrefix(chi.URLParam(r, "*"), "/"))
}

// resolveObjectKey picks S3 key from ?key= (trusted after ACL) or constructs from name.
func (h *Handler) resolveObjectKey(r *http.Request, owner, project, kind, name string) (string, error) {
	rawKey := strings.TrimSpace(r.URL.Query().Get("key"))
	if rawKey != "" {
		rawKey = strings.TrimPrefix(rawKey, "/")
		if !strings.HasPrefix(rawKey, RootPrefix+"/") {
			return "", fmt.Errorf("invalid key")
		}
		// Must live under this owner's project kind prefix.
		wantPrefix := DocsPrefix(owner, project) + "/"
		if kind == "audios" {
			wantPrefix = AudiosPrefix(owner, project) + "/"
		}
		if !strings.HasPrefix(rawKey, wantPrefix) {
			return "", fmt.Errorf("key outside project")
		}
		base := strings.TrimPrefix(rawKey, wantPrefix)
		if base == "" || strings.Contains(base, "/") || !ValidFileName(base) {
			return "", fmt.Errorf("invalid key basename")
		}
		return rawKey, nil
	}
	if kind == "docs" {
		return DocKey(owner, project, name), nil
	}
	return AudioKey(owner, project, name), nil
}

func (h *Handler) findKeyByBasename(ctx context.Context, owner, project, kind, name, cid string) string {
	prefix := DocsPrefix(owner, project) + "/"
	if kind == "audios" {
		prefix = AudiosPrefix(owner, project) + "/"
	}
	objs, err := h.Objects.ListObjects(ctx, prefix, cid)
	if err != nil {
		return ""
	}
	want := strings.ToLower(strings.TrimSpace(name))
	var soft string
	for _, o := range objs {
		base := strings.TrimPrefix(o.Key, prefix)
		if base == "" || strings.Contains(base, "/") {
			continue
		}
		if base == name {
			return o.Key
		}
		if soft == "" && strings.EqualFold(base, want) {
			soft = o.Key
		}
	}
	return soft
}

// DeleteDoc removes one document from docs/.
func (h *Handler) DeleteDoc(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	name := fileNameFromRequest(r)
	if !ValidProjectName(project) || !ValidFileName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	key := DocKey(owner, project, name)
	if err := h.Objects.DeleteKey(r.Context(), key, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not delete")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "key": key})
}

// DeleteAudio removes one MP3 from audios/.
func (h *Handler) DeleteAudio(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	name := fileNameFromRequest(r)
	if !ValidProjectName(project) || !ValidFileName(name) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if !strings.HasSuffix(strings.ToLower(name), ".mp3") {
		httpx.WriteError(w, http.StatusBadRequest, "audio must be .mp3")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	key := AudioKey(owner, project, name)
	if err := h.Objects.DeleteKey(r.Context(), key, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not delete")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "key": key})
}

// GetFile streams a docs/ or audios/ object (supports Range for audio seek).
// Prefer ?key= (exact list key) or ?name=; recover via prefix list on miss (spec 044).
func (h *Handler) GetFile(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	kind := chi.URLParam(r, "kind")
	name := fileNameFromRequest(r)
	if name == "" {
		if k := strings.TrimSpace(r.URL.Query().Get("key")); k != "" {
			name = sanitizeFileName(path.Base(k))
		}
	}
	if !ValidProjectName(project) || (kind != "docs" && kind != "audios") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if name != "" && !ValidFileName(name) && strings.TrimSpace(r.URL.Query().Get("key")) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	key, err := h.resolveObjectKey(r, owner, project, kind, name)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	rangeHdr := strings.TrimSpace(r.Header.Get("Range"))
	body, ct, length, contentRange, err := h.Objects.OpenStream(r.Context(), key, rangeHdr, cid)
	if err != nil && (isNotFound(err) || strings.Contains(strings.ToLower(err.Error()), "not found")) {
		if recovered := h.findKeyByBasename(r.Context(), owner, project, kind, name, cid); recovered != "" && recovered != key {
			log.Printf("[correlation=%s] evoice.file recover key=%s → %s", cid, key, recovered)
			key = recovered
			body, ct, length, contentRange, err = h.Objects.OpenStream(r.Context(), key, rangeHdr, cid)
		}
	}
	if err != nil {
		if isNotFound(err) || strings.Contains(strings.ToLower(err.Error()), "not found") {
			log.Printf("[correlation=%s] evoice.file not found key=%s name=%q", cid, key, name)
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
				"error": "file not found",
				"key":   key,
				"name":  name,
			})
			return
		}
		log.Printf("[correlation=%s] evoice.file: %v key=%s", cid, err, key)
		httpx.WriteError(w, http.StatusBadGateway, "could not read file")
		return
	}
	defer body.Close()
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=60")
	if contentRange != "" {
		w.Header().Set("Content-Range", contentRange)
	}
	if length > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", length))
	}
	status := http.StatusOK
	if rangeHdr != "" && contentRange != "" {
		status = http.StatusPartialContent
	}
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.Copy(w, body)
}

// StartGenerate enqueues a sandbox TTS job.
// Optional JSON body: { "files": ["a.docx"], "premium": true } — omit files = all docs.
func (h *Handler) StartGenerate(w http.ResponseWriter, r *http.Request) {
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
	if h.Jobs == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "jobs unavailable")
		return
	}
	var onlyFiles []string
	premium := false
	if r.Body != nil {
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		raw = []byte(strings.TrimSpace(string(raw)))
		if len(raw) > 0 {
			var body struct {
				Files   []string `json:"files"`
				Premium bool     `json:"premium"`
			}
			if err := json.Unmarshal(raw, &body); err != nil {
				httpx.WriteError(w, http.StatusBadRequest, "invalid json")
				return
			}
			onlyFiles = body.Files
			premium = body.Premium
		}
	}
	jobID, err := h.Jobs.Start(r.Context(), h.Objects, owner, project, cid, onlyFiles, premium)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not start job")
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"jobId": jobID, "premium": premium})
}

// GetJob returns generate job status + logs (memory first, else S3 snapshot).
func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	jobID := chi.URLParam(r, "jobId")
	if h.Jobs == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "jobs unavailable")
		return
	}
	job, ok := h.Jobs.GetOrLoad(r.Context(), h.Objects, jobID, cid)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "job not found")
		return
	}
	if !h.canAccessOwner(r, caller, job.Owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, job)
}

// StopJob cancels an in-flight generate and marks the job stopped.
func (h *Handler) StopJob(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	jobID := chi.URLParam(r, "jobId")
	if h.Jobs == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "jobs unavailable")
		return
	}
	job, ok := h.Jobs.GetOrLoad(r.Context(), h.Objects, jobID, cid)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "job not found")
		return
	}
	if !h.canAccessOwner(r, caller, job.Owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	stopped, ok := h.Jobs.Stop(r.Context(), h.Objects, jobID, cid)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "job not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, stopped)
}

// ResumeJob starts a new generate for unfinished files from a stopped/failed job.
func (h *Handler) ResumeJob(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	jobID := chi.URLParam(r, "jobId")
	if h.Jobs == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "jobs unavailable")
		return
	}
	job, ok := h.Jobs.GetOrLoad(r.Context(), h.Objects, jobID, cid)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "job not found")
		return
	}
	if !h.canAccessOwner(r, caller, job.Owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	if job.State == "queued" || job.State == "running" {
		httpx.WriteError(w, http.StatusConflict, "job still running — stop it first")
		return
	}
	files := ResumeFiles(job)
	if len(files) == 0 && len(job.OnlyFiles) > 0 {
		files = append([]string(nil), job.OnlyFiles...)
	}
	newID, err := h.Jobs.Start(r.Context(), h.Objects, job.Owner, job.Project, cid, files, job.Premium)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not resume job")
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{
		"jobId":   newID,
		"premium": job.Premium,
		"files":   files,
		"resumedFrom": jobID,
	})
}

func s3WriteErrorMessage(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "accessdenied") || strings.Contains(msg, "not authorized") || strings.Contains(msg, "forbidden") {
		return fallback + " (S3 AccessDenied on evoice/ — attach IAM PutObject for eduardoos20260607/evoice/*)"
	}
	return fallback
}
