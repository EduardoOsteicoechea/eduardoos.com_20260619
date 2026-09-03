package apikeys

import (
	"net/http"

	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// DocsCatalog is the public machine-readable API surface (spec 057).
type DocsCatalog struct {
	Version      string         `json:"version"`
	Title        string         `json:"title"`
	BaseHint     string         `json:"baseHint"`
	Auth         DocsAuth       `json:"auth"`
	RateLimit    DocsRateLimit  `json:"rateLimit"`
	Entitlements DocsEntitlements `json:"entitlements"`
	OwnerSafe    string         `json:"ownerSafe"`
	Routes       []DocsRoute    `json:"routes"`
	KeyMgmt      []DocsRoute    `json:"keyManagement"`
}

// DocsAuth describes Bearer API-key auth.
type DocsAuth struct {
	Header string `json:"header"`
	Scheme string `json:"scheme"`
	KeyPrefix string `json:"keyPrefix"`
	Notes  string `json:"notes"`
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
	Method      string `json:"method"`
	Path        string `json:"path"`
	Auth        string `json:"auth"` // "api_key" | "jwt" | "none"
	Summary     string `json:"summary"`
	Body        string `json:"body,omitempty"`
	Requirements string `json:"requirements,omitempty"`
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
			Notes:     "Create keys at /auth/profile after subscribing to api. Secret shown once. Platform admin must still create a key; admin bypasses product entitlements after auth.",
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
		Routes: []DocsRoute{
			{
				Method:  http.MethodGet,
				Path:    "/api/v1/docs",
				Auth:    "none",
				Summary: "This catalog (public).",
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
				Summary:      "Step 4a — read one org report (meta + full payload).",
			},
			{
				Method:       http.MethodPost,
				Path:         "/api/v1/ereport/orgs/{orgId}/reports/{reportId}",
				Auth:         "api_key",
				Summary:      "Step 4b — full-replace org report after snapshot.",
				Body:         `{"confirmOverwrite":true,"tema":"optional","payload":{ /* full .ereport JSON */ }}`,
				Requirements: "confirmOverwrite must be JSON true. payload required.",
			},
			{
				Method:       http.MethodGet,
				Path:         "/api/v1/ereport/library",
				Auth:         "api_key",
				Summary:      "Alias: orgs + legacyReports (prefer /orgs flow).",
			},
		},
		KeyMgmt: []DocsRoute{
			{
				Method:       http.MethodGet,
				Path:         "/api/apikeys",
				Auth:         "jwt",
				Summary:      "List key metadata for the signed-in user (no secrets).",
				Requirements: "Browser JWT; api entitlement or admin.",
			},
			{
				Method:       http.MethodPost,
				Path:         "/api/apikeys",
				Auth:         "jwt",
				Summary:      "Create a key; response includes plaintext secret once.",
				Body:         `{"label":"my-bot"}`,
				Requirements: "Non-empty label.",
			},
			{
				Method:       http.MethodDelete,
				Path:         "/api/apikeys/{id}",
				Auth:         "jwt",
				Summary:      "Revoke a key immediately.",
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
