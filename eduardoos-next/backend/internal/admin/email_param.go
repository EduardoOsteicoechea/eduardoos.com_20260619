package admin

import (
	"net/http"
	"net/url"
	"strings"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

// targetEmailFromRequest resolves the account email for admin mutate routes.
//
// Preference order:
//  1. Query ?email= (safest for weird local-parts — avoids path encoding pitfalls)
//  2. Chi path param {email}, URL-decoded (chi may leave %40 encoded depending on hop)
//
// Admin list/delete/entitlements must accept any stored account email that contains
// "@" after normalize — do NOT apply IsSpammyLocalPart here (register-only).
func targetEmailFromRequest(r *http.Request) string {
	raw := strings.TrimSpace(r.URL.Query().Get("email"))
	if raw == "" {
		raw = chi.URLParam(r, "email")
	}
	raw = pathDecodeEmail(raw)
	return auth.NormalizeEmail(raw)
}

// pathDecodeEmail applies PathUnescape so "%40" becomes "@". Already-decoded
// strings are returned unchanged. Invalid escape sequences keep the raw value.
func pathDecodeEmail(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return raw
	}
	return decoded
}

// isStoredAccountEmail is the loose admin check: non-empty and contains "@".
// Spammy dotted local-parts are intentionally allowed so operators can delete
// bot accounts that registered before anti-spam rules existed.
func isStoredAccountEmail(email string) bool {
	return email != "" && strings.Contains(email, "@")
}
