package church

// Network activities (spec 023): definitions under church/groups/{id}/network-activities/,
// occurrences under each church, soft-delete, rollup read API.

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxNetworkImageBytes = 2 << 20 // 2 MiB after client compress-to-1MB

func (h *Handler) canAccessDenom(ctx context.Context, email, denomID string) (bool, error) {
	email = auth.NormalizeEmail(email)
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(ctx, email); err == nil && ok {
			role = u.Role
		}
	}
	if auth.IsAdmin(email, role) {
		return true, nil
	}
	if h.Memberships == nil {
		return false, nil
	}
	mems, err := h.Memberships.ListByUser(ctx, email)
	if err != nil {
		return false, err
	}
	for _, m := range mems {
		if strings.TrimSpace(m.DenominationID) == strings.TrimSpace(denomID) {
			return true, nil
		}
	}
	return false, nil
}

func (h *Handler) canManageNetworkActivity(ctx context.Context, email, denomID string) (bool, error) {
	email = auth.NormalizeEmail(email)
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(ctx, email); err == nil && ok {
			role = u.Role
		}
	}
	if auth.IsAdmin(email, role) {
		return true, nil
	}
	if h.Memberships == nil {
		return false, nil
	}
	mems, err := h.Memberships.ListByUser(ctx, email)
	if err != nil {
		return false, err
	}
	for _, m := range mems {
		if strings.TrimSpace(m.DenominationID) != strings.TrimSpace(denomID) {
			continue
		}
		if NormalizeChurchRole(m.Role) == RoleChurchAdmin {
			return true, nil
		}
	}
	return false, nil
}

func (h *Handler) listChurchesInDenom(ctx context.Context, denomID string) ([]ChurchCard, error) {
	if h.Catalog == nil {
		return nil, nil
	}
	all, err := h.Catalog.List(ctx, "")
	if err != nil {
		return nil, err
	}
	out := make([]ChurchCard, 0)
	for _, c := range all {
		if strings.TrimSpace(c.DenominationID) == strings.TrimSpace(denomID) {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

func (h *Handler) loadNetworkActivity(ctx context.Context, groupID, activityID, cid string) (NetworkActivity, bool, error) {
	var act NetworkActivity
	ok, err := h.Objects.GetJSON(ctx, NetworkActivityMetaKey(groupID, activityID), &act, cid)
	return act, ok, err
}

func (h *Handler) listNetworkActivityDefs(ctx context.Context, groupID, cid string, includeDeleted bool) ([]NetworkActivity, error) {
	prefix := NetworkActivityPrefix(groupID) + "/"
	keys, err := h.Objects.ListKeys(ctx, prefix, cid)
	if err != nil {
		return nil, err
	}
	out := make([]NetworkActivity, 0)
	seen := map[string]bool{}
	for _, k := range keys {
		if !strings.HasSuffix(k, "/activity.json") {
			continue
		}
		var act NetworkActivity
		ok, err := h.Objects.GetJSON(ctx, k, &act, cid)
		if err != nil || !ok || act.ID == "" || seen[act.ID] {
			continue
		}
		if !includeDeleted && strings.TrimSpace(act.DeletedAt) != "" {
			continue
		}
		seen[act.ID] = true
		out = append(out, act)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

func (h *Handler) listOccurrencesForChurch(ctx context.Context, denom, churchID, activityID, cid string, includeDeleted bool) ([]NetworkOccurrence, error) {
	prefix := NetworkOccurrencePrefix(denom, churchID, activityID) + "/"
	keys, err := h.Objects.ListKeys(ctx, prefix, cid)
	if err != nil {
		return nil, err
	}
	out := make([]NetworkOccurrence, 0)
	seen := map[string]bool{}
	for _, k := range keys {
		if !strings.HasSuffix(k, "/occurrence.json") {
			continue
		}
		var occ NetworkOccurrence
		ok, err := h.Objects.GetJSON(ctx, k, &occ, cid)
		if err != nil || !ok || occ.ID == "" || seen[occ.ID] {
			continue
		}
		if !includeDeleted && strings.TrimSpace(occ.DeletedAt) != "" {
			continue
		}
		seen[occ.ID] = true
		out = append(out, occ)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date != out[j].Date {
			return out[i].Date > out[j].Date
		}
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

func (h *Handler) ListNetworkActivities(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	groupID := chi.URLParam(r, "groupID")
	ok, err := h.canAccessDenom(r.Context(), email, groupID)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	list, err := h.listNetworkActivityDefs(r.Context(), groupID, cid, false)
	if err != nil {
		log.Printf("[correlation=%s] network-activities.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list network activities")
		return
	}
	if list == nil {
		list = []NetworkActivity{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"activities": list})
}

func (h *Handler) CreateNetworkActivity(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	groupID := chi.URLParam(r, "groupID")
	ok, err := h.canManageNetworkActivity(r.Context(), email, groupID)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusForbidden, "platform admin or church-admin required")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
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
	act := NetworkActivity{
		ID:             id,
		Name:           name,
		Description:    strings.TrimSpace(body.Description),
		DenominationID: groupID,
		CreatedBy:      email,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := h.Objects.PutJSON(r.Context(), NetworkActivityMetaKey(groupID, id), act, cid); err != nil {
		log.Printf("[correlation=%s] network-activities.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create network activity")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"activity": act})
}

func (h *Handler) UpdateNetworkActivity(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	groupID := chi.URLParam(r, "groupID")
	activityID := chi.URLParam(r, "activityID")
	ok, err := h.canManageNetworkActivity(r.Context(), email, groupID)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusForbidden, "platform admin or church-admin required")
		return
	}
	act, found, err := h.loadNetworkActivity(r.Context(), groupID, activityID, cid)
	if err != nil || !found || strings.TrimSpace(act.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "network activity not found")
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
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
	act.Name = name
	act.Description = strings.TrimSpace(body.Description)
	act.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), NetworkActivityMetaKey(groupID, activityID), act, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update network activity")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"activity": act})
}

func (h *Handler) SoftDeleteNetworkActivity(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	groupID := chi.URLParam(r, "groupID")
	activityID := chi.URLParam(r, "activityID")
	ok, err := h.canManageNetworkActivity(r.Context(), email, groupID)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusForbidden, "platform admin or church-admin required")
		return
	}
	act, found, err := h.loadNetworkActivity(r.Context(), groupID, activityID, cid)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "network activity not found")
		return
	}
	if strings.TrimSpace(act.DeletedAt) == "" {
		act.DeletedAt = nowRFC3339()
		act.UpdatedAt = act.DeletedAt
		if err := h.Objects.PutJSON(r.Context(), NetworkActivityMetaKey(groupID, activityID), act, cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not soft-delete network activity")
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"activity": act})
}

func (h *Handler) NetworkActivityRollup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	groupID := chi.URLParam(r, "groupID")
	activityID := chi.URLParam(r, "activityID")
	ok, err := h.canAccessDenom(r.Context(), email, groupID)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	act, found, err := h.loadNetworkActivity(r.Context(), groupID, activityID, cid)
	if err != nil || !found || strings.TrimSpace(act.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "network activity not found")
		return
	}
	churches, err := h.listChurchesInDenom(r.Context(), groupID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list churches")
		return
	}
	pool, _ := h.buildMemberPool(r.Context(), groupID, cid)
	nameByEmail := map[string]string{}
	for _, p := range pool {
		nameByEmail[auth.NormalizeEmail(p.Email)] = p.Name
	}
	sections := make([]NetworkChurchRollup, 0, len(churches))
	for _, ch := range churches {
		occs, err := h.listOccurrencesForChurch(r.Context(), groupID, ch.ChurchID, activityID, cid, false)
		if err != nil {
			continue
		}
		stats := make([]NetworkOccurrenceStats, 0, len(occs))
		for _, o := range occs {
			first := ""
			if len(o.ImageNames) > 0 {
				first = o.ImageNames[0]
			}
			repKey := auth.NormalizeEmail(o.ReporterMemberKey)
			stats = append(stats, NetworkOccurrenceStats{
				OccurrenceID:      o.ID,
				Date:              o.Date,
				Place:             o.Place,
				ReporterMemberKey: o.ReporterMemberKey,
				ReporterName:      nameByEmail[repKey],
				ParticipantCount:  len(o.ParticipantMemberKeys),
				ContactCount:      len(o.Contacts),
				ImageCount:        len(o.ImageNames),
				FirstImageName:    first,
			})
		}
		sections = append(sections, NetworkChurchRollup{
			ChurchID:    ch.ChurchID,
			ChurchName:  ch.Name,
			Occurrences: stats,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"activity": act,
		"churches": sections,
	})
}

func (h *Handler) ListChurchNetworkActivities(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	list, err := h.listNetworkActivityDefs(r.Context(), denom, cid, false)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list network activities")
		return
	}
	if list == nil {
		list = []NetworkActivity{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"activities": list})
}

func (h *Handler) buildMemberPool(ctx context.Context, denomID, cid string) ([]NetworkMemberPoolEntry, error) {
	churches, err := h.listChurchesInDenom(ctx, denomID)
	if err != nil {
		return nil, err
	}
	out := make([]NetworkMemberPoolEntry, 0)
	seen := map[string]bool{}
	for _, ch := range churches {
		var doc ChurchDoc
		ok, err := h.Objects.GetJSON(ctx, ChurchMetaKey(denomID, ch.ChurchID), &doc, cid)
		if err != nil || !ok {
			continue
		}
		for _, m := range doc.Members {
			em := auth.NormalizeEmail(m.Email)
			if em == "" {
				continue
			}
			key := em + "|" + ch.ChurchID
			if seen[key] {
				continue
			}
			seen[key] = true
			name := memberDisplayName(m)
			if name == "" {
				name = em
			}
			out = append(out, NetworkMemberPoolEntry{
				Email:      em,
				Name:       name,
				ChurchID:   ch.ChurchID,
				ChurchName: ch.Name,
				Role:       NormalizeChurchRole(m.Role),
			})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ChurchName != out[j].ChurchName {
			return strings.ToLower(out[i].ChurchName) < strings.ToLower(out[j].ChurchName)
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

func (h *Handler) NetworkMemberPool(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	pool, err := h.buildMemberPool(r.Context(), denom, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load member pool")
		return
	}
	if pool == nil {
		pool = []NetworkMemberPoolEntry{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"members": pool})
}

func (h *Handler) ListNetworkOccurrences(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	list, err := h.listOccurrencesForChurch(r.Context(), denom, churchID, activityID, cid, false)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list occurrences")
		return
	}
	if list == nil {
		list = []NetworkOccurrence{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"occurrences": list})
}

type occurrenceBody struct {
	Date                  string           `json:"date"`
	Place                 string           `json:"place"`
	ReporterMemberKey     string           `json:"reporterMemberKey"`
	ParticipantMemberKeys []string         `json:"participantMemberKeys"`
	Description           string           `json:"description"`
	Contacts              []NetworkContact `json:"contacts"`
	ImageNames            []string         `json:"imageNames"`
}

func normalizeContacts(in []NetworkContact) []NetworkContact {
	out := make([]NetworkContact, 0, len(in))
	for _, c := range in {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		out = append(out, NetworkContact{
			Name:     name,
			Address:  strings.TrimSpace(c.Address),
			Phone:    strings.TrimSpace(c.Phone),
			Interest: strings.TrimSpace(c.Interest),
		})
	}
	return out
}

func cleanEmailList(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, e := range in {
		e = auth.NormalizeEmail(e)
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out
}

func (h *Handler) CreateNetworkOccurrence(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	act, found, err := h.loadNetworkActivity(r.Context(), denom, activityID, cid)
	if err != nil || !found || strings.TrimSpace(act.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "network activity not found")
		return
	}
	var body occurrenceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	date := strings.TrimSpace(body.Date)
	if date == "" {
		httpx.WriteError(w, http.StatusBadRequest, "date required")
		return
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	now := nowRFC3339()
	id := uuid.NewString()
	occ := NetworkOccurrence{
		ID:                    id,
		ActivityID:            activityID,
		ChurchID:              churchID,
		DenominationID:        denom,
		Date:                  date,
		Place:                 strings.TrimSpace(body.Place),
		ReporterMemberKey:     auth.NormalizeEmail(body.ReporterMemberKey),
		ParticipantMemberKeys: cleanEmailList(body.ParticipantMemberKeys),
		Description:           strings.TrimSpace(body.Description),
		Contacts:              normalizeContacts(body.Contacts),
		ImageNames:            cleanStringList(body.ImageNames),
		CreatedBy:             email,
		CreatedAt:             now,
		UpdatedBy:             email,
		UpdatedAt:             now,
	}
	if err := h.Objects.PutJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, id), occ, cid); err != nil {
		log.Printf("[correlation=%s] network-occurrence.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create occurrence")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"occurrence": occ})
}

func (h *Handler) GetNetworkOccurrence(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	occurrenceID := chi.URLParam(r, "occurrenceID")
	okDenom, _ := h.canAccessDenom(r.Context(), email, denom)
	va, _ := h.resolveAccess(r.Context(), email, denom, churchID)
	if !okDenom && !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	var occ NetworkOccurrence
	found, err := h.Objects.GetJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), &occ, cid)
	if err != nil || !found || strings.TrimSpace(occ.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "occurrence not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"occurrence": occ})
}

func (h *Handler) UpdateNetworkOccurrence(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	occurrenceID := chi.URLParam(r, "occurrenceID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	var occ NetworkOccurrence
	found, err := h.Objects.GetJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), &occ, cid)
	if err != nil || !found || strings.TrimSpace(occ.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "occurrence not found")
		return
	}
	var body occurrenceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	date := strings.TrimSpace(body.Date)
	if date == "" {
		httpx.WriteError(w, http.StatusBadRequest, "date required")
		return
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	occ.Date = date
	occ.Place = strings.TrimSpace(body.Place)
	occ.ReporterMemberKey = auth.NormalizeEmail(body.ReporterMemberKey)
	occ.ParticipantMemberKeys = cleanEmailList(body.ParticipantMemberKeys)
	occ.Description = strings.TrimSpace(body.Description)
	occ.Contacts = normalizeContacts(body.Contacts)
	if body.ImageNames != nil {
		occ.ImageNames = cleanStringList(body.ImageNames)
	}
	occ.UpdatedBy = email
	occ.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), occ, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update occurrence")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"occurrence": occ})
}

func (h *Handler) SoftDeleteNetworkOccurrence(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	occurrenceID := chi.URLParam(r, "occurrenceID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	var occ NetworkOccurrence
	found, err := h.Objects.GetJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), &occ, cid)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "occurrence not found")
		return
	}
	if strings.TrimSpace(occ.DeletedAt) == "" {
		occ.DeletedAt = nowRFC3339()
		occ.UpdatedBy = email
		occ.UpdatedAt = occ.DeletedAt
		if err := h.Objects.PutJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), occ, cid); err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not soft-delete occurrence")
			return
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"occurrence": occ})
}

func (h *Handler) PostNetworkOccurrenceImage(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	occurrenceID := chi.URLParam(r, "occurrenceID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	var occ NetworkOccurrence
	found, err := h.Objects.GetJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), &occ, cid)
	if err != nil || !found || strings.TrimSpace(occ.DeletedAt) != "" {
		httpx.WriteError(w, http.StatusNotFound, "occurrence not found")
		return
	}
	if err := r.ParseMultipartForm(maxNetworkImageBytes + (1 << 20)); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, hdr, err := r.FormFile("image")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "image field required")
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxNetworkImageBytes+1))
	if err != nil || len(raw) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "could not read image")
		return
	}
	if len(raw) > maxNetworkImageBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "image too large (max 2MB)")
		return
	}
	ct := hdr.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	ext := strings.ToLower(path.Ext(hdr.Filename))
	if !strings.HasPrefix(ct, "image/jpeg") && !strings.HasPrefix(ct, "image/png") &&
		!strings.HasPrefix(ct, "image/webp") && !strings.HasPrefix(ct, "image/jpg") {
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
			httpx.WriteError(w, http.StatusBadRequest, "only jpeg, png, webp allowed")
			return
		}
	}
	safeName := SanitizeSlug(strings.TrimSuffix(path.Base(hdr.Filename), path.Ext(hdr.Filename)))
	if safeName == "" {
		safeName = "photo"
	}
	if ext == "" {
		ext = ".jpg"
	}
	filename := safeName + "-" + uuid.NewString()[:8] + ext
	key := NetworkOccurrenceImageKey(denom, churchID, activityID, occurrenceID, filename)
	if err := h.Objects.PutBytes(r.Context(), key, raw, ct, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not store image")
		return
	}
	occ.ImageNames = append(occ.ImageNames, filename)
	occ.UpdatedBy = email
	occ.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), NetworkOccurrenceMetaKey(denom, churchID, activityID, occurrenceID), occ, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "image saved but occurrence meta failed")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"filename": filename, "occurrence": occ})
}

func (h *Handler) GetNetworkOccurrenceImage(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	occurrenceID := chi.URLParam(r, "occurrenceID")
	name := chi.URLParam(r, "name")
	okDenom, _ := h.canAccessDenom(r.Context(), email, denom)
	va, _ := h.resolveAccess(r.Context(), email, denom, churchID)
	if !okDenom && !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "access denied")
		return
	}
	body, ct, found, err := h.Objects.GetBytes(r.Context(), NetworkOccurrenceImageKey(denom, churchID, activityID, occurrenceID, name), cid)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "image not found")
		return
	}
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
