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

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Mailer sends plain-text invite emails through the shared auth SMTP stack.
// Nil Mail on Handler means invites are created but mail is skipped (logged).
type Mailer interface {
	SendPlainMail(to, subject, body string) error
}

// PublicBaseURL returns the absolute site origin for invite links in emails.
func PublicBaseURL() string {
	base := strings.TrimSpace(httpx.Env("PUBLIC_BASE_URL", ""))
	if base == "" {
		base = strings.TrimSpace(httpx.Env("SITE_URL", "https://eduardoos.com"))
	}
	return strings.TrimRight(base, "/")
}

func inviteLandingURL(token string) string {
	return PublicBaseURL() + "/ereport/invite/?token=" + strings.TrimSpace(token)
}

func (h *Handler) saveInvite(r *http.Request, inv Invite, cid string) error {
	return h.Objects.PutJSON(r.Context(), InviteKey(inv.Token), inv, cid)
}

func (h *Handler) loadInvite(r *http.Request, token, cid string) (Invite, bool, error) {
	var inv Invite
	ok, err := h.Objects.GetJSON(r.Context(), InviteKey(token), &inv, cid)
	if err != nil {
		return Invite{}, false, err
	}
	return inv, ok && inv.Token != "", nil
}

func inviteExpired(inv Invite, now time.Time) bool {
	if strings.TrimSpace(inv.ExpiresAt) == "" {
		return true
	}
	exp, err := time.Parse(time.RFC3339, inv.ExpiresAt)
	if err != nil {
		return true
	}
	return !now.Before(exp)
}

func (h *Handler) sendInviteMail(cid, to, subject, body string) {
	if h.Mail == nil {
		log.Printf("[correlation=%s] ereport.invite.mail skip (no mailer) to=%s", cid, to)
		return
	}
	if err := h.Mail.SendPlainMail(to, subject, body); err != nil {
		log.Printf("[correlation=%s] ereport.invite.mail error to=%s err=%v", cid, to, err)
	}
}

// CreateOrgInvite creates an org-list magic link (editable for durationHours) and emails it.
func (h *Handler) CreateOrgInvite(w http.ResponseWriter, r *http.Request) {
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
		Email         string `json:"email"`
		DurationHours int    `json:"durationHours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	to := auth.NormalizeEmail(body.Email)
	if to == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email required")
		return
	}
	hours := body.DurationHours
	if hours < 1 {
		httpx.WriteError(w, http.StatusBadRequest, "durationHours must be >= 1")
		return
	}
	if hours > 24*30 {
		hours = 24 * 30
	}
	now := time.Now().UTC()
	token := uuid.NewString()
	inv := Invite{
		Token:     token,
		Scope:     InviteScopeOrg,
		OwnerSafe: orgMeta.OwnerSafe,
		OrgID:     orgID,
		Email:     to,
		ExpiresAt: now.Add(time.Duration(hours) * time.Hour).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
		CanEdit:   true,
	}
	if err := h.saveInvite(r, inv, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save invite"))
		return
	}
	link := inviteLandingURL(token)
	subject := fmt.Sprintf("eReport invite — %s", orgMeta.Name)
	mailBody := fmt.Sprintf(
		"You have been invited to view and edit reports in the eReport org %q.\n\n"+
			"Open this magic link (no login required):\n%s\n\n"+
			"Access expires at %s (UTC).\n",
		orgMeta.Name, link, inv.ExpiresAt,
	)
	h.sendInviteMail(cid, to, subject, mailBody)
	log.Printf("[correlation=%s] ereport.invite.org.create org=%s to=%s hours=%d", cid, orgID, to, hours)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"invite": inv,
		"link":   link,
	})
}

// CreateReportInvite creates a single-report magic link (1h edit) and emails it.
func (h *Handler) CreateReportInvite(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	orgID := chi.URLParam(r, "orgId")
	reportID := chi.URLParam(r, "reportId")
	orgMeta, ok, err := h.loadOrgMeta(r, email, orgID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "org not found")
		return
	}
	if !h.ownsOrg(r, orgMeta, email) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	meta, _, err := h.loadOrgReport(r, email, orgID, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	to := auth.NormalizeEmail(body.Email)
	if to == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email required")
		return
	}
	now := time.Now().UTC()
	token := uuid.NewString()
	inv := Invite{
		Token:     token,
		Scope:     InviteScopeReport,
		OwnerSafe: orgMeta.OwnerSafe,
		OrgID:     orgID,
		ReportID:  reportID,
		Email:     to,
		ExpiresAt: now.Add(1 * time.Hour).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
		CanEdit:   true,
	}
	if err := h.saveInvite(r, inv, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, s3WriteErrorMessage(err, "could not save invite"))
		return
	}
	link := inviteLandingURL(token)
	subject := fmt.Sprintf("eReport invite — %s", meta.Tema)
	mailBody := fmt.Sprintf(
		"You have been invited to view and edit the eReport %q.\n\n"+
			"Open this magic link (no login required):\n%s\n\n"+
			"Edit access expires at %s (UTC).\n",
		meta.Tema, link, inv.ExpiresAt,
	)
	h.sendInviteMail(cid, to, subject, mailBody)
	log.Printf("[correlation=%s] ereport.invite.report.create org=%s report=%s to=%s", cid, orgID, reportID, to)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"invite": inv,
		"link":   link,
	})
}

// GetInvite is public (no JWT). Returns invite metadata when still valid;
// org scope includes report cards; report scope includes meta+payload.
// Optional ?reportId= loads a specific report under an org-scope invite.
func (h *Handler) GetInvite(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	token := chi.URLParam(r, "token")
	inv, ok, err := h.loadInvite(r, token, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load invite")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "invite not found")
		return
	}
	now := time.Now().UTC()
	expired := inviteExpired(inv, now)
	out := map[string]any{
		"invite":  inv,
		"valid":   !expired,
		"expired": expired,
		"canEdit": inv.CanEdit && !expired,
	}
	if expired {
		httpx.WriteJSON(w, http.StatusOK, out)
		return
	}

	switch inv.Scope {
	case InviteScopeReport:
		meta, payload, loadErr := h.loadOrgReportBySafe(r, inv.OwnerSafe, inv.OrgID, inv.ReportID, cid)
		if loadErr != nil || meta.ID == "" {
			httpx.WriteError(w, http.StatusNotFound, "report not found")
			return
		}
		out["meta"] = meta
		out["payload"] = payload
	case InviteScopeOrg:
		var lib Library
		_, _ = h.Objects.GetJSON(r.Context(), OrgLibraryKeyBySafe(inv.OwnerSafe, inv.OrgID), &lib, cid)
		if lib.Reports == nil {
			lib.Reports = []ReportCard{}
		}
		out["reports"] = lib.Reports
		reportID := strings.TrimSpace(r.URL.Query().Get("reportId"))
		if reportID != "" {
			meta, payload, loadErr := h.loadOrgReportBySafe(r, inv.OwnerSafe, inv.OrgID, reportID, cid)
			if loadErr != nil || meta.ID == "" {
				httpx.WriteError(w, http.StatusNotFound, "report not found")
				return
			}
			out["meta"] = meta
			out["payload"] = payload
		}
	default:
		httpx.WriteError(w, http.StatusBadRequest, "unknown invite scope")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// PutInviteReport is public. Updates report payload when the invite allows edit and is not expired.
// Body: { "payload": {...}, "reportId"?: "..." } — reportId required for org-scope invites.
func (h *Handler) PutInviteReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	token := chi.URLParam(r, "token")
	inv, ok, err := h.loadInvite(r, token, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load invite")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "invite not found")
		return
	}
	now := time.Now().UTC()
	if inviteExpired(inv, now) {
		httpx.WriteError(w, http.StatusForbidden, "invite expired")
		return
	}
	if !inv.CanEdit {
		httpx.WriteError(w, http.StatusForbidden, "invite is read-only")
		return
	}
	var body struct {
		ReportID string         `json:"reportId"`
		Payload  map[string]any `json:"payload"`
		Tema     *string        `json:"tema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if body.Payload == nil {
		httpx.WriteError(w, http.StatusBadRequest, "payload required")
		return
	}
	reportID := strings.TrimSpace(inv.ReportID)
	if inv.Scope == InviteScopeOrg {
		reportID = strings.TrimSpace(body.ReportID)
		if reportID == "" {
			httpx.WriteError(w, http.StatusBadRequest, "reportId required for org invite")
			return
		}
	}
	if reportID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "reportId required")
		return
	}

	meta, _, loadErr := h.loadOrgReportBySafe(r, inv.OwnerSafe, inv.OrgID, reportID, cid)
	if loadErr != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	ownerEmail := meta.OwnerEmail
	if ownerEmail == "" {
		// Fallback: reconstruct is not possible from safe alone; meta always stores OwnerEmail.
		httpx.WriteError(w, http.StatusBadGateway, "report meta missing owner")
		return
	}
	updatedAt := now.Format(time.RFC3339)
	if body.Tema != nil {
		tema := strings.TrimSpace(*body.Tema)
		if tema == "" {
			tema = "Sin tema"
		}
		meta.Tema = tema
	}
	if n, ok := body.Payload["reportNumber"].(string); ok {
		meta.ReportNumber = n
	}
	if d, ok := body.Payload["reportDate"].(string); ok {
		meta.ReportDate = d
	}
	meta.UpdatedAt = updatedAt

	if err := h.Objects.PutJSON(r.Context(), OrgReportMetaKey(ownerEmail, inv.OrgID, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save meta")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), OrgReportKey(ownerEmail, inv.OrgID, reportID), body.Payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save report")
		return
	}
	lib, _ := h.loadOrgLibrary(r, ownerEmail, inv.OrgID, cid)
	for i := range lib.Reports {
		if lib.Reports[i].ID == reportID {
			lib.Reports[i].Tema = meta.Tema
			lib.Reports[i].ReportNumber = meta.ReportNumber
			lib.Reports[i].UpdatedAt = updatedAt
		}
	}
	_ = h.saveOrgLibrary(r, ownerEmail, inv.OrgID, lib, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta, "payload": body.Payload})
}
