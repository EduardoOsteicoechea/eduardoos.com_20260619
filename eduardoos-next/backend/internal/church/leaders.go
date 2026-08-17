package church

import (
	"strings"
)

// normalizeLeaders cleans leader rows and keeps only valid role ids.
func normalizeLeaders(in []Leader) []Leader {
	out := make([]Leader, 0, len(in))
	for _, L := range in {
		name := strings.TrimSpace(L.Name)
		if name == "" {
			continue
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
		out = append(out, Leader{Name: name, Roles: roles})
	}
	return out
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
		byName[strings.ToLower(strings.TrimSpace(L.Name))] = L
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
