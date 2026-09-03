package ereport

import (
	"encoding/json"
	"net/http"
	"strings"

	"eduardoos.nex/internal/apikeys"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// RoutesV1 mounts API-key eReport endpoints under /api/v1/ereport/* .
// Ordered client flow (spec 060): access → orgs → org reports → get/post.
func (h *Handler) RoutesV1(r chi.Router) {
	r.Get("/api/v1/ereport/access", h.V1Access)
	r.Get("/api/v1/ereport/orgs", h.V1Orgs)
	r.Get("/api/v1/ereport/orgs/{orgId}/reports", h.V1OrgReports)
	r.Get("/api/v1/ereport/orgs/{orgId}/reports/{reportId}", h.V1GetOrgReport)
	r.Post("/api/v1/ereport/orgs/{orgId}/reports/{reportId}", h.V1PostOrgReport)
	// Alias: library returns orgs (primary) + optional legacy flat reports.
	r.Get("/api/v1/ereport/library", h.V1Library)
	// Legacy flat report paths (pre-org library).
	r.Get("/api/v1/ereport/reports/{ownerSafe}/{reportId}", h.V1GetReport)
	r.Post("/api/v1/ereport/reports/{ownerSafe}/{reportId}", h.V1PostReport)
}

// V1Access is step 1: confirms the API key can use eReport (middleware already gated).
func (h *Handler) V1Access(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"allowed":   true,
		"service":   "ereport",
		"email":     email,
		"ownerSafe": SafeEmailKey(email),
	})
}

// V1Orgs is step 2: lists owned organizations (hidden skipped).
func (h *Handler) V1Orgs(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	idx, err := h.loadOrgsIndex(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load orgs")
		return
	}
	sortOrgCards(idx.Orgs)
	out := make([]OrgCard, 0, len(idx.Orgs))
	for _, org := range idx.Orgs {
		if org.Hidden {
			continue
		}
		out = append(out, org)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ownerSafe": SafeEmailKey(email),
		"orgs":      out,
	})
}

// V1OrgReports is step 3: lists reports inside one owned org (IDs for edit).
func (h *Handler) V1OrgReports(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := strings.TrimSpace(chi.URLParam(r, "orgId"))
	orgMeta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "org not found")
		return
	}
	if !strings.EqualFold(orgMeta.OwnerEmail, email) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	lib, err := h.loadOrgLibrary(r, email, orgID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load org reports")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ownerSafe": SafeEmailKey(email),
		"orgId":     orgMeta.ID,
		"orgName":   orgMeta.Name,
		"reports":   lib.Reports,
	})
}

// V1Library returns orgs (primary discovery) plus legacy flat reports if any.
func (h *Handler) V1Library(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	idx, err := h.loadOrgsIndex(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load orgs")
		return
	}
	sortOrgCards(idx.Orgs)
	orgs := make([]OrgCard, 0, len(idx.Orgs))
	for _, org := range idx.Orgs {
		if org.Hidden {
			continue
		}
		orgs = append(orgs, org)
	}
	lib, _ := h.loadLibrary(r, email, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ownerSafe":     SafeEmailKey(email),
		"orgs":          orgs,
		"legacyReports": lib.Reports,
		// Prefer orgs → /orgs/{orgId}/reports for IDs (spec 060).
		"hint": "Use GET /api/v1/ereport/orgs then GET /api/v1/ereport/orgs/{orgId}/reports",
	})
}

// apiOwnsReport is true only when the key owner's email matches meta.OwnerEmail.
func (h *Handler) apiOwnsReport(meta Meta, caller string) bool {
	return strings.EqualFold(meta.OwnerEmail, caller)
}

// V1GetOrgReport returns meta + payload for one org-scoped report.
func (h *Handler) V1GetOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	meta, payload, err := h.loadOrgReport(r, caller, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.apiOwnsReport(meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	ownerSafe := SafeEmailKey(meta.OwnerEmail)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"orgId":     orgID,
		"reportId":  reportID,
		"ownerSafe": ownerSafe,
		"viewUrl":   OrgReportViewURL(r, ownerSafe, orgID, reportID),
		"meta":      meta,
		"payload":   payload,
	})
}

// V1PostOrgReport full-replaces an org report after confirmOverwrite + snapshot.
func (h *Handler) V1PostOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	meta, current, err := h.loadOrgReport(r, caller, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.apiOwnsReport(meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		ConfirmOverwrite bool           `json:"confirmOverwrite"`
		Tema             *string        `json:"tema"`
		Payload          map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if !body.ConfirmOverwrite {
		httpx.WriteError(w, http.StatusBadRequest, "confirmOverwrite must be true to replace the latest web version")
		return
	}
	if body.Payload == nil {
		httpx.WriteError(w, http.StatusBadRequest, "payload required")
		return
	}

	var snapshotID string
	if current != nil {
		sid, snapErr := h.saveOrgSnapshotBeforeReplace(
			r.Context(), meta.OwnerEmail, orgID, reportID, meta.Tema, "api",
			apikeys.KeyPrefixFromRequest(r), current, cid,
		)
		if snapErr != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not save history snapshot")
			return
		}
		snapshotID = sid
	}

	now := nowRFC3339()
	if body.Tema != nil {
		tema := strings.TrimSpace(*body.Tema)
		if tema == "" {
			tema = "Sin tema"
		}
		meta.Tema = tema
	}
	payload := body.Payload
	if n, ok := payload["reportNumber"].(string); ok {
		meta.ReportNumber = n
	}
	if d, ok := payload["reportDate"].(string); ok {
		meta.ReportDate = d
	}
	meta.UpdatedAt = now
	ownerEmail := meta.OwnerEmail

	if err := h.Objects.PutJSON(r.Context(), OrgReportMetaKey(ownerEmail, orgID, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), OrgReportKey(ownerEmail, orgID, reportID), payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadOrgLibrary(r, ownerEmail, orgID, cid)
	for i := range lib.Reports {
		if lib.Reports[i].ID == reportID {
			lib.Reports[i].Tema = meta.Tema
			lib.Reports[i].ReportNumber = meta.ReportNumber
			lib.Reports[i].UpdatedAt = now
		}
	}
	_ = h.saveOrgLibrary(r, ownerEmail, orgID, lib, cid)

	out := map[string]any{
		"orgId":     orgID,
		"reportId":  reportID,
		"ownerSafe": SafeEmailKey(ownerEmail),
		"viewUrl":   OrgReportViewURL(r, SafeEmailKey(ownerEmail), orgID, reportID),
		"meta":      meta,
		"payload":   payload,
	}
	if snapshotID != "" {
		out["snapshotId"] = snapshotID
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// V1GetReport returns meta + payload for a legacy flat report.
func (h *Handler) V1GetReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, payload, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.apiOwnsReport(meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta, "payload": payload})
}

// V1PostReport full-replaces a legacy flat report after confirmOverwrite + snapshot.
func (h *Handler) V1PostReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, current, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.apiOwnsReport(meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		ConfirmOverwrite bool           `json:"confirmOverwrite"`
		Tema             *string        `json:"tema"`
		Payload          map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if !body.ConfirmOverwrite {
		httpx.WriteError(w, http.StatusBadRequest, "confirmOverwrite must be true to replace the latest web version")
		return
	}
	if body.Payload == nil {
		httpx.WriteError(w, http.StatusBadRequest, "payload required")
		return
	}

	var snapshotID string
	if current != nil {
		sid, snapErr := h.saveSnapshotBeforeReplace(
			r.Context(), meta.OwnerEmail, reportID, meta.Tema, "api",
			apikeys.KeyPrefixFromRequest(r), current, cid,
		)
		if snapErr != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not save history snapshot")
			return
		}
		snapshotID = sid
	}

	now := nowRFC3339()
	if body.Tema != nil {
		tema := strings.TrimSpace(*body.Tema)
		if tema == "" {
			tema = "Sin tema"
		}
		meta.Tema = tema
	}
	payload := body.Payload
	if n, ok := payload["reportNumber"].(string); ok {
		meta.ReportNumber = n
	}
	if d, ok := payload["reportDate"].(string); ok {
		meta.ReportDate = d
	}
	meta.UpdatedAt = now

	if err := h.Objects.PutJSON(r.Context(), MetaKey(meta.OwnerEmail, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), ReportKey(meta.OwnerEmail, reportID), payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadLibrary(r, meta.OwnerEmail, cid)
	for i := range lib.Reports {
		if lib.Reports[i].ID == reportID {
			lib.Reports[i].Tema = meta.Tema
			lib.Reports[i].ReportNumber = meta.ReportNumber
			lib.Reports[i].UpdatedAt = now
		}
	}
	_ = h.saveLibrary(r, meta.OwnerEmail, lib, cid)

	out := map[string]any{"meta": meta, "payload": payload}
	if snapshotID != "" {
		out["snapshotId"] = snapshotID
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
