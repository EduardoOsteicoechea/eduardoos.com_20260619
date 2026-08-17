package church

import (
	"context"
	"strings"

	"eduardoos.nex/internal/auth"
)

// viewerAccess resolves platform-admin bypass and church membership role.
type viewerAccess struct {
	Email      string
	Role       string // church-admin | church-member | admin
	IsPlatform bool
	IsAdmin    bool // church-admin or platform
	OK         bool
}

func (h *Handler) resolveAccess(ctx context.Context, email, denomID, churchID string) (viewerAccess, error) {
	email = auth.NormalizeEmail(email)
	va := viewerAccess{Email: email}

	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(ctx, email); err == nil && ok {
			role = u.Role
		}
	}
	if auth.IsAdmin(email, role) {
		va.Role = "admin"
		va.IsPlatform = true
		va.IsAdmin = true
		va.OK = true
		return va, nil
	}

	if h.Memberships == nil {
		return va, nil
	}
	mem, ok, err := h.Memberships.Get(ctx, email, denomID, churchID)
	if err != nil {
		return va, err
	}
	if !ok {
		return va, nil
	}
	va.Role = NormalizeChurchRole(mem.Role)
	va.IsAdmin = va.Role == RoleChurchAdmin
	va.OK = true
	return va, nil
}

// canSeeActivity reports whether the viewer may see/report on an activity.
func canSeeActivity(va viewerAccess, doc ChurchDoc, act Activity) bool {
	if va.IsPlatform || va.IsAdmin {
		return true
	}
	if !va.OK {
		return false
	}
	// Explicit activity allow-list.
	if len(act.AuthorizedEmails) > 0 {
		for _, e := range act.AuthorizedEmails {
			if auth.NormalizeEmail(e) == va.Email {
				return true
			}
		}
		return false
	}
	// Member-level authorized activity ids (empty list = all activities for members).
	for _, m := range doc.Members {
		if auth.NormalizeEmail(m.Email) != va.Email {
			continue
		}
		if len(m.AuthorizedActivityIDs) == 0 {
			return true
		}
		for _, id := range m.AuthorizedActivityIDs {
			if strings.TrimSpace(id) == act.ID {
				return true
			}
		}
		return false
	}
	return true
}

// filterChurchForViewer redacts sensitive fields for church-member viewers.
func filterChurchForViewer(va viewerAccess, doc ChurchDoc) ChurchDoc {
	if va.IsPlatform || va.IsAdmin {
		return doc
	}
	// Members see name/network/beliefs/sector activities but not full member PII
	// beyond their own row, and only their authorized activity ids.
	out := doc
	own := Member{}
	filtered := make([]Member, 0, 1)
	for _, m := range doc.Members {
		if auth.NormalizeEmail(m.Email) == va.Email {
			own = m
			filtered = append(filtered, m)
			break
		}
	}
	out.Members = filtered
	_ = own
	return out
}

func filterActivities(va viewerAccess, doc ChurchDoc, acts []Activity) []Activity {
	out := make([]Activity, 0, len(acts))
	for _, a := range acts {
		if canSeeActivity(va, doc, a) {
			out = append(out, a)
		}
	}
	return out
}
