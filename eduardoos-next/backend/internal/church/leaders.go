package church

import (
	"fmt"
	"strings"
	"unicode"

	"eduardoos.nex/internal/auth"
)

// leaderDisplayName returns "nombre apellido", falling back to legacy name.
func leaderDisplayName(L Leader) string {
	first := strings.TrimSpace(L.FirstName)
	last := strings.TrimSpace(L.LastName)
	if first != "" || last != "" {
		return strings.TrimSpace(first + " " + last)
	}
	return strings.TrimSpace(L.Name)
}

// looksLikeEmail is a light check for optional leader correo.
func looksLikeEmail(s string) bool {
	s = strings.TrimSpace(s)
	at := strings.IndexByte(s, '@')
	if at < 1 || at >= len(s)-1 {
		return false
	}
	dot := strings.LastIndexByte(s, '.')
	return dot > at+1 && dot < len(s)-1
}

// looksLikePhone allows digits and common separators; requires 7–15 digits.
func looksLikePhone(s string) bool {
	digits := 0
	for _, r := range s {
		if unicode.IsDigit(r) {
			digits++
			continue
		}
		switch r {
		case ' ', '+', '-', '(', ')', '.', '/':
			continue
		default:
			return false
		}
	}
	return digits >= 7 && digits <= 15
}

// validateLeaderContacts rejects non-empty invalid optional phone/email on leaders.
func validateLeaderContacts(in []Leader) error {
	for i, L := range in {
		phone := strings.TrimSpace(L.Phone)
		if phone != "" && !looksLikePhone(phone) {
			return fmt.Errorf("leader[%d]: invalid phone", i)
		}
		email := strings.TrimSpace(L.Email)
		if email != "" && !looksLikeEmail(email) {
			return fmt.Errorf("leader[%d]: invalid email", i)
		}
	}
	return nil
}

// normalizeLeaders cleans leader rows and keeps only valid role ids.
// Accepts new {firstName,lastName,...} rows and legacy {name,roles} rows.
// New-style rows need both firstName and lastName; phone/email stay optional.
func normalizeLeaders(in []Leader) []Leader {
	out := make([]Leader, 0, len(in))
	for _, L := range in {
		first := strings.TrimSpace(L.FirstName)
		last := strings.TrimSpace(L.LastName)
		phone := strings.TrimSpace(L.Phone)
		email := strings.TrimSpace(L.Email)
		legacy := strings.TrimSpace(L.Name)

		var display string
		switch {
		case first != "" && last != "":
			display = first + " " + last
		case first == "" && last == "" && legacy != "":
			// Legacy pastors/leaders that only stored a single name string.
			display = legacy
		default:
			// Incomplete new-style row (only nombre or only apellido) — drop.
			continue
		}

		if phone != "" && !looksLikePhone(phone) {
			phone = ""
		}
		if email != "" {
			email = auth.NormalizeEmail(email)
			if !looksLikeEmail(email) {
				email = ""
			}
		}

		roles := make([]string, 0, len(L.Roles))
		seen := map[string]bool{}
		for _, r := range L.Roles {
			r = strings.TrimSpace(r)
			if !IsValidLeaderRole(r) || seen[r] {
				continue
			}
			seen[r] = true
			roles = append(roles, r)
		}
		out = append(out, Leader{
			ID:        strings.TrimSpace(L.ID),
			FirstName: first,
			LastName:  last,
			Phone:     phone,
			Email:     email,
			Name:      display,
			Roles:     roles,
		})
	}
	return out
}

// pickLeadersByID selects catalog leaders by id (preferred leadership reference).
func pickLeadersByID(catalog []LeaderDoc, ids []string) ([]Leader, []string) {
	if len(ids) == 0 || len(catalog) == 0 {
		return nil, nil
	}
	byID := map[string]LeaderDoc{}
	for _, L := range catalog {
		byID[strings.TrimSpace(L.ID)] = L
	}
	out := make([]Leader, 0, len(ids))
	idOut := make([]string, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		if L, ok := byID[id]; ok {
			seen[id] = true
			out = append(out, leaderDocToEmbedded(L))
			idOut = append(idOut, id)
		}
	}
	return out, idOut
}

// pickLeadershipFromRefs resolves church-card leadership refs as catalog ids first,
// then falls back to display-name match (legacy inline / name-only data).
func pickLeadershipFromRefs(catalog []LeaderDoc, refs []string, legacyInline []Leader) ([]Leader, []string) {
	if len(refs) == 0 {
		return nil, nil
	}
	byID := map[string]LeaderDoc{}
	byName := map[string]LeaderDoc{}
	for _, L := range catalog {
		byID[L.ID] = L
		byName[strings.ToLower(leaderDocDisplayName(L))] = L
	}
	legacyByName := map[string]Leader{}
	for _, L := range legacyInline {
		legacyByName[strings.ToLower(leaderDisplayName(L))] = L
	}

	out := make([]Leader, 0, len(refs))
	ids := make([]string, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		ref = strings.TrimSpace(ref)
		if ref == "" {
			continue
		}
		key := strings.ToLower(ref)
		if seen[key] {
			continue
		}
		if L, ok := byID[ref]; ok {
			seen[key] = true
			seen[strings.ToLower(L.ID)] = true
			out = append(out, leaderDocToEmbedded(L))
			ids = append(ids, L.ID)
			continue
		}
		if L, ok := byName[key]; ok {
			seen[key] = true
			seen[strings.ToLower(L.ID)] = true
			out = append(out, leaderDocToEmbedded(L))
			ids = append(ids, L.ID)
			continue
		}
		if L, ok := legacyByName[key]; ok {
			seen[key] = true
			out = append(out, L)
		}
	}
	return out, ids
}

// leadersFromPastors migrates legacy pastors[] into leaders[] when needed.
func leadersFromPastors(pastors []string) []Leader {
	out := make([]Leader, 0, len(pastors))
	for _, p := range pastors {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, Leader{
			Name:  p,
			Roles: []string{LeaderRoleElderBishopPastor},
		})
	}
	return out
}

// ensureLeaders returns Leaders, falling back to legacy Pastors when empty.
func ensureLeaders(doc ChurchDoc) []Leader {
	if len(doc.Leaders) > 0 {
		return normalizeLeaders(doc.Leaders)
	}
	return leadersFromPastors(doc.Pastors)
}

// pickLeadersByName selects leaders from the org catalog by display name.
func pickLeadersByName(catalog []Leader, names []string) []Leader {
	if len(names) == 0 || len(catalog) == 0 {
		return nil
	}
	byName := map[string]Leader{}
	for _, L := range catalog {
		byName[strings.ToLower(leaderDisplayName(L))] = L
	}
	out := make([]Leader, 0, len(names))
	seen := map[string]bool{}
	for _, n := range names {
		key := strings.ToLower(strings.TrimSpace(n))
		if key == "" || seen[key] {
			continue
		}
		if L, ok := byName[key]; ok {
			seen[key] = true
			out = append(out, L)
		}
	}
	return out
}

// memberDisplayName builds a display name from structured fields.
func memberDisplayName(m Member) string {
	if n := strings.TrimSpace(m.Name); n != "" {
		return n
	}
	parts := make([]string, 0, 4)
	for _, p := range []string{m.FirstName, m.SecondName, m.LastName1, m.LastName2} {
		p = strings.TrimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return strings.Join(parts, " ")
}
