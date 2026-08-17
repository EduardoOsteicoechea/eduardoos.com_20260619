package church

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// ListLeaders returns the independent leaders catalog (JWT).
// Optional ?networkId= filters to leaders associated with that group (or unassigned).
func (h *Handler) ListLeaders(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	if h.Leaders == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "leaders store not configured")
		return
	}
	items, err := h.Leaders.List(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] church.leaders.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list leaders")
		return
	}
	networkID := strings.TrimSpace(r.URL.Query().Get("networkId"))
	if networkID != "" {
		filtered := make([]LeaderDoc, 0, len(items))
		for _, L := range items {
			if leaderMatchesNetwork(L, networkID) {
				filtered = append(filtered, L)
			}
		}
		items = filtered
	}
	if items == nil {
		items = []LeaderDoc{}
	}
	canMutate, _ := h.canRegisterChurches(r.Context(), auth.UserEmailFromRequest(r))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"leaders":           items,
		"canManageLeaders":  canMutate,
		"isPlatformAdmin":   h.isPlatformAdmin(r.Context(), auth.UserEmailFromRequest(r)),
	})
}

// CreateLeader adds a catalog leader (register-gate users or platform admin).
func (h *Handler) CreateLeader(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if allowed, reason := h.canRegisterChurches(r.Context(), email); !allowed {
		httpx.WriteError(w, http.StatusForbidden, reason)
		return
	}
	if h.Leaders == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "leaders store not configured")
		return
	}
	var body struct {
		ID         string   `json:"id"`
		FirstName  string   `json:"firstName"`
		LastName   string   `json:"lastName"`
		Phone      string   `json:"phone"`
		Email      string   `json:"email"`
		Roles      []string `json:"roles"`
		NetworkIDs []string `json:"networkIds"`
		ChurchIDs  []string `json:"churchIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	first := strings.TrimSpace(body.FirstName)
	last := strings.TrimSpace(body.LastName)
	if first == "" || last == "" {
		httpx.WriteError(w, http.StatusBadRequest, "firstName and lastName required")
		return
	}
	if err := validateLeaderContacts([]Leader{{Phone: body.Phone, Email: body.Email}}); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	id := SanitizeSlug(body.ID)
	if id == "" {
		id = SanitizeSlug(first + "-" + last)
	}
	if !IsValidSlug(id) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid leader id")
		return
	}
	churchIDs, err := h.filterVisibleChurchRefs(r, email, body.ChurchIDs)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := nowRFC3339()
	L := LeaderDoc{
		ID:        id,
		FirstName: first,
		LastName:  last,
		Phone:     strings.TrimSpace(body.Phone),
		Email:     strings.TrimSpace(body.Email),
		Roles:     body.Roles,
		ChurchIDs: churchIDs,
		CreatedBy: email,
		CreatedAt: now,
		UpdatedAt: now,
	}
	// Only platform admin may set network associations on create.
	if h.isPlatformAdmin(r.Context(), email) {
		L.NetworkIDs = body.NetworkIDs
	}
	created, err := h.Leaders.Create(r.Context(), L)
	if errors.Is(err, ErrDuplicate) {
		httpx.WriteError(w, http.StatusConflict, "leader already exists")
		return
	}
	if err != nil {
		log.Printf("[correlation=%s] church.leaders.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create leader")
		return
	}
	if h.Objects != nil {
		if err := h.Objects.PutJSON(r.Context(), LeaderMetaKey(id), created, cid); err != nil {
			log.Printf("[correlation=%s] church.leaders.s3 error: %v", cid, err)
			_ = h.Leaders.Delete(r.Context(), id)
			httpx.WriteError(w, http.StatusBadGateway, "could not persist leader.json")
			return
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"leader": created})
}

// UpdateLeader updates catalog fields; networkIds only when platform admin.
// Church associations (churchIds) may be set by any register-gate user via setChurches.
func (h *Handler) UpdateLeader(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if allowed, reason := h.canRegisterChurches(r.Context(), email); !allowed {
		httpx.WriteError(w, http.StatusForbidden, reason)
		return
	}
	leaderID := chi.URLParam(r, "leaderID")
	if !IsValidSlug(leaderID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid leader id")
		return
	}
	var body struct {
		FirstName   string   `json:"firstName"`
		LastName    string   `json:"lastName"`
		Phone       string   `json:"phone"`
		Email       string   `json:"email"`
		Roles       []string `json:"roles"`
		NetworkIDs  []string `json:"networkIds"`
		SetNetworks bool     `json:"setNetworks"`
		ChurchIDs   []string `json:"churchIds"`
		SetChurches bool     `json:"setChurches"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	existing, ok, err := h.Leaders.Get(r.Context(), leaderID)
	if err != nil {
		log.Printf("[correlation=%s] church.leaders.get error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load leader")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "leader not found")
		return
	}
	first := strings.TrimSpace(body.FirstName)
	last := strings.TrimSpace(body.LastName)
	if first == "" {
		first = existing.FirstName
	}
	if last == "" {
		last = existing.LastName
	}
	if first == "" || last == "" {
		httpx.WriteError(w, http.StatusBadRequest, "firstName and lastName required")
		return
	}
	if err := validateLeaderContacts([]Leader{{Phone: body.Phone, Email: body.Email}}); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	next := LeaderDoc{
		ID:         leaderID,
		FirstName:  first,
		LastName:   last,
		Phone:      strings.TrimSpace(body.Phone),
		Email:      strings.TrimSpace(body.Email),
		Roles:      body.Roles,
		NetworkIDs: existing.NetworkIDs,
		ChurchIDs:  existing.ChurchIDs,
		UpdatedAt:  nowRFC3339(),
	}
	if body.Roles == nil {
		next.Roles = existing.Roles
	}
	if h.isPlatformAdmin(r.Context(), email) && body.SetNetworks {
		next.NetworkIDs = body.NetworkIDs
	}
	if body.SetChurches {
		churchIDs, ferr := h.filterVisibleChurchRefs(r, email, body.ChurchIDs)
		if ferr != nil {
			httpx.WriteError(w, http.StatusBadRequest, ferr.Error())
			return
		}
		next.ChurchIDs = churchIDs
	}
	updated, err := h.Leaders.Update(r.Context(), next)
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "leader not found")
		return
	}
	if err != nil {
		log.Printf("[correlation=%s] church.leaders.update error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not update leader")
		return
	}
	if h.Objects != nil {
		_ = h.Objects.PutJSON(r.Context(), LeaderMetaKey(leaderID), updated, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"leader": updated})
}

// filterVisibleChurchRefs keeps only catalog churches the caller may associate.
// Platform admin: any existing church. Others: churches they own or share a
// denomination with (via ownership or membership under that denom/network).
func (h *Handler) filterVisibleChurchRefs(r *http.Request, email string, refs []string) ([]string, error) {
	if len(refs) == 0 {
		return nil, nil
	}
	if h.Catalog == nil {
		return nil, errors.New("church catalog not configured")
	}
	all, err := h.Catalog.List(r.Context(), "")
	if err != nil {
		return nil, errors.New("could not list churches")
	}
	byRef := map[string]ChurchCard{}
	for _, c := range all {
		ref := ChurchRef(c.DenominationID, c.ChurchID)
		if ref != "" {
			byRef[ref] = c
		}
	}
	admin := h.isPlatformAdmin(r.Context(), email)
	allowedDenom := map[string]bool{}
	if !admin {
		emailNorm := auth.NormalizeEmail(email)
		for _, c := range all {
			if auth.NormalizeEmail(c.OwnerEmail) == emailNorm {
				allowedDenom[c.DenominationID] = true
			}
		}
		if h.Memberships != nil {
			mems, merr := h.Memberships.ListByUser(r.Context(), emailNorm)
			if merr == nil {
				for _, m := range mems {
					allowedDenom[strings.TrimSpace(m.DenominationID)] = true
				}
			}
		}
	}
	out := make([]string, 0, len(refs))
	seen := map[string]bool{}
	for _, raw := range refs {
		ref := NormalizeChurchRef(raw)
		if ref == "" || seen[ref] {
			continue
		}
		c, ok := byRef[ref]
		if !ok {
			return nil, errors.New("unknown church association: " + ref)
		}
		if !admin && !allowedDenom[c.DenominationID] {
			return nil, errors.New("church not visible for association: " + ref)
		}
		seen[ref] = true
		out = append(out, ref)
	}
	return out, nil
}

// DeleteLeader removes a catalog leader (register-gate or platform admin).
func (h *Handler) DeleteLeader(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if allowed, reason := h.canRegisterChurches(r.Context(), email); !allowed {
		httpx.WriteError(w, http.StatusForbidden, reason)
		return
	}
	leaderID := chi.URLParam(r, "leaderID")
	if !IsValidSlug(leaderID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid leader id")
		return
	}
	if err := h.Leaders.Delete(r.Context(), leaderID); err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "leader not found")
			return
		}
		log.Printf("[correlation=%s] church.leaders.delete error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not delete leader")
		return
	}
	if h.Objects != nil {
		_ = h.Objects.DeleteKey(r.Context(), LeaderMetaKey(leaderID), cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": leaderID})
}

// upsertInlineLeadersIntoCatalog migrates legacy register-time inline líderes into
// the independent catalog and returns embedded snapshots + ids.
func (h *Handler) upsertInlineLeadersIntoCatalog(r *http.Request, cid, owner string, inline []Leader) ([]Leader, []string, error) {
	normalized := normalizeLeaders(inline)
	if len(normalized) == 0 || h.Leaders == nil {
		return normalized, nil, nil
	}
	out := make([]Leader, 0, len(normalized))
	ids := make([]string, 0, len(normalized))
	now := nowRFC3339()
	for _, L := range normalized {
		id := strings.TrimSpace(L.ID)
		if id == "" {
			id = SanitizeSlug(L.FirstName + "-" + L.LastName)
		}
		if id == "" {
			id = SanitizeSlug(L.Name)
		}
		if !IsValidSlug(id) {
			continue
		}
		doc := LeaderDoc{
			ID:        id,
			FirstName: L.FirstName,
			LastName:  L.LastName,
			Phone:     L.Phone,
			Email:     L.Email,
			Roles:     L.Roles,
			CreatedBy: owner,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if doc.FirstName == "" && doc.LastName == "" && L.Name != "" {
			// Legacy name-only: store as firstName for catalog completeness.
			parts := strings.Fields(L.Name)
			if len(parts) >= 2 {
				doc.FirstName = parts[0]
				doc.LastName = strings.Join(parts[1:], " ")
			} else {
				doc.FirstName = L.Name
				doc.LastName = "—"
			}
		}
		created, err := h.Leaders.Create(r.Context(), doc)
		if errors.Is(err, ErrDuplicate) {
			existing, ok, gerr := h.Leaders.Get(r.Context(), id)
			if gerr != nil {
				return nil, nil, gerr
			}
			if ok {
				created = existing
			}
		} else if err != nil {
			return nil, nil, err
		} else if h.Objects != nil {
			_ = h.Objects.PutJSON(r.Context(), LeaderMetaKey(id), created, cid)
		}
		emb := leaderDocToEmbedded(created)
		out = append(out, emb)
		ids = append(ids, created.ID)
	}
	return out, ids, nil
}
