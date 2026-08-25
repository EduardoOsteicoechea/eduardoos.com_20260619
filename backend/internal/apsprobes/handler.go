// Package apsprobes serves isolated MPS meeting probe endpoints (MPSAPS-21).
// Each probe is try/catch isolated; the HTTP wrapper returns 200 with a
// structured result even when underlying APS calls fail.
package apsprobes

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"eduardoos.nex/internal/apswebhook"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const probeTimeout = 25 * time.Second

// Result is the stable meeting-probe response contract.
type Result struct {
	OK         bool           `json:"ok"`
	ProbeID    string         `json:"probeId"`
	Title      string         `json:"title"`
	StartedAt  time.Time      `json:"startedAt"`
	FinishedAt time.Time      `json:"finishedAt"`
	Summary    string         `json:"summary"`
	Details    map[string]any `json:"details"`
	NextStep   string         `json:"nextStep"`
	HTTPStatus int            `json:"httpStatus,omitempty"`
}

// CatalogEntry describes a probe for the FE.
type CatalogEntry struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

// Options are optional overrides from query/body.
type Options struct {
	HubID     string `json:"hubId"`
	ProjectID string `json:"projectId"`
	Region    string `json:"region"`
}

// Handler mounts admin-only probe routes.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	Webhooks  *apswebhook.Handler
	auth      *auth.Handler
	baseURL   string // for health self-check, e.g. http://127.0.0.1:3001
}

// NewHandler wires probes against auth + the live webhook monitor store.
func NewHandler(jwtSecret string, users auth.UserStore, webhooks *apswebhook.Handler) *Handler {
	addr := httpx.Env("ADDR", ":3001")
	if !strings.HasPrefix(addr, ":") && !strings.Contains(addr, "://") {
		addr = ":" + addr
	}
	base := "http://127.0.0.1" + addr
	if strings.HasPrefix(addr, "http") {
		base = addr
	}
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Webhooks:  webhooks,
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
		baseURL:   base,
	}
}

// Routes mounts catalog + per-probe POST under /api/admin/aps/probes.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Use(h.requireAdmin)
		r.Get("/api/admin/aps/probes", h.Catalog)
		r.Post("/api/admin/aps/probes/{probeId}", h.Run)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
				role = u.Role
			}
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func catalog() []CatalogEntry {
	return []CatalogEntry{
		{ID: "health", Title: "Eduardo health", Description: "Eduardo API /health responds."},
		{ID: "env-check", Title: "Env check", Description: "Required APS env vars present (booleans only)."},
		{ID: "aps-token", Title: "APS 2LO token", Description: "Obtain client_credentials token; never return the token."},
		{ID: "webhook-ingest-get", Title: "Webhook ingest GET", Description: "Probe GET /api/aps/webhooks."},
		{ID: "webhook-ingest-post-synthetic", Title: "Webhook SYNC_COMPLETE", Description: "POST synthetic model.sync SYNC_COMPLETE; confirm monitor store."},
		{ID: "webhook-ignore-sync-start", Title: "Webhook SYNC_START", Description: "POST SYNC_START; confirm stored-only (no DA trigger)."},
		{ID: "hubs-list", Title: "Hubs list", Description: "Data Management hubs visible to the app."},
		{ID: "projects-list", Title: "Projects list", Description: "Projects for configured hub."},
		{ID: "docs-smoke", Title: "Docs smoke", Description: "Read top folders for a project (Custom Integration Docs)."},
		{ID: "admin-project-params", Title: "Admin project params", Description: "Admin API parameters; verbose 403 diagnosis."},
		{ID: "hooks-list-c4r", Title: "List c4r hooks", Description: "Read-only list adsk.c4r model.sync webhooks."},
	}
}

// Catalog lists probes for the meeting console.
func (h *Handler) Catalog(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"probes":            catalog(),
		"defaultCallback":   "https://eduardoos.com/api/aps/webhooks",
		"webhookSecretNote": "Eduardo X-Aps-Webhook-Secret ≠ APS x-adsk-signature",
	})
}

// Run executes one probe in isolation.
func (h *Handler) Run(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	probeID := strings.TrimSpace(chi.URLParam(r, "probeId"))
	started := time.Now().UTC()
	opts := parseOptions(r)

	log.Printf("[correlation=%s] aps.probe.begin id=%s hub=%q project=%q",
		cid, probeID, opts.HubID, opts.ProjectID)

	ctx, cancel := context.WithTimeout(r.Context(), probeTimeout)
	defer cancel()

	var res Result
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				res = failResult(probeID, titleFor(probeID),
					fmt.Sprintf("probe panicked: %v", rec),
					map[string]any{"panic": fmt.Sprint(rec)},
					"Fix Eduardo probe code; this wrapper prevented process crash.",
					0)
			}
		}()
		res = h.runProbe(ctx, probeID, opts)
	}()

	res.StartedAt = started
	res.FinishedAt = time.Now().UTC()
	if res.ProbeID == "" {
		res.ProbeID = probeID
	}
	if res.Details == nil {
		res.Details = map[string]any{}
	}
	res.Details["correlationId"] = cid
	res.Details["durationMs"] = res.FinishedAt.Sub(started).Milliseconds()

	log.Printf("[correlation=%s] aps.probe.end id=%s ok=%v summary=%q",
		cid, probeID, res.OK, res.Summary)

	// Wrapper always 200 for probe outcomes; 503 only if Eduardo wiring missing for unknown id.
	status := http.StatusOK
	if probeID == "" {
		status = http.StatusBadRequest
	}
	httpx.WriteJSON(w, status, res)
}

func parseOptions(r *http.Request) Options {
	opts := Options{
		HubID:     strings.TrimSpace(r.URL.Query().Get("hubId")),
		ProjectID: strings.TrimSpace(r.URL.Query().Get("projectId")),
		Region:    strings.TrimSpace(r.URL.Query().Get("region")),
	}
	if r.Body != nil {
		var body Options
		dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
		if err := dec.Decode(&body); err == nil {
			if strings.TrimSpace(body.HubID) != "" {
				opts.HubID = strings.TrimSpace(body.HubID)
			}
			if strings.TrimSpace(body.ProjectID) != "" {
				opts.ProjectID = strings.TrimSpace(body.ProjectID)
			}
			if strings.TrimSpace(body.Region) != "" {
				opts.Region = strings.TrimSpace(body.Region)
			}
		}
	}
	if opts.HubID == "" {
		opts.HubID = strings.TrimSpace(os.Getenv("APS_HUB_ID"))
	}
	if opts.ProjectID == "" {
		opts.ProjectID = strings.TrimSpace(os.Getenv("APS_PROJECT_ID"))
	}
	if opts.Region == "" {
		opts.Region = strings.TrimSpace(httpx.Env("APS_REGION", "US"))
	}
	return opts
}

func titleFor(id string) string {
	for _, e := range catalog() {
		if e.ID == id {
			return e.Title
		}
	}
	return id
}

func okResult(id, title, summary string, details map[string]any, next string) Result {
	return Result{OK: true, ProbeID: id, Title: title, Summary: summary, Details: details, NextStep: next}
}

func failResult(id, title, startedMsg string, details map[string]any, next string, httpStatus int) Result {
	_ = startedMsg
	return Result{
		OK: false, ProbeID: id, Title: title, Summary: startedMsg,
		Details: details, NextStep: next, HTTPStatus: httpStatus,
	}
}

func (h *Handler) runProbe(ctx context.Context, id string, opts Options) Result {
	title := titleFor(id)
	switch id {
	case "health":
		return h.probeHealth(ctx)
	case "env-check":
		return h.probeEnv()
	case "aps-token":
		return h.probeToken(ctx)
	case "webhook-ingest-get":
		return h.probeWebhookGET(ctx)
	case "webhook-ingest-post-synthetic":
		return h.probeWebhookSynthetic(ctx, "SYNC_COMPLETE")
	case "webhook-ignore-sync-start":
		return h.probeWebhookSynthetic(ctx, "SYNC_START")
	case "hubs-list":
		return h.probeHubs(ctx)
	case "projects-list":
		return h.probeProjects(ctx, opts)
	case "docs-smoke":
		return h.probeDocs(ctx, opts)
	case "admin-project-params":
		return h.probeAdminParams(ctx, opts)
	case "hooks-list-c4r":
		return h.probeHooks(ctx)
	default:
		return failResult(id, title, "unknown probeId",
			map[string]any{"known": catalogIDs()},
			"Use an id from GET /api/admin/aps/probes.", 0)
	}
}

func catalogIDs() []string {
	out := make([]string, 0, 11)
	for _, e := range catalog() {
		out = append(out, e.ID)
	}
	return out
}

func (h *Handler) probeHealth(ctx context.Context) Result {
	id, title := "health", titleFor("health")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.baseURL+"/health", nil)
	if err != nil {
		return failResult(id, title, "could not build health request", map[string]any{"error": err.Error()},
			"Check ADDR/PORT for the Eduardo process.", 0)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return failResult(id, title, "health request failed", map[string]any{"error": err.Error(), "url": h.baseURL + "/health"},
			"Ensure the Eduardo backend is listening.", 0)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	ok := res.StatusCode >= 200 && res.StatusCode < 300
	details := map[string]any{"status": res.StatusCode, "bodyPreview": truncate(string(body), 500)}
	if !ok {
		return failResult(id, title, fmt.Sprintf("health HTTP %d", res.StatusCode), details,
			"Backend /health is unhealthy — check process logs.", res.StatusCode)
	}
	return okResult(id, title, "Eduardo /health OK", details, "Continue with env-check.")
}

func (h *Handler) probeEnv() Result {
	id, title := "env-check", titleFor("env-check")
	details := map[string]any{
		"APS_CLIENT_ID_set":     envSet("APS_CLIENT_ID"),
		"APS_CLIENT_SECRET_set": envSet("APS_CLIENT_SECRET"),
		"APS_WEBHOOK_SECRET_set": envSet("APS_WEBHOOK_SECRET"),
		"APS_HUB_ID_set":        envSet("APS_HUB_ID"),
		"APS_PROJECT_ID_set":    envSet("APS_PROJECT_ID"),
		"APS_REGION":            httpx.Env("APS_REGION", "US"),
		"APS_OAUTH_SCOPE_set":   envSet("APS_OAUTH_SCOPE"),
		"note":                  "Secret values are never returned.",
	}
	ok := envSet("APS_CLIENT_ID") && envSet("APS_CLIENT_SECRET")
	if !ok {
		return failResult(id, title, "missing APS_CLIENT_ID and/or APS_CLIENT_SECRET", details,
			"Set APS_CLIENT_ID and APS_CLIENT_SECRET on the Eduardo server env (never in the browser).", 0)
	}
	return okResult(id, title, "Required APS client credentials present", details,
		"Optional: APS_HUB_ID / APS_PROJECT_ID for defaults; APS_WEBHOOK_SECRET for ingest auth.")
}

func envSet(key string) bool {
	return strings.TrimSpace(os.Getenv(key)) != ""
}

func (h *Handler) probeToken(ctx context.Context) Result {
	id, title := "aps-token", titleFor("aps-token")
	scope := httpx.Env("APS_OAUTH_SCOPE", "data:read data:write account:read")
	tok, meta, err := fetchToken(ctx, scope)
	if err != nil {
		return failResult(id, title, "2LO token failed", meta,
			"Check Client ID/Secret in APS portal; confirm app type allows client_credentials; verify scopes.",
			statusFromDetails(meta))
	}
	_ = tok // never return
	meta["tokenReturned"] = false
	meta["tokenLength"] = len(tok)
	meta["requestedScope"] = scope
	return okResult(id, title, "2LO token obtained (not shown)", meta, "Continue with hubs-list / webhook probes.")
}

func (h *Handler) probeWebhookGET(ctx context.Context) Result {
	id, title := "webhook-ingest-get", titleFor("webhook-ingest-get")
	u := h.baseURL + "/api/aps/webhooks"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return failResult(id, title, "build GET failed", map[string]any{"error": err.Error()}, "Fix base URL.", 0)
	}
	if h.Webhooks != nil && h.Webhooks.SecretConfigured() {
		req.Header.Set("X-Aps-Webhook-Secret", os.Getenv("APS_WEBHOOK_SECRET"))
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return failResult(id, title, "GET ingest failed", map[string]any{"error": err.Error()},
			"Ensure /api/aps/webhooks is mounted.", 0)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	details := map[string]any{
		"status":           res.StatusCode,
		"bodyPreview":      truncate(string(body), 800),
		"secretConfigured": h.Webhooks != nil && h.Webhooks.SecretConfigured(),
		"note":             "X-Aps-Webhook-Secret is Eduardo's shared secret; APS x-adsk-signature is separate.",
	}
	if res.StatusCode != http.StatusOK {
		return failResult(id, title, fmt.Sprintf("ingest GET HTTP %d", res.StatusCode), details,
			"If 401, set matching X-Aps-Webhook-Secret / APS_WEBHOOK_SECRET.", res.StatusCode)
	}
	return okResult(id, title, "Ingest GET ready", details, "Run webhook-ingest-post-synthetic next.")
}

func (h *Handler) probeWebhookSynthetic(ctx context.Context, state string) Result {
	_ = ctx
	id := "webhook-ingest-post-synthetic"
	if state == "SYNC_START" {
		id = "webhook-ignore-sync-start"
	}
	title := titleFor(id)
	if h.Webhooks == nil {
		return failResult(id, title, "webhook handler not wired", map[string]any{},
			"Wire apswebhook.Handler into apsprobes.", 0)
	}
	marker := fmt.Sprintf("meeting-probe-%s-%d", state, time.Now().UnixNano())
	payload := map[string]any{
		"hook": map[string]any{
			"system": "adsk.c4r",
			"event":  "model.sync",
		},
		"payload": map[string]any{
			"state":  state,
			"source": "meeting-probe",
			"marker": marker,
			"name":   "meeting-probe-synthetic.rvt",
		},
	}
	ev := h.Webhooks.PushMeetingProbeEvent(payload, "post")
	found, ok := h.Webhooks.FindEventContaining(marker)
	details := map[string]any{
		"state":           state,
		"marker":          marker,
		"pushedEventId":   ev.ID,
		"foundInStore":    ok,
		"foundEventId":    found.ID,
		"disposition":     "stored_in_monitor",
		"triggersDA":      false,
		"currentBehavior": "All POSTs are stored and displayed; no Design Automation worker is wired yet.",
	}
	if !ok {
		return failResult(id, title, "synthetic event not found in monitor store", details,
			"Check apswebhook ring buffer / PushMeetingProbeEvent wiring.", 0)
	}
	summary := fmt.Sprintf("%s stored in monitor (id=%s)", state, found.ID[:8])
	next := "Open /product-tests/mps/aps-webhook — event should appear (newest first)."
	if state == "SYNC_START" {
		next = "SYNC_START is stored only; it does not trigger DA. Treat SYNC_COMPLETE as the meaningful sync signal when a worker exists."
	}
	return okResult(id, title, summary, details, next)
}

func (h *Handler) probeHubs(ctx context.Context) Result {
	id, title := "hubs-list", titleFor("hubs-list")
	tok, meta, err := fetchToken(ctx, defaultScope())
	if err != nil {
		return failResult(id, title, "token failed before hubs", meta, "Fix aps-token first.", statusFromDetails(meta))
	}
	status, body, err := apsGET(ctx, tok, "https://developer.api.autodesk.com/project/v1/hubs")
	details := map[string]any{"httpStatus": status, "bodyPreview": truncate(redactJSON(body), 2000)}
	if err != nil {
		details["error"] = err.Error()
		return failResult(id, title, "hubs request error", details, "Check network / APS status.", 0)
	}
	if status >= 400 {
		return failResult(id, title, fmt.Sprintf("hubs HTTP %d", status), details,
			"Confirm Custom Integration on the ACC hub and data:read scope; Account Admin → Custom Integrations.", status)
	}
	details["hubCountHint"] = strings.Count(body, `"id"`)
	return okResult(id, title, "Hubs list OK", details, "Set APS_HUB_ID to a hub id from this list for projects-list.")
}

func (h *Handler) probeProjects(ctx context.Context, opts Options) Result {
	id, title := "projects-list", titleFor("projects-list")
	if opts.HubID == "" {
		return failResult(id, title, "hubId required", map[string]any{"hint": "Pass hubId or set APS_HUB_ID"},
			"Run hubs-list, copy a hub id, set APS_HUB_ID or the form field.", 0)
	}
	tok, meta, err := fetchToken(ctx, defaultScope())
	if err != nil {
		return failResult(id, title, "token failed", meta, "Fix aps-token.", statusFromDetails(meta))
	}
	u := "https://developer.api.autodesk.com/project/v1/hubs/" + url.PathEscape(opts.HubID) + "/projects"
	status, body, err := apsGET(ctx, tok, u)
	details := map[string]any{"hubId": opts.HubID, "httpStatus": status, "bodyPreview": truncate(redactJSON(body), 2000)}
	if err != nil {
		details["error"] = err.Error()
		return failResult(id, title, "projects request error", details, "Check hub id format.", 0)
	}
	if status >= 400 {
		return failResult(id, title, fmt.Sprintf("projects HTTP %d", status), details,
			"Verify hub id and Custom Integration; app must see the hub.", status)
	}
	return okResult(id, title, "Projects list OK", details, "Set APS_PROJECT_ID for docs-smoke / admin-project-params.")
}

func (h *Handler) probeDocs(ctx context.Context, opts Options) Result {
	id, title := "docs-smoke", titleFor("docs-smoke")
	if opts.HubID == "" || opts.ProjectID == "" {
		return failResult(id, title, "hubId and projectId required",
			map[string]any{"hubId": opts.HubID, "projectId": opts.ProjectID},
			"Fill hubId + projectId (or APS_HUB_ID / APS_PROJECT_ID).", 0)
	}
	tok, meta, err := fetchToken(ctx, defaultScope())
	if err != nil {
		return failResult(id, title, "token failed", meta, "Fix aps-token.", statusFromDetails(meta))
	}
	// Top folders for the project.
	u := fmt.Sprintf("https://developer.api.autodesk.com/project/v1/hubs/%s/projects/%s/topFolders",
		url.PathEscape(opts.HubID), url.PathEscape(opts.ProjectID))
	status, body, err := apsGET(ctx, tok, u)
	details := map[string]any{
		"hubId": opts.HubID, "projectId": opts.ProjectID,
		"httpStatus": status, "bodyPreview": truncate(redactJSON(body), 2000),
	}
	if err != nil {
		details["error"] = err.Error()
		return failResult(id, title, "docs request error", details, "Retry; check APS status.", 0)
	}
	if status >= 400 {
		return failResult(id, title, fmt.Sprintf("docs HTTP %d", status), details,
			"Custom Integration may lack Docs access, or project id wrong. Account Admin → Custom Integrations + project membership.", status)
	}
	return okResult(id, title, "Docs topFolders OK", details, "Docs access looks good for this project.")
}

func (h *Handler) probeAdminParams(ctx context.Context, opts Options) Result {
	id, title := "admin-project-params", titleFor("admin-project-params")
	if opts.ProjectID == "" {
		return failResult(id, title, "projectId required", map[string]any{},
			"Pass projectId query/body or APS_PROJECT_ID.", 0)
	}
	scope := defaultScope()
	if !strings.Contains(scope, "account:read") {
		scope = strings.TrimSpace(scope + " account:read")
	}
	tok, meta, err := fetchToken(ctx, scope)
	if err != nil {
		return failResult(id, title, "token failed", meta, "Fix aps-token / scopes.", statusFromDetails(meta))
	}
	// ACC Admin API — project parameters (region-aware base).
	base := "https://developer.api.autodesk.com/hq/v1"
	if strings.EqualFold(opts.Region, "EMEA") || strings.EqualFold(opts.Region, "EU") {
		base = "https://developer.api.autodesk.com/hq/v1"
	}
	u := fmt.Sprintf("%s/accounts/projects/%s", base, url.PathEscape(stripProjectPrefix(opts.ProjectID)))
	status, body, err := apsGET(ctx, tok, u)
	details := map[string]any{
		"projectId": opts.ProjectID, "region": opts.Region,
		"httpStatus": status, "bodyPreview": truncate(redactJSON(body), 2000),
		"requestedScope": scope,
	}
	if err != nil {
		details["error"] = err.Error()
		return failResult(id, title, "admin request error", details, "Retry.", 0)
	}
	if status == http.StatusForbidden || status == http.StatusUnauthorized {
		return failResult(id, title, fmt.Sprintf("Admin API HTTP %d — not empty fields", status), details,
			"Admin not provisioned for this app: enable account:read scope, add Custom Integration on the ACC Account Admin hub, and ensure the app can administer the account/project. This is NOT 'empty parameters'.",
			status)
	}
	if status >= 400 {
		return failResult(id, title, fmt.Sprintf("admin HTTP %d", status), details,
			"Verify project id format and Admin API access.", status)
	}
	return okResult(id, title, "Admin project read OK", details, "Admin API reachable for this project.")
}

func (h *Handler) probeHooks(ctx context.Context) Result {
	id, title := "hooks-list-c4r", titleFor("hooks-list-c4r")
	tok, meta, err := fetchToken(ctx, defaultScope()+" data:read")
	if err != nil {
		return failResult(id, title, "token failed", meta, "Fix aps-token.", statusFromDetails(meta))
	}
	u := "https://developer.api.autodesk.com/webhooks/v1/systems/adsk.c4r/events/model.sync/hooks"
	status, body, err := apsGET(ctx, tok, u)
	details := map[string]any{
		"httpStatus":  status,
		"bodyPreview": truncate(redactJSON(body), 3000),
		"system":      "adsk.c4r",
		"event":       "model.sync",
	}
	if err != nil {
		details["error"] = err.Error()
		return failResult(id, title, "hooks list error", details, "Retry.", 0)
	}
	if status >= 400 {
		return failResult(id, title, fmt.Sprintf("hooks HTTP %d", status), details,
			"App may lack webhooks scope or no hooks exist yet. Create hooks pointing to https://eduardoos.com/api/aps/webhooks.", status)
	}
	return okResult(id, title, "c4r model.sync hooks listed (read-only)", details,
		"Confirm callbackUrl includes https://eduardoos.com/api/aps/webhooks.")
}

func defaultScope() string {
	return httpx.Env("APS_OAUTH_SCOPE", "data:read data:write account:read")
}

func stripProjectPrefix(id string) string {
	id = strings.TrimSpace(id)
	if i := strings.LastIndex(id, "."); i >= 0 && i+1 < len(id) {
		// b.projectid → projectid for some Admin APIs
		return id[i+1:]
	}
	return id
}

func fetchToken(ctx context.Context, scope string) (token string, meta map[string]any, err error) {
	meta = map[string]any{"requestedScope": scope}
	id := strings.TrimSpace(os.Getenv("APS_CLIENT_ID"))
	secret := strings.TrimSpace(os.Getenv("APS_CLIENT_SECRET"))
	meta["clientIdSet"] = id != ""
	meta["clientSecretSet"] = secret != ""
	if id == "" || secret == "" {
		return "", meta, fmt.Errorf("APS_CLIENT_ID / APS_CLIENT_SECRET missing")
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", id)
	form.Set("client_secret", secret)
	form.Set("scope", scope)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://developer.api.autodesk.com/authentication/v2/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", meta, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", meta, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	meta["httpStatus"] = res.StatusCode
	meta["bodyPreview"] = truncate(redactJSON(string(raw)), 800)
	if res.StatusCode >= 400 {
		return "", meta, fmt.Errorf("token HTTP %d", res.StatusCode)
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", meta, err
	}
	if parsed.AccessToken == "" {
		return "", meta, fmt.Errorf("empty access_token")
	}
	meta["expiresIn"] = parsed.ExpiresIn
	meta["tokenType"] = parsed.TokenType
	return parsed.AccessToken, meta, nil
}

func apsGET(ctx context.Context, token, rawURL string) (status int, body string, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return res.StatusCode, string(b), nil
}

func statusFromDetails(meta map[string]any) int {
	if meta == nil {
		return 0
	}
	if v, ok := meta["httpStatus"].(int); ok {
		return v
	}
	return 0
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func redactJSON(s string) string {
	// Strip common secret field values without needing full parse.
	out := s
	for _, key := range []string{"access_token", "client_secret", "refresh_token", "private_key"} {
		out = redactKey(out, key)
	}
	return out
}

func redactKey(s, key string) string {
	// naive "key":"...." redaction
	needle := `"` + key + `"`
	for {
		i := strings.Index(strings.ToLower(s), strings.ToLower(needle))
		if i < 0 {
			return s
		}
		// find following "value"
		rest := s[i+len(needle):]
		colon := strings.Index(rest, ":")
		if colon < 0 {
			return s
		}
		rest = rest[colon+1:]
		rest = strings.TrimLeft(rest, " \t\n\r")
		if !strings.HasPrefix(rest, `"`) {
			return s
		}
		end := 1
		for end < len(rest) {
			if rest[end] == '"' && rest[end-1] != '\\' {
				break
			}
			end++
		}
		if end >= len(rest) {
			return s[:i+len(needle)] + `: "[REDACTED]"` + rest
		}
		s = s[:i+len(needle)] + `: "[REDACTED]"` + rest[end+1:]
	}
}
