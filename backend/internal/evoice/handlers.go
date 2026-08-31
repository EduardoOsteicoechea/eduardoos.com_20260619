// Package evoice HTTP handlers — JWT + entitlement/allowlist/admin (spec 044).
package evoice

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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
		pr.Delete("/api/evoice/projects/{ownerSafe}/{project}/docs/{name}", h.DeleteDoc)
		pr.Get("/api/evoice/projects/{ownerSafe}/{project}/audios", h.ListAudios)
		pr.Get("/api/evoice/file/{ownerSafe}/{project}/{kind}/{name}", h.GetFile)
		pr.Head("/api/evoice/file/{ownerSafe}/{project}/{kind}/{name}", h.GetFile)
		pr.Post("/api/evoice/projects/{ownerSafe}/{project}/generate", h.StartGenerate)
		pr.Get("/api/evoice/jobs/{jobId}", h.GetJob)
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
		if n == ProjectMarkerName || n == ".keep" {
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
		meta := ObjectMeta{
			Name: name,
			Key:  o.Key,
			Size: o.Size,
			URL: fmt.Sprintf("/api/evoice/file/%s/%s/%s/%s",
				owner, project, kind, path.Base(name)),
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
		"url": fmt.Sprintf("/api/evoice/file/%s/%s/docs/%s", owner, project, name),
	})
}

// DeleteDoc removes one document from docs/.
func (h *Handler) DeleteDoc(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	name := sanitizeFileName(chi.URLParam(r, "name"))
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

// GetFile streams a docs/ or audios/ object (supports Range for audio seek).
func (h *Handler) GetFile(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	kind := chi.URLParam(r, "kind")
	name := sanitizeFileName(chi.URLParam(r, "name"))
	if !ValidProjectName(project) || !ValidFileName(name) || (kind != "docs" && kind != "audios") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid path")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var key string
	if kind == "docs" {
		key = DocKey(owner, project, name)
	} else {
		key = AudioKey(owner, project, name)
	}
	rangeHdr := strings.TrimSpace(r.Header.Get("Range"))
	body, ct, length, contentRange, err := h.Objects.OpenStream(r.Context(), key, rangeHdr, cid)
	if err != nil {
		if isNotFound(err) || strings.Contains(strings.ToLower(err.Error()), "not found") {
			httpx.WriteError(w, http.StatusNotFound, "file not found")
			return
		}
		log.Printf("[correlation=%s] evoice.file: %v", cid, err)
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
// Optional JSON body: { "files": ["a.docx"] } — omit or empty = all docs.
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
	if r.Body != nil {
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		raw = []byte(strings.TrimSpace(string(raw)))
		if len(raw) > 0 {
			var body struct {
				Files []string `json:"files"`
			}
			if err := json.Unmarshal(raw, &body); err != nil {
				httpx.WriteError(w, http.StatusBadRequest, "invalid json")
				return
			}
			onlyFiles = body.Files
		}
	}
	jobID, err := h.Jobs.Start(r.Context(), h.Objects, owner, project, cid, onlyFiles)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not start job")
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"jobId": jobID})
}

// GetJob returns generate job status + logs.
func (h *Handler) GetJob(w http.ResponseWriter, r *http.Request) {
	caller := auth.UserEmailFromRequest(r)
	jobID := chi.URLParam(r, "jobId")
	if h.Jobs == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "jobs unavailable")
		return
	}
	job, ok := h.Jobs.Get(jobID)
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
