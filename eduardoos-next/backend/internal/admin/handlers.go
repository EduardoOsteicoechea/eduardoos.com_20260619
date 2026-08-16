package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

// Handler serves admin-only user + entitlement management APIs.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	Payments  *payments.Store
	auth      *auth.Handler
}

// NewHandler wires admin routes against auth + payments stores.
func NewHandler(jwtSecret string, users auth.UserStore, pay *payments.Store) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Payments:  pay,
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts JWT + admin-gated endpoints.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Use(h.requireAdmin)
		r.Get("/api/admin/users", h.ListUsers)
		r.Put("/api/admin/users/{email}/entitlements", h.PutUserEntitlements)
		r.Get("/api/admin/services", h.ListServices)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type userRow struct {
	Email         string                 `json:"email"`
	Role          string                 `json:"role"`
	Verified      bool                   `json:"verified"`
	CreatedAt     string                 `json:"createdAt"`
	Entitlements  []payments.Entitlement `json:"entitlements"`
	ServiceIDs    []string               `json:"serviceIds"`
}

// ListUsers returns every account with role, registration date, and services.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Users.ListUsers(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list users")
		return
	}
	rows := make([]userRow, 0, len(users))
	for _, u := range users {
		ents := h.Payments.ListEntitlements(u.Email)
		ids := make([]string, 0, len(ents))
		for _, e := range ents {
			ids = append(ids, e.ServiceID)
		}
		rows = append(rows, userRow{
			Email:        u.Email,
			Role:         auth.ResolveRole(u.Email, u.Role),
			Verified:     u.Verified,
			CreatedAt:    u.CreatedAt,
			Entitlements: ents,
			ServiceIDs:   ids,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count": len(rows),
		"users": rows,
	})
}

// ListServices returns the billable catalog for the admin UI.
func (h *Handler) ListServices(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]any, 0, len(payments.ServiceCatalog))
	for _, s := range payments.ServiceCatalog {
		out = append(out, map[string]any{
			"id":          s.ID,
			"label":       s.Label,
			"description": s.Description,
			"monthly_usd": s.MonthlyUSD,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"services": out})
}

type putEntitlementsBody struct {
	Services      []string `json:"services"`
	BillingPeriod string   `json:"billing_period"`
	Months        int      `json:"months"`
}

// PutUserEntitlements replaces subscription entitlements for a user (admin grant).
func (h *Handler) PutUserEntitlements(w http.ResponseWriter, r *http.Request) {
	target := auth.NormalizeEmail(chi.URLParam(r, "email"))
	if target == "" || !strings.Contains(target, "@") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if _, ok, err := h.Users.GetUser(r.Context(), target); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	} else if !ok {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	var body putEntitlementsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	services := make([]string, 0, len(body.Services))
	seen := map[string]bool{}
	for _, raw := range body.Services {
		id := strings.ToLower(strings.TrimSpace(raw))
		if !payments.KnownService(id) || seen[id] {
			continue
		}
		seen[id] = true
		services = append(services, id)
	}
	ents := payments.BuildEntitlements(services, body.BillingPeriod, body.Months)
	h.Payments.PutEntitlements(target, ents)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        target,
		"entitlements": ents,
		"serviceIds":   services,
	})
}
