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

// ListLeaderRoles returns the fixed ministry role options for líderes multi-select.
func (h *Handler) ListLeaderRoles(w http.ResponseWriter, r *http.Request) {
	roles := make([]map[string]string, 0, len(LeaderRoleOptions))
	for _, id := range LeaderRoleOptions {
		roles = append(roles, map[string]string{
			"id":    id,
			"label": LeaderRoleLabel(id),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"roles": roles})
}

// ListGroups returns denomination/network catalog rows (JWT).
func (h *Handler) ListGroups(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	if h.Groups == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "groups store not configured")
		return
	}
	items, err := h.Groups.List(r.Context())
	if err != nil {
		log.Printf("[correlation=%s] church.groups.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list groups")
		return
	}
	if items == nil {
		items = []DenominationGroup{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"groups": items})
}

// CreateGroup adds a denomination/network (platform admin only) → Dynamo + S3.
func (h *Handler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !h.isPlatformAdmin(r.Context(), email) {
		httpx.WriteError(w, http.StatusForbidden, "platform admin required")
		return
	}
	if h.Groups == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "groups store not configured")
		return
	}
	var body struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	id := SanitizeSlug(body.ID)
	if id == "" {
		id = SanitizeSlug(name)
	}
	if name == "" || !IsValidSlug(id) {
		httpx.WriteError(w, http.StatusBadRequest, "id and name required")
		return
	}
	now := nowRFC3339()
	g := DenominationGroup{
		ID:        id,
		Name:      name,
		CreatedBy: email,
		CreatedAt: now,
		UpdatedAt: now,
	}
	created, err := h.Groups.Create(r.Context(), g)
	if errors.Is(err, ErrDuplicate) {
		httpx.WriteError(w, http.StatusConflict, "group already exists")
		return
	}
	if err != nil {
		log.Printf("[correlation=%s] church.groups.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create group")
		return
	}
	if h.Objects != nil {
		if err := h.Objects.PutJSON(r.Context(), GroupMetaKey(id), created, cid); err != nil {
			log.Printf("[correlation=%s] church.groups.s3 error: %v", cid, err)
			_ = h.Groups.Delete(r.Context(), id)
			httpx.WriteError(w, http.StatusBadGateway, "could not persist group.json")
			return
		}
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"group": created})
}

// UpdateGroup renames a denomination/network (platform admin).
func (h *Handler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !h.isPlatformAdmin(r.Context(), email) {
		httpx.WriteError(w, http.StatusForbidden, "platform admin required")
		return
	}
	groupID := chi.URLParam(r, "groupID")
	if !IsValidSlug(groupID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group id")
		return
	}
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
	updated, err := h.Groups.Update(r.Context(), DenominationGroup{
		ID:        groupID,
		Name:      name,
		UpdatedAt: nowRFC3339(),
	})
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "group not found")
		return
	}
	if err != nil {
		log.Printf("[correlation=%s] church.groups.update error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not update group")
		return
	}
	if h.Objects != nil {
		_ = h.Objects.PutJSON(r.Context(), GroupMetaKey(groupID), updated, cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"group": updated})
}

// DeleteGroup removes a denomination/network (platform admin).
func (h *Handler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if !h.isPlatformAdmin(r.Context(), email) {
		httpx.WriteError(w, http.StatusForbidden, "platform admin required")
		return
	}
	groupID := chi.URLParam(r, "groupID")
	if !IsValidSlug(groupID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid group id")
		return
	}
	if err := h.Groups.Delete(r.Context(), groupID); err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "group not found")
			return
		}
		log.Printf("[correlation=%s] church.groups.delete error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not delete group")
		return
	}
	if h.Objects != nil {
		_ = h.Objects.DeleteKey(r.Context(), GroupMetaKey(groupID), cid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "id": groupID})
}
