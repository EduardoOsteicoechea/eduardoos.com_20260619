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
// Caller must already wrap with apikeys RequireAPIKey + rate limit + product gate.
func (h *Handler) RoutesV1(r chi.Router) {
	r.Get("/api/v1/ereport/reports/{ownerSafe}/{reportId}", h.V1GetReport)
	r.Post("/api/v1/ereport/reports/{ownerSafe}/{reportId}", h.V1PostReport)
}

// apiOwnsReport is true only when the key owner's email matches meta.OwnerEmail
// (admin does not get cross-user overwrite — spec 055).
func (h *Handler) apiOwnsReport(meta Meta, caller string) bool {
	return strings.EqualFold(meta.OwnerEmail, caller)
}

// V1GetReport returns meta + payload for the key owner's report.
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

// V1PostReport full-replaces the report payload after confirmOverwrite + snapshot.
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
