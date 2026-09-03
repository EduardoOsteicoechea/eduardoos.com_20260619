package ereport

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Handler serves JWT-protected eReport APIs plus public magic-link invite routes.
type Handler struct {
	JWTSecret    string
	Users        auth.UserStore
	Objects      ObjectSpace
	Entitlements *payments.Store
	// Mail is optional; nil skips invite email (invite JSON + link still returned).
	Mail Mailer
	auth *auth.Handler
}

// NewHandler wires defaults.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Objects:   NewMemoryObjectSpace(),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/ereport/* (legacy flat + org-based + public invites).
func (h *Handler) Routes(r chi.Router) {
	// Public magic-link invites (no JWT).
	r.Get("/api/ereport/invite/{token}", h.GetInvite)
	r.Put("/api/ereport/invite/{token}/report", h.PutInviteReport)

	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)

		pr.Get("/api/ereport/library", h.GetLibrary)
		pr.Get("/api/ereport/reports/{ownerSafe}/{reportId}", h.GetReport)

		pr.Group(func(wr chi.Router) {
			wr.Use(h.requireEreportCreateAccess)
			wr.Post("/api/ereport/reports", h.CreateReport)
			wr.Post("/api/ereport/reports/import", h.ImportReport)

			// Org writes that create orgs / reports require ereport entitlement.
			wr.Post("/api/ereport/orgs", h.CreateOrg)
			wr.Post("/api/ereport/orgs/{orgId}/reports", h.CreateOrgReport)
			wr.Post("/api/ereport/orgs/{orgId}/reports/import", h.ImportOrgReport)
		})

		pr.Put("/api/ereport/reports/{ownerSafe}/{reportId}", h.PutReport)
		pr.Delete("/api/ereport/reports/{ownerSafe}/{reportId}", h.DeleteReport)
		pr.Put("/api/ereport/reports/{ownerSafe}/{reportId}/shares", h.PutShares)

		// API overwrite history (spec 055) — owner/admin JWT.
		pr.Get("/api/ereport/reports/{ownerSafe}/{reportId}/history", h.ListHistory)
		pr.Get("/api/ereport/reports/{ownerSafe}/{reportId}/history/{snapshotId}", h.GetHistorySnapshot)
		pr.Post("/api/ereport/reports/{ownerSafe}/{reportId}/history/{snapshotId}/restore", h.RestoreHistorySnapshot)

		// Org dashboard + manage (JWT owner).
		pr.Get("/api/ereport/orgs", h.GetOrgs)
		pr.Put("/api/ereport/orgs", h.PutOrgs)
		pr.Get("/api/ereport/orgs/{orgId}", h.GetOrg)
		pr.Delete("/api/ereport/orgs/{orgId}", h.DeleteOrg)
		pr.Get("/api/ereport/orgs/{orgId}/reports/{reportId}", h.GetOrgReport)
		pr.Put("/api/ereport/orgs/{orgId}/reports/{reportId}", h.PutOrgReport)
		pr.Delete("/api/ereport/orgs/{orgId}/reports/{reportId}", h.DeleteOrgReport)
		pr.Post("/api/ereport/orgs/{orgId}/invites", h.CreateOrgInvite)
		pr.Post("/api/ereport/orgs/{orgId}/reports/{reportId}/invites", h.CreateReportInvite)
	})
}

func (h *Handler) requireEreportCreateAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.Entitlements == nil {
			next.ServeHTTP(w, r)
			return
		}
		email := auth.UserEmailFromRequest(r)
		if h.isAdminUser(r, email) {
			next.ServeHTTP(w, r)
			return
		}
		ents := h.Entitlements.ListEntitlements(email)
		if payments.HasServiceAccess(false, ents, "ereport") {
			next.ServeHTTP(w, r)
			return
		}
		httpx.WriteError(w, http.StatusForbidden, "ereport subscription required")
	})
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

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

// s3WriteErrorMessage keeps the API short but flags IAM AccessDenied clearly.
func s3WriteErrorMessage(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "accessdenied") || strings.Contains(msg, "not authorized") || strings.Contains(msg, "forbidden") {
		return fallback + " (S3 AccessDenied on ereport/ — attach IAM PutObject for eduardoos20260607/ereport/* on eduardoos-ec2-s3-role)"
	}
	return fallback
}

func (h *Handler) loadLibrary(r *http.Request, email, cid string) (Library, error) {
	var lib Library
	ok, err := h.Objects.GetJSON(r.Context(), LibraryKey(email), &lib, cid)
	if err != nil {
		return Library{}, err
	}
	if !ok || lib.Reports == nil {
		lib.Reports = []ReportCard{}
	}
	return lib, nil
}

func (h *Handler) saveLibrary(r *http.Request, email string, lib Library, cid string) error {
	if lib.Reports == nil {
		lib.Reports = []ReportCard{}
	}
	return h.Objects.PutJSON(r.Context(), LibraryKey(email), lib, cid)
}

func (h *Handler) loadSharedIndex(r *http.Request, email, cid string) (SharedIndex, error) {
	var idx SharedIndex
	ok, err := h.Objects.GetJSON(r.Context(), SharedIndexKey(email), &idx, cid)
	if err != nil {
		return SharedIndex{}, err
	}
	if !ok || idx.Items == nil {
		idx.Items = []SharedItem{}
	}
	return idx, nil
}

func (h *Handler) saveSharedIndex(r *http.Request, email string, idx SharedIndex, cid string) error {
	if idx.Items == nil {
		idx.Items = []SharedItem{}
	}
	return h.Objects.PutJSON(r.Context(), SharedIndexKey(email), idx, cid)
}

func (h *Handler) canAccess(r *http.Request, meta Meta, caller string) bool {
	if h.isAdminUser(r, caller) {
		return true
	}
	if strings.EqualFold(meta.OwnerEmail, caller) {
		return true
	}
	for _, s := range meta.SharedWith {
		if strings.EqualFold(s.Email, caller) {
			return true
		}
	}
	return false
}

func (h *Handler) isOwner(r *http.Request, meta Meta, caller string) bool {
	return h.isAdminUser(r, caller) || strings.EqualFold(meta.OwnerEmail, caller)
}

// GetLibrary returns owned + shared-with-me cards.
func (h *Handler) GetLibrary(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	lib, err := h.loadLibrary(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load library")
		return
	}
	shared, err := h.loadSharedIndex(r, email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load shared index")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"userSafe": SafeEmailKey(email),
		"owned":    lib.Reports,
		"shared":   shared.Items,
	})
}

// CreateReport creates an empty report with tema.
func (h *Handler) CreateReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
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
		OwnerEmail: email,
		OwnerSafe:  SafeEmailKey(email),
		SharedWith: []ShareEntry{},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	payload := EmptyPayload()
	if err := h.Objects.PutJSON(r.Context(), MetaKey(email, id), meta, cid); err != nil {
		log.Printf("[correlation=%s] ereport.create meta_error key=%s err=%v", cid, MetaKey(email, id), err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), ReportKey(email, id), payload, cid); err != nil {
		log.Printf("[correlation=%s] ereport.create report_error key=%s err=%v", cid, ReportKey(email, id), err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadLibrary(r, email, cid)
	lib.Reports = append(lib.Reports, ReportCard{ID: id, Tema: tema, UpdatedAt: now})
	_ = h.saveLibrary(r, email, lib, cid)
	log.Printf("[correlation=%s] ereport.create user=%s id=%s", cid, email, id)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"meta": meta, "payload": payload})
}

// ImportReport stores an uploaded .ereport payload.
func (h *Handler) ImportReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
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
		OwnerEmail:   email,
		OwnerSafe:    SafeEmailKey(email),
		SharedWith:   []ShareEntry{},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := h.Objects.PutJSON(r.Context(), MetaKey(email, id), meta, cid); err != nil {
		log.Printf("[correlation=%s] ereport.import meta_error key=%s err=%v", cid, MetaKey(email, id), err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save meta"))
		return
	}
	if err := h.Objects.PutJSON(r.Context(), ReportKey(email, id), body.Payload, cid); err != nil {
		log.Printf("[correlation=%s] ereport.import report_error key=%s err=%v", cid, ReportKey(email, id), err)
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save report"))
		return
	}
	lib, _ := h.loadLibrary(r, email, cid)
	lib.Reports = append(lib.Reports, ReportCard{
		ID: id, Tema: tema, ReportNumber: reportNumber, UpdatedAt: now,
	})
	_ = h.saveLibrary(r, email, lib, cid)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"meta": meta, "payload": body.Payload})
}

// GetReport returns meta + payload when caller may access.
func (h *Handler) GetReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")

	meta, payload, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load report")
		return
	}
	if meta.ID == "" {
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

func (h *Handler) loadReportBySafe(r *http.Request, ownerSafe, reportID, cid string) (Meta, map[string]any, error) {
	// Owner email is stored in meta; try key built from reconstructing email is hard.
	// Keys use SafeEmailKey(email). We list via trying Get with ownerSafe as path segment
	// by reading meta at ereport/{ownerSafe}/reports/{id}/meta.json
	var meta Meta
	metaKey := fmt.Sprintf("%s/%s/reports/%s/meta.json", RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(reportID))
	ok, err := h.Objects.GetJSON(r.Context(), metaKey, &meta, cid)
	if err != nil || !ok {
		return Meta{}, nil, err
	}
	var payload map[string]any
	reportKey := fmt.Sprintf("%s/%s/reports/%s/report.ereport", RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(reportID))
	ok, err = h.Objects.GetJSON(r.Context(), reportKey, &payload, cid)
	if err != nil || !ok {
		return meta, map[string]any{}, err
	}
	return meta, payload, nil
}

// PutReport updates tema and/or payload (owner or shared collaborator).
func (h *Handler) PutReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, payload, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
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
	if err := h.Objects.PutJSON(r.Context(), MetaKey(ownerEmail, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save meta")
		return
	}
	if body.Payload != nil {
		if err := h.Objects.PutJSON(r.Context(), ReportKey(ownerEmail, reportID), payload, cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not save report")
			return
		}
	}
	// Touch owner library card
	lib, _ := h.loadLibrary(r, ownerEmail, cid)
	for i := range lib.Reports {
		if lib.Reports[i].ID == reportID {
			lib.Reports[i].Tema = meta.Tema
			lib.Reports[i].ReportNumber = meta.ReportNumber
			lib.Reports[i].UpdatedAt = now
		}
	}
	_ = h.saveLibrary(r, ownerEmail, lib, cid)
	// Touch shared indexes
	for _, s := range meta.SharedWith {
		idx, _ := h.loadSharedIndex(r, s.Email, cid)
		for i := range idx.Items {
			if idx.Items[i].ReportID == reportID && idx.Items[i].OwnerSafe == meta.OwnerSafe {
				idx.Items[i].Tema = meta.Tema
				idx.Items[i].UpdatedAt = now
			}
		}
		_ = h.saveSharedIndex(r, s.Email, idx, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta, "payload": payload})
}

// DeleteReport removes report objects (owner/admin).
func (h *Handler) DeleteReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, _, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	ownerEmail := meta.OwnerEmail
	_ = h.Objects.DeleteKey(r.Context(), MetaKey(ownerEmail, reportID), cid)
	_ = h.Objects.DeleteKey(r.Context(), ReportKey(ownerEmail, reportID), cid)
	lib, _ := h.loadLibrary(r, ownerEmail, cid)
	filtered := make([]ReportCard, 0, len(lib.Reports))
	for _, c := range lib.Reports {
		if c.ID != reportID {
			filtered = append(filtered, c)
		}
	}
	lib.Reports = filtered
	_ = h.saveLibrary(r, ownerEmail, lib, cid)
	for _, s := range meta.SharedWith {
		idx, _ := h.loadSharedIndex(r, s.Email, cid)
		kept := make([]SharedItem, 0, len(idx.Items))
		for _, it := range idx.Items {
			if !(it.ReportID == reportID && it.OwnerSafe == meta.OwnerSafe) {
				kept = append(kept, it)
			}
		}
		idx.Items = kept
		_ = h.saveSharedIndex(r, s.Email, idx, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

// PutShares replaces the share list (owner only). Emails must be registered.
func (h *Handler) PutShares(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, _, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		Emails []string `json:"emails"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	prev := meta.SharedWith
	next := make([]ShareEntry, 0, len(body.Emails))
	seen := map[string]bool{}
	for _, raw := range body.Emails {
		em := auth.NormalizeEmail(raw)
		if em == "" || strings.EqualFold(em, meta.OwnerEmail) || seen[em] {
			continue
		}
		if h.Users != nil {
			if _, ok, err := h.Users.GetUser(r.Context(), em); err != nil || !ok {
				httpx.WriteError(w, http.StatusBadRequest, "user not registered: "+em)
				return
			}
		}
		seen[em] = true
		next = append(next, ShareEntry{Email: em, UserSafe: SafeEmailKey(em)})
	}
	now := nowRFC3339()
	meta.SharedWith = next
	meta.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), MetaKey(meta.OwnerEmail, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save shares")
		return
	}
	// Diff shared indexes
	prevSet := map[string]bool{}
	for _, s := range prev {
		prevSet[strings.ToLower(s.Email)] = true
	}
	nextSet := map[string]bool{}
	for _, s := range next {
		nextSet[strings.ToLower(s.Email)] = true
	}
	for _, s := range prev {
		if !nextSet[strings.ToLower(s.Email)] {
			idx, _ := h.loadSharedIndex(r, s.Email, cid)
			kept := make([]SharedItem, 0)
			for _, it := range idx.Items {
				if !(it.ReportID == reportID && it.OwnerSafe == meta.OwnerSafe) {
					kept = append(kept, it)
				}
			}
			idx.Items = kept
			_ = h.saveSharedIndex(r, s.Email, idx, cid)
		}
	}
	for _, s := range next {
		if prevSet[strings.ToLower(s.Email)] {
			continue
		}
		idx, _ := h.loadSharedIndex(r, s.Email, cid)
		idx.Items = append(idx.Items, SharedItem{
			OwnerSafe:  meta.OwnerSafe,
			OwnerEmail: meta.OwnerEmail,
			ReportID:   reportID,
			Tema:       meta.Tema,
			UpdatedAt:  now,
		})
		_ = h.saveSharedIndex(r, s.Email, idx, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta})
}
