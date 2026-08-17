package homescool

import (
	"context"
	"net/http"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"
)

// LinkStudentChecker adapts a homescool.Store into payments.HomescoolStudentChecker
// so the subscriptions access endpoint can grant Homescool to linked students.
type LinkStudentChecker struct {
	Links Store
}

// IsHomescoolStudent is true when email appears as student on any teacher link.
func (c LinkStudentChecker) IsHomescoolStudent(ctx context.Context, email string) (bool, error) {
	if c.Links == nil {
		return false, nil
	}
	rows, err := c.Links.ListByStudent(ctx, email)
	if err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

// requireTeacherAccess gates teacher-only Homescool APIs.
// When Entitlements is nil (typical unit tests), the check is skipped so
// existing JWT authz tests keep working. Production main always wires Store.
//
// Allowed: platform admin OR active homescool entitlement.
// Linked students without a subscription are NOT allowed on teacher routes.
func (h *Handler) requireTeacherAccess(next http.Handler) http.Handler {
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
		if payments.HasServiceAccess(false, ents, "homescool") {
			next.ServeHTTP(w, r)
			return
		}
		httpx.WriteError(w, http.StatusForbidden, "homescool subscription required")
	})
}

// isAdminUser mirrors payments admin resolution (bootstrap email or stored role).
func (h *Handler) isAdminUser(r *http.Request, email string) bool {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
	}
	return auth.IsAdmin(email, role)
}
