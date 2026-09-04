package apikeys

import (
	"net/http"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// DocsCatalog is the public machine-readable API surface (specs 057 + 061 + 068).
// Key create/list/revoke is UI-only and is intentionally omitted (no keyManagement).
// Agents must fetch this catalog first and craft requests from routes + payloadSchema.
type DocsCatalog struct {
	Version       string              `json:"version"`
	Title         string              `json:"title"`
	BaseHint      string              `json:"baseHint"`
	Auth          DocsAuth            `json:"auth"`
	RateLimit     DocsRateLimit       `json:"rateLimit"`
	Entitlements  DocsEntitlements    `json:"entitlements"`
	OwnerSafe     string              `json:"ownerSafe"`
	KeyPolicy     string              `json:"keyPolicy"`
	Skill         string              `json:"skill,omitempty"`
	AgentGuidance string              `json:"agentGuidance,omitempty"`
	Routes        []DocsRoute         `json:"routes"`
	PayloadSchema DocsPayloadSchema   `json:"payloadSchema"`
}

// DocsAuth describes Bearer API-key auth.
type DocsAuth struct {
	Header    string `json:"header"`
	Scheme    string `json:"scheme"`
	KeyPrefix string `json:"keyPrefix"`
	Notes     string `json:"notes"`
}

// DocsRateLimit describes per-key throttling.
type DocsRateLimit struct {
	RequestsPerMinute int    `json:"requestsPerMinute"`
	OnExceed          string `json:"onExceed"`
}

// DocsEntitlements summarizes required subscriptions.
type DocsEntitlements struct {
	APIProduct string `json:"apiProduct"`
	Notes      string `json:"notes"`
}

// DocsRoute is one documented HTTP route.
type DocsRoute struct {
	Method       string `json:"method"`
	Path         string `json:"path"`
	Auth         string `json:"auth"` // "api_key" | "jwt" | "none"
	Summary      string `json:"summary"`
	Body         string `json:"body,omitempty"`
	Requirements string `json:"requirements,omitempty"`
}

// DocsPayloadSchema documents the portable .ereport JSON for GET/POST (spec 068).
type DocsPayloadSchema struct {
	Description       string            `json:"description"`
	WriteSemantics    string            `json:"writeSemantics"`
	PostBody          string            `json:"postBody"`
	RootFields        map[string]string `json:"rootFields"`
	ItemFields        map[string]string `json:"itemFields"`
	StatusValues      []string          `json:"statusValues"`
	EffectiveStatus   string            `json:"effectiveStatus"`
	ReportCodeRule    string            `json:"reportCodeRule"`
	ViewURLTemplate   string            `json:"viewUrlTemplate"`
	ExampleRootSketch map[string]any    `json:"exampleRootSketch"`
}

// BuildDocsCatalog returns the locked v1 external API catalog.
func BuildDocsCatalog() DocsCatalog {
	return DocsCatalog{
		Version:  "1",
		Title:    "Eduardo OS external API",
		BaseHint: "https://eduardoos.com (or your deployed origin); all paths are absolute from that host",
		Auth: DocsAuth{
			Header:    "Authorization",
			Scheme:    "Bearer",
			KeyPrefix: SecretPrefix,
			Notes:     "Create keys only in the signed-in UI (/auth/profile or /api-keys) after subscribing to api. Secret shown once. Never create/revoke keys from external API clients. Platform admin must still create a key; admin bypasses product entitlements after auth.",
		},
		RateLimit: DocsRateLimit{
			RequestsPerMinute: DefaultRateLimit,
			OnExceed:          "HTTP 429 with Retry-After",
		},
		Entitlements: DocsEntitlements{
			APIProduct: "api",
			Notes:      "Non-admin: active api entitlement plus the target product (e.g. ereport). Scope follows the key owner's subscriptions at request time. Writes only for reports owned by the key owner.",
		},
		OwnerSafe: "Lowercase email with @ replaced by _at_ (e.g. you@example.com → you_at_example.com)",
		KeyPolicy: "API keys are created, listed, and revoked only in the Eduardo OS UI (Profile or API keys page). Key lifecycle is not part of the external API.",
		Skill:     "https://github.com/EduardoOsteicoechea/eduardoos-ereport-connector — clone as .ereport/ sidecar; skill + thin CLI. Caveats in skill/CAVEATS.md. API rate limit 60/min/key. Mirror: https://eduardoos.com/skills/eduardoos-ereport/",
		AgentGuidance: "1) Require EDUARDOOS_API_KEY. 2) ALWAYS GET /api/v1/docs first and follow this catalog (do not invent endpoints or payload fields). 3) Ordered eReport flow: access → orgs → orgs/{orgId}/reports → GET report → add only new open issues → POST. 4) API POST is additive for issues (spec 070): cannot modify/delete existing items/sections; new items need non-empty incidencia + status reprobado. 5) Always print viewUrl after write.",
		Routes: []DocsRoute{
			{
				Method:  http.MethodGet,
				Path:    "/api/v1/docs",
				Auth:    "none",
				Summary: "This catalog (public). Fetch first; includes payloadSchema for .ereport JSON.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/access",
				Auth:         "api_key",
				Summary:      "Step 1 — check eReport API access for this key.",
				Requirements: "api + ereport (or admin). Returns allowed, email, ownerSafe.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/orgs",
				Auth:         "api_key",
				Summary:      "Step 2 — list owned organizations (same as the eReport hub Orgs).",
				Requirements: "Hidden orgs omitted. Use org id for step 3.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/orgs/{orgId}/reports",
				Auth:         "api_key",
				Summary:      "Step 3 — list reports inside one org (ids for edit).",
				Requirements: "Returns id, tema, reportNumber, updatedAt per report.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/orgs/{orgId}/reports/{reportId}",
				Auth:         "api_key",
				Summary:      "Step 4a — read one org report (meta + full payload + viewUrl).",
				Requirements: "Response includes viewUrl, ownerSafe, orgId, reportId, payload. Dates fechaIncidencia/fechaSolucion round-trip as sent. See payloadSchema.",
			},
			{
				Method:       http.MethodPost,
				Path:         "/api/v1/ereport/orgs/{orgId}/reports/{reportId}",
				Auth:         "api_key",
				Summary:      "Step 4b — additive write: append new open issues / new sections (server merges).",
				Body:         `{"confirmOverwrite":true,"tema":"optional","payload":{ /* get payload + only new items/sections — see payloadSchema */ }}`,
				Requirements: "confirmOverwrite must be JSON true. payload required. Server merges onto stored report: existing item ids cannot change; new items require non-empty incidencia and status reprobado. Response includes merged payload + viewUrl. See payloadSchema.writeSemantics.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/library",
				Auth:         "api_key",
				Summary:      "Alias: orgs + legacyReports (prefer /orgs flow).",
			},
		},
		PayloadSchema: DocsPayloadSchema{
			Description:    "Portable Issue Tracker / .ereport JSON stored under the report. Opaque to the server except meta mirrors for reportDate + reportNumber + tema, and additive merge rules on API-key POST (spec 070).",
			WriteSemantics: "API-key POST is NOT a full client replace of issues. Server loads the stored report and merges: existing section/group/item ids cannot be modified or removed (400 if the client sends a changed copy of an existing item). Allowed: append new items to existing sections/groups; append new sections with new items. Every NEW item must have non-empty trimmed incidencia text and status exactly \"reprobado\". Root meta fields (orgName, reportName, reportDate, reportNumber, validationCriteria, theme, …) may update. JWT web editor remains full-edit. Always GET before POST. confirmOverwrite:true still required.",
			PostBody:       `{"confirmOverwrite":true,"tema":"optional string used as library title","payload":{ /* stored report + new open issues only */ }}`,
			RootFields: map[string]string{
				"orgName":             "Organization display name (string).",
				"reportName":          "Report title (string); usually synced with appTitle.",
				"appTitle":            "Legacy/display title; keep in sync with reportName.",
				"reportDate":          "Report Date (YYYY-MM-DD).",
				"reportNumber":        "Report Code. UI auto: sanitize(reportName)_YYYYMMDD_HHMMSS; agents may set explicitly.",
				"validationCriteria":  "string[] of criteria labels (e.g. RVT2025). Empty = only main status applies.",
				"theme":               "light | dark.",
				"collapse":            "optional { sections, groups, items } id lists.",
				"sections":            "array of { id, title, kind, groups[] }.",
				"sections[].groups":   "array of { id, title, items[] }.",
				"sections[].groups[].items": "array of issue objects (see itemFields).",
			},
			ItemFields: map[string]string{
				"id":               "stable item id",
				"nombre":           "short issue name",
				"incidencia":       "issue description",
				"fechaIncidencia":  "issue datetime (preserve on merge)",
				"solucion":         "resolution text",
				"fechaSolucion":    "resolution datetime (preserve on merge)",
				"status":           "main accept/reject/disable: aprobado | reprobado | no_aplica | \"\"",
				"criteriaStatus":   "object map label → aprobado|reprobado|no_aplica|\"\" for each validationCriteria entry",
				"imagesIncidencia": "array of { name, mime, dataUrl }",
				"imagesSolucion":   "array of { name, mime, dataUrl }",
				"images":           "alias of imagesSolucion (keep in sync)",
			},
			StatusValues: []string{"aprobado", "reprobado", "no_aplica", ""},
			EffectiveStatus: "If validationCriteria is empty OR any criteriaStatus[label] is unset/\"\": effective = item.status. Else (all set): all no_aplica → no_aplica; any reprobado → reprobado; ≥1 aprobado and every other is no_aplica → aprobado; otherwise effective = item.status. Nav/PDF/progress use effective status.",
			ReportCodeRule:  "UI: reportNumber = sanitize(reportName||appTitle||\"Report\") + \"_\" + YYYYMMDD_HHMMSS (local), updated every second, readonly. Persist reportNumber in payload; meta.json mirrors reportNumber + reportDate.",
			ViewURLTemplate: "{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}",
			ExampleRootSketch: map[string]any{
				"orgName":            "Acme",
				"reportName":         "Issue Tracker",
				"appTitle":           "Issue Tracker",
				"reportDate":         "2026-09-04",
				"reportNumber":       "Issue_Tracker_20260904_120000",
				"validationCriteria": []any{"RVT2025", "RVT2026"},
				"theme":              "dark",
				"sections": []any{
					map[string]any{
						"id":    "section-a",
						"title": "1. Product / platform",
						"kind":  "funcionalidades",
						"groups": []any{
							map[string]any{
								"id":    "group-1",
								"title": "General",
								"items": []any{
									map[string]any{
										"id":              "group-1-item-1",
										"nombre":          "",
										"incidencia":      "",
										"fechaIncidencia": "",
										"status":          "",
										"criteriaStatus":  map[string]any{"RVT2025": "", "RVT2026": ""},
										"solucion":        "",
										"fechaSolucion":   "",
										"imagesIncidencia": []any{},
										"imagesSolucion":   []any{},
										"images":           []any{},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

// RoutesPublicDocs mounts GET /api/v1/docs without API-key middleware.
func (h *Handler) RoutesPublicDocs(r chi.Router) {
	r.Get("/api/v1/docs", h.GetDocs)
}

// GetDocs serves the public JSON API catalog.
func (h *Handler) GetDocs(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, BuildDocsCatalog())
}
