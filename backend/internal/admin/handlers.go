package admin

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/church"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

// Handler serves admin-only user + entitlement management APIs.
type Handler struct {
	JWTSecret  string
	Users      auth.UserStore
	Payments   *payments.Store
	ChurchAuth church.AuthorizationStore
	Mail       church.Mailer
	auth       *auth.Handler
}

// NewHandler wires admin routes against auth + payments stores.
// Call UseAuth with the shared SMTP-capable auth.Handler so bulk register
// can send verification OTP email on the same path as public register.
func NewHandler(jwtSecret string, users auth.UserStore, pay *payments.Store) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Payments:  pay,
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// UseAuth replaces the internal auth handler with the process-wide instance
// (Store + JWTSecret + SMTP_USER/SMTP_PASS). Safe to call after NewHandler.
func (h *Handler) UseAuth(a *auth.Handler) {
	if h == nil || a == nil {
		return
	}
	h.auth = a
	if h.Users == nil && a.Store != nil {
		h.Users = a.Store
	}
}

// Routes mounts JWT + admin-gated endpoints.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Use(h.requireAdmin)
		r.Get("/api/admin/users", h.ListUsers)
		// Static path before {email} mutate routes (method differs, but keep clear).
		r.Post("/api/admin/users/bulk-register", h.BulkRegister)
		r.Delete("/api/admin/users/{email}", h.DeleteUser)
		r.Put("/api/admin/users/{email}/entitlements", h.PutUserEntitlements)
		r.Get("/api/admin/services", h.ListServices)
		r.Get("/api/admin/church-authorization-requests", h.ListChurchAuthRequests)
		r.Post("/api/admin/church-authorization-requests/{email}/approve", h.ApproveChurchAuth)
		r.Post("/api/admin/church-authorization-requests/{email}/reject", h.RejectChurchAuth)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		// Defense in depth: JWT subject must match IsAdminEmail allowlist
		// or stored role admin (ResolveRole never weakens AdminEmail).
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
	Email        string                 `json:"email"`
	Name         string                 `json:"name,omitempty"`
	Role         string                 `json:"role"`
	Verified     bool                   `json:"verified"`
	CreatedAt    string                 `json:"createdAt"`
	Entitlements []payments.Entitlement `json:"entitlements"`
	ServiceIDs   []string               `json:"serviceIds"`
}

// ListUsers returns every account with role, registration date, and services.
// Never panics: nil payments store yields empty entitlements; store errors → JSON.
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "user store not configured")
		return
	}
	users, err := h.Users.ListUsers(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list users")
		return
	}
	rows := make([]userRow, 0, len(users))
	for _, u := range users {
		ents := []payments.Entitlement{}
		if h.Payments != nil {
			ents = h.Payments.ListEntitlements(u.Email)
		}
		if ents == nil {
			ents = []payments.Entitlement{}
		}
		ids := make([]string, 0, len(ents))
		for _, e := range ents {
			ids = append(ids, e.ServiceID)
		}
		rows = append(rows, userRow{
			Email:        u.Email,
			Name:         u.Name,
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
	target := targetEmailFromRequest(r)
	if !isStoredAccountEmail(target) {
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
	if h.Payments == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "payments store not configured")
		return
	}
	ents := payments.BuildEntitlements(services, body.BillingPeriod, body.Months)
	h.Payments.PutEntitlements(target, ents)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        target,
		"entitlements": ents,
		"serviceIds":   services,
	})
}

// DeleteUser removes an account (admin only). Blocks self-delete and bootstrap /
// role admin so the platform cannot lock out the sole admin.
//
// Target email comes from ?email= or path {email} after URL-decoding so operators
// can delete spam accounts whose local-part has many dots (e.g. b.ero…@gmail.com).
// Anti-spam dotted-local rules apply only at register — never here.
func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "user store not configured")
		return
	}
	target := targetEmailFromRequest(r)
	if !isStoredAccountEmail(target) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	actor := auth.UserEmailFromRequest(r)
	if target == actor {
		httpx.WriteError(w, http.StatusForbidden, "cannot delete your own account")
		return
	}
	if auth.IsAdminEmail(target) {
		httpx.WriteError(w, http.StatusForbidden, "cannot delete the platform admin")
		return
	}

	existing, ok, err := h.Users.GetUser(r.Context(), target)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "user not found")
		return
	}
	if auth.IsAdmin(existing.Email, existing.Role) {
		httpx.WriteError(w, http.StatusForbidden, "cannot delete an admin account")
		return
	}

	if err := h.Users.DeleteUser(r.Context(), target); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not delete user")
		return
	}
	if h.Payments != nil {
		h.Payments.PutEntitlements(target, nil)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
		"email":   target,
	})
}

// ListChurchAuthRequests returns church-management authorization requests.
// Default filter is pending; pass ?status=all|approved|rejected|pending.
func (h *Handler) ListChurchAuthRequests(w http.ResponseWriter, r *http.Request) {
	if h.ChurchAuth == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"count":    0,
			"requests": []church.AuthorizationRequest{},
		})
		return
	}
	status := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if status == "" || status == "pending" {
		status = church.AuthStatusPending
	} else if status == "all" {
		status = ""
	}
	list, err := h.ChurchAuth.List(r.Context(), status)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list church authorization requests")
		return
	}
	if list == nil {
		list = []church.AuthorizationRequest{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":    len(list),
		"requests": list,
	})
}

// ApproveChurchAuth marks a request approved and emails the user to subscribe
// before registering churches. Does not grant entitlement.
func (h *Handler) ApproveChurchAuth(w http.ResponseWriter, r *http.Request) {
	h.decideChurchAuth(w, r, church.AuthStatusApproved)
}

// RejectChurchAuth marks a request rejected (no email required).
func (h *Handler) RejectChurchAuth(w http.ResponseWriter, r *http.Request) {
	h.decideChurchAuth(w, r, church.AuthStatusRejected)
}

func (h *Handler) decideChurchAuth(w http.ResponseWriter, r *http.Request, nextStatus string) {
	cid := httpx.CorrelationFromRequest(r)
	if h.ChurchAuth == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "church authorization store not configured")
		return
	}
	target := targetEmailFromRequest(r)
	if !isStoredAccountEmail(target) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	existing, ok, err := h.ChurchAuth.Get(r.Context(), target)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "store error")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "authorization request not found")
		return
	}
	actor := auth.UserEmailFromRequest(r)
	req := existing
	req.Status = nextStatus
	req.DecidedBy = actor
	req.DecidedAt = time.Now().UTC().Format(time.RFC3339)
	saved, putErr := h.ChurchAuth.Put(r.Context(), req)
	if putErr != nil {
		log.Printf("[correlation=%s] admin.church_auth put error: %v", cid, putErr)
		httpx.WriteError(w, http.StatusBadGateway, "could not update authorization")
		return
	}
	if nextStatus == church.AuthStatusApproved {
		church.NotifyAuthorizationApproved(h.Mail, cid, target)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":               saved.Email,
		"authorizationStatus": saved.Status,
		"decidedAt":           saved.DecidedAt,
		"decidedBy":           saved.DecidedBy,
	})
}
