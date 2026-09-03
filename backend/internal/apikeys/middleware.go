package apikeys

import (
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"
)

// Request headers injected after a valid API key authenticates (same X-User-Email
// path as JWT so product handlers can reuse UserEmailFromRequest).
const (
	HeaderKeyID     = "X-API-Key-ID"
	HeaderKeyPrefix = "X-API-Key-Prefix"
)

// RequireAPIKey validates Authorization: Bearer <eos_live_…>, rejects JWTs /
// missing keys, attaches owner email + key metadata, and updates lastUsedAt.
func (h *Handler) RequireAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimSpace(r.Header.Get("Authorization"))
		const prefix = "Bearer "
		if !strings.HasPrefix(raw, prefix) {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(raw, prefix))
		if !LooksLikeAPIKey(token) {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		rec, ok, err := h.Keys.GetByHash(r.Context(), HashSecret(token))
		if err != nil {
			httpx.WriteError(w, http.StatusBadGateway, "could not validate api key")
			return
		}
		if !ok || !rec.Active() {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		// Entitlement gate: active `api` unless platform admin.
		if !h.hasAPIAccess(r, rec.OwnerEmail) {
			httpx.WriteError(w, http.StatusForbidden, "api subscription required")
			return
		}
		r.Header.Set("X-User-Email", auth.NormalizeEmail(rec.OwnerEmail))
		r.Header.Set(HeaderKeyID, rec.ID)
		r.Header.Set(HeaderKeyPrefix, rec.Prefix)
		_ = h.Keys.TouchLastUsed(r.Context(), rec.ID, auth.NowRFC3339())
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) hasAPIAccess(r *http.Request, email string) bool {
	if h.isAdmin(r, email) {
		return true
	}
	if h.Entitlements == nil {
		return false
	}
	return payments.HasServiceAccess(false, h.Entitlements.ListEntitlements(email), "api")
}

// RequireProductAccess ensures the key owner has the product entitlement (or admin).
func (h *Handler) RequireProductAccess(serviceID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			email := auth.UserEmailFromRequest(r)
			if h.isAdmin(r, email) {
				next.ServeHTTP(w, r)
				return
			}
			if h.Entitlements == nil {
				httpx.WriteError(w, http.StatusForbidden, serviceID+" subscription required")
				return
			}
			if !payments.HasServiceAccess(false, h.Entitlements.ListEntitlements(email), serviceID) {
				httpx.WriteError(w, http.StatusForbidden, serviceID+" subscription required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (h *Handler) isAdmin(r *http.Request, email string) bool {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
	}
	return auth.IsAdmin(email, role)
}

// KeyIDFromRequest reads the key id injected by RequireAPIKey.
func KeyIDFromRequest(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get(HeaderKeyID))
}

// KeyPrefixFromRequest reads the display prefix injected by RequireAPIKey.
func KeyPrefixFromRequest(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get(HeaderKeyPrefix))
}
