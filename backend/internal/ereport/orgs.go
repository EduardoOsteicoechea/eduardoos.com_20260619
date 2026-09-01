package ereport

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// loadOrgsIndex reads the owner's orgs.json (empty slice when missing).
func (h *Handler) loadOrgsIndex(r *http.Request, email, cid string) (OrgsIndex, error) {
	var idx OrgsIndex
	ok, err := h.Objects.GetJSON(r.Context(), OrgsIndexKey(email), &idx, cid)
	if err != nil {
		return OrgsIndex{}, err
	}
	if !ok || idx.Orgs == nil {
		idx.Orgs = []OrgCard{}
	}
	return idx, nil
}

func (h *Handler) saveOrgsIndex(r *http.Request, email string, idx OrgsIndex, cid string) error {
	if idx.Orgs == nil {
		idx.Orgs = []OrgCard{}
	}
	return h.Objects.PutJSON(r.Context(), OrgsIndexKey(email), idx, cid)
}

func (h *Handler) loadOrgLibrary(r *http.Request, email, orgID, cid string) (Library, error) {
	var lib Library
	ok, err := h.Objects.GetJSON(r.Context(), OrgLibraryKey(email, orgID), &lib, cid)
	if err != nil {
		return Library{}, err
	}
	if !ok || lib.Reports == nil {
		lib.Reports = []ReportCard{}
	}
	return lib, nil
}

func (h *Handler) saveOrgLibrary(r *http.Request, email, orgID string, lib Library, cid string) error {
	if lib.Reports == nil {
		lib.Reports = []ReportCard{}
	}
	return h.Objects.PutJSON(r.Context(), OrgLibraryKey(email, orgID), lib, cid)
}

func (h *Handler) loadOrgMeta(r *http.Request, email, orgID, cid string) (OrgMeta, bool, error) {
	var meta OrgMeta
	ok, err := h.Objects.GetJSON(r.Context(), OrgMetaKey(email, orgID), &meta, cid)
	if err != nil {
		return OrgMeta{}, false, err
	}
	return meta, ok && meta.ID != "", nil
}

func (h *Handler) loadOrgReport(r *http.Request, email, orgID, reportID, cid string) (Meta, map[string]any, error) {
	var meta Meta
	ok, err := h.Objects.GetJSON(r.Context(), OrgReportMetaKey(email, orgID, reportID), &meta, cid)
	if err != nil || !ok {
		return Meta{}, nil, err
	}
	var payload map[string]any
	ok, err = h.Objects.GetJSON(r.Context(), OrgReportKey(email, orgID, reportID), &payload, cid)
	if err != nil || !ok {
		return meta, map[string]any{}, err
	}
	return meta, payload, nil
}

func (h *Handler) loadOrgReportBySafe(r *http.Request, ownerSafe, orgID, reportID, cid string) (Meta, map[string]any, error) {
	var meta Meta
	ok, err := h.Objects.GetJSON(r.Context(), OrgReportMetaKeyBySafe(ownerSafe, orgID, reportID), &meta, cid)
	if err != nil || !ok {
		return Meta{}, nil, err
	}
	var payload map[string]any
	ok, err = h.Objects.GetJSON(r.Context(), OrgReportKeyBySafe(ownerSafe, orgID, reportID), &payload, cid)
	if err != nil || !ok {
		return meta, map[string]any{}, err
	}
	return meta, payload, nil
}

func (h *Handler) ownsOrg(r *http.Request, meta OrgMeta, caller string) bool {
	return h.isAdminUser(r, caller) || strings.EqualFold(meta.OwnerEmail, caller)
}

func sortOrgCards(orgs []OrgCard) {
	sort.SliceStable(orgs, func(i, j int) bool {
		if orgs[i].Order != orgs[j].Order {
			return orgs[i].Order < orgs[j].Order
		}
		return orgs[i].Name < orgs[j].Name
	})
}

// GetOrgs lists the caller's orgs plus a recent-reports summary across orgs.
func (h *Handler) GetOrgs(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	idx, err := h.loadOrgsIndex(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load orgs")
		return
	}
	sortOrgCards(idx.Orgs)

	recent := make([]RecentReportCard, 0)
	for _, org := range idx.Orgs {
		if org.Hidden {
			continue
		}
		lib, libErr := h.loadOrgLibrary(r, email, org.ID, cid)
		if libErr != nil {
			continue
		}
		for _, card := range lib.Reports {
			recent = append(recent, RecentReportCard{
				OrgID:        org.ID,
				OrgName:      org.Name,
				ID:           card.ID,
				Tema:         card.Tema,
				ReportNumber: card.ReportNumber,
				UpdatedAt:    card.UpdatedAt,
			})
		}
	}
	sort.SliceStable(recent, func(i, j int) bool {
		return recent[i].UpdatedAt > recent[j].UpdatedAt
	})
	const recentCap = 20
	if len(recent) > recentCap {
		recent = recent[:recentCap]
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"userSafe":       SafeEmailKey(email),
		"orgs":           idx.Orgs,
		"recentReports":  recent,
	})
}

// CreateOrg registers a new org under the caller.
func (h *Handler) CreateOrg(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	now := nowRFC3339()
	id := uuid.NewString()
	idx, _ := h.loadOrgsIndex(r, email, cid)
	order := len(idx.Orgs)
	meta := OrgMeta{
		ID:         id,
		Name:       name,
		OwnerEmail: email,
		OwnerSafe:  SafeEmailKey(email),
		Order:      order,
		Hidden:     false,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := h.Objects.PutJSON(r.Context(), OrgMetaKey(email, id), meta, cid); err != nil {
		log.Printf("[correlation=%s] ereport.org.create meta_error err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save org meta"))
		return
	}
	if err := h.saveOrgLibrary(r, email, id, Library{Reports: []ReportCard{}}, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save org library"))
		return
	}
	card := OrgCard{
		ID: id, Name: name, Order: order, Hidden: false,
		CreatedAt: now, UpdatedAt: now,
	}
	idx.Orgs = append(idx.Orgs, card)
	if err := h.saveOrgsIndex(r, email, idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save orgs index"))
		return
	}
	log.Printf("[correlation=%s] ereport.org.create user=%s id=%s", cid, email, id)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"org": meta})
}

// PutOrgs applies batch reorder / hide updates to the caller's orgs index.
func (h *Handler) PutOrgs(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Orgs []struct {
			ID     string `json:"id"`
			Order  *int   `json:"order"`
			Hidden *bool  `json:"hidden"`
		} `json:"orgs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if len(body.Orgs) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "orgs required")
		return
	}
	idx, err := h.loadOrgsIndex(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load orgs")
		return
	}
	byID := map[string]int{}
	for i, o := range idx.Orgs {
		byID[o.ID] = i
	}
	now := nowRFC3339()
	for _, patch := range body.Orgs {
		id := strings.TrimSpace(patch.ID)
		i, ok := byID[id]
		if !ok {
			httpx.WriteError(w, http.StatusNotFound, "org not found: "+id)
			return
		}
		if patch.Order != nil {
			idx.Orgs[i].Order = *patch.Order
		}
		if patch.Hidden != nil {
			idx.Orgs[i].Hidden = *patch.Hidden
		}
		idx.Orgs[i].UpdatedAt = now
		meta, found, mErr := h.loadOrgMeta(r, email, id, cid)
		if mErr != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not load org meta")
			return
		}
		if found {
			meta.Order = idx.Orgs[i].Order
			meta.Hidden = idx.Orgs[i].Hidden
			meta.UpdatedAt = now
			_ = h.Objects.PutJSON(r.Context(), OrgMetaKey(email, id), meta, cid)
		}
	}
	sortOrgCards(idx.Orgs)
	if err := h.saveOrgsIndex(r, email, idx, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save orgs")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"orgs": idx.Orgs})
}

// GetOrg returns org meta + library cards for the owner.
func (h *Handler) GetOrg(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	meta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load org")
		return
	}
	if !ok || !h.ownsOrg(r, meta, email) {
		// Also try admin viewing another owner is not supported via this path —
		// org keys are under the caller's email prefix.
		if !ok {
			httpx.WriteError(w, http.StatusNotFound, "org not found")
			return
		}
	}
	lib, err := h.loadOrgLibrary(r, email, orgID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load org library")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"org":     meta,
		"reports": lib.Reports,
	})
}

// DeleteOrg removes the org index entry and all objects under the org prefix.
func (h *Handler) DeleteOrg(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	meta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load org")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "org not found")
		return
	}
	if !h.ownsOrg(r, meta, email) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	keys, _ := h.Objects.ListKeys(r.Context(), OrgPrefix(email, orgID), cid)
	for _, key := range keys {
		_ = h.Objects.DeleteKey(r.Context(), key, cid)
	}
	_ = h.Objects.DeleteKey(r.Context(), OrgMetaKey(email, orgID), cid)
	_ = h.Objects.DeleteKey(r.Context(), OrgLibraryKey(email, orgID), cid)

	idx, _ := h.loadOrgsIndex(r, email, cid)
	kept := make([]OrgCard, 0, len(idx.Orgs))
	for _, o := range idx.Orgs {
		if o.ID != orgID {
			kept = append(kept, o)
		}
	}
	idx.Orgs = kept
	_ = h.saveOrgsIndex(r, email, idx, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

// CreateOrgReport creates an empty report under an org.
func (h *Handler) CreateOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	orgMeta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "org not found")
		return
	}
	if !h.ownsOrg(r, orgMeta, email) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		Tema string `json:"tema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	tema := strings.TrimSpace(body.Tema)
	if tema == "" {
		tema = "Sin tema"
	}
	now := nowRFC3339()
	id := uuid.NewString()
	meta := Meta{
		ID:         id,
		Tema:       tema,
		OrgID:      orgID,
		OwnerEmail: email,
		OwnerSafe:  SafeEmailKey(email),
		SharedWith: []ShareEntry{},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	payload := EmptyPayload()
	if err := h.Objects.PutJSON(r.Context(), OrgReportMetaKey(email, orgID, id), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), OrgReportKey(email, orgID, id), payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadOrgLibrary(r, email, orgID, cid)
	lib.Reports = append(lib.Reports, ReportCard{ID: id, Tema: tema, UpdatedAt: now})
	_ = h.saveOrgLibrary(r, email, orgID, lib, cid)
	log.Printf("[correlation=%s] ereport.org.report.create user=%s org=%s id=%s", cid, email, orgID, id)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"meta": meta, "payload": payload})
}

// ImportOrgReport stores an uploaded .ereport payload under an org.
func (h *Handler) ImportOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	orgMeta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "org not found")
		return
	}
	if !h.ownsOrg(r, orgMeta, email) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		Tema    string         `json:"tema"`
		Payload map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Payload == nil {
		httpx.WriteError(w, http.StatusBadRequest, "payload required")
		return
	}
	if _, ok := body.Payload["sections"]; !ok {
		httpx.WriteError(w, http.StatusBadRequest, "payload.sections required")
		return
	}
	tema := strings.TrimSpace(body.Tema)
	if tema == "" {
		tema = "Importado"
	}
	now := nowRFC3339()
	id := uuid.NewString()
	reportNumber, _ := body.Payload["reportNumber"].(string)
	reportDate, _ := body.Payload["reportDate"].(string)
	meta := Meta{
		ID:           id,
		Tema:         tema,
		ReportNumber: reportNumber,
		ReportDate:   reportDate,
		OrgID:        orgID,
		OwnerEmail:   email,
		OwnerSafe:    SafeEmailKey(email),
		SharedWith:   []ShareEntry{},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := h.Objects.PutJSON(r.Context(), OrgReportMetaKey(email, orgID, id), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), OrgReportKey(email, orgID, id), body.Payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadOrgLibrary(r, email, orgID, cid)
	lib.Reports = append(lib.Reports, ReportCard{
		ID: id, Tema: tema, ReportNumber: reportNumber, UpdatedAt: now,
	})
	_ = h.saveOrgLibrary(r, email, orgID, lib, cid)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"meta": meta, "payload": body.Payload})
}

// GetOrgReport returns meta + payload for an org-scoped report (owner JWT).
func (h *Handler) GetOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	meta, payload, err := h.loadOrgReport(r, caller, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.canAccess(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"meta":     meta,
		"payload":  payload,
		"canEdit":  true,
		"canShare": h.isOwner(r, meta, caller),
		"isOwner":  strings.EqualFold(meta.OwnerEmail, caller) || h.isAdminUser(r, caller),
	})
}

// PutOrgReport updates tema and/or payload under an org (owner JWT).
func (h *Handler) PutOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	meta, payload, err := h.loadOrgReport(r, caller, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.canAccess(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		Tema    *string        `json:"tema"`
		Payload map[string]any `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	now := nowRFC3339()
	if body.Tema != nil && h.isOwner(r, meta, caller) {
		tema := strings.TrimSpace(*body.Tema)
		if tema == "" {
			tema = "Sin tema"
		}
		meta.Tema = tema
	}
	if body.Payload != nil {
		payload = body.Payload
		if n, ok := payload["reportNumber"].(string); ok {
			meta.ReportNumber = n
		}
		if d, ok := payload["reportDate"].(string); ok {
			meta.ReportDate = d
		}
	}
	meta.UpdatedAt = now
	ownerEmail := meta.OwnerEmail
	if err := h.Objects.PutJSON(r.Context(), OrgReportMetaKey(ownerEmail, orgID, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save meta")
		return
	}
	if body.Payload != nil {
		if err := h.Objects.PutJSON(r.Context(), OrgReportKey(ownerEmail, orgID, reportID), payload, cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not save report")
			return
		}
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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta, "payload": payload})
}

// DeleteOrgReport removes an org-scoped report (owner/admin).
func (h *Handler) DeleteOrgReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	meta, _, err := h.loadOrgReport(r, caller, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	ownerEmail := meta.OwnerEmail
	_ = h.Objects.DeleteKey(r.Context(), OrgReportMetaKey(ownerEmail, orgID, reportID), cid)
	_ = h.Objects.DeleteKey(r.Context(), OrgReportKey(ownerEmail, orgID, reportID), cid)
	lib, _ := h.loadOrgLibrary(r, ownerEmail, orgID, cid)
	filtered := make([]ReportCard, 0, len(lib.Reports))
	for _, c := range lib.Reports {
		if c.ID != reportID {
			filtered = append(filtered, c)
		}
	}
	lib.Reports = filtered
	_ = h.saveOrgLibrary(r, ownerEmail, orgID, lib, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
