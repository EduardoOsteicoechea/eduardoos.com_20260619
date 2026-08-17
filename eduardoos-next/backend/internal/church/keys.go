// Package church implements church registry, membership RBAC, activities, and
// activity reports under the S3 prefix church/.
//
// S3 layout (bucket eduardoos20260607 when S3_BUCKET is set):
//
//	church/{denomOrWebId}/{churchId}/church.json
//	church/{denomOrWebId}/{churchId}/activities/{activityId}/activity.json
//	church/{denomOrWebId}/{churchId}/activities/{activityId}/reports/{reportId}.json
//	church/{denomOrWebId}/{churchId}/activities/{activityId}/images/{filename}
//
// DynamoDB catalog (eduardoos_catalog when CHURCH_BACKEND/DATABASE_BACKEND=dynamodb):
//
//	SK: church:d:{denom}|c:{churchId}
//	SK: church-member:u:{email}|d:{denom}|c:{churchId}
//	SK: church-auth:u:{email}  (platform approval to register; pay after approve)
//
// Roles church-admin and church-member are membership records (not JWT claims).
// Platform admin (role=admin / eduardooost@gmail.com) always has full access.
// Register requires platform approval + active church-management entitlement
// (admin bypasses both).
package church

import (
	"fmt"
	"path"
	"regexp"
	"strings"
	"unicode"
)

// RootPrefix is the top-level S3 key prefix for all Church objects.
const RootPrefix = "church"

// Membership role constants (stored on membership + church.json members).
const (
	RoleChurchAdmin  = "church-admin"
	RoleChurchMember = "church-member"
)

var safeSlugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// SanitizeSlug normalizes a user-facing name into a URL/S3 segment.
func SanitizeSlug(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}
	var b strings.Builder
	prevHyphen := false
	for _, r := range raw {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			lower := unicode.ToLower(r)
			if (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9') {
				b.WriteRune(lower)
				prevHyphen = false
			}
		case r == ' ' || r == '_' || r == '-' || r == '.' || r == '/':
			if b.Len() > 0 && !prevHyphen {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" || !safeSlugRe.MatchString(out) {
		return ""
	}
	if len(out) > 80 {
		out = out[:80]
		out = strings.Trim(out, "-")
	}
	return out
}

// IsValidSlug reports whether s is a safe path segment.
func IsValidSlug(s string) bool {
	s = strings.TrimSpace(s)
	return s != "" && safeSlugRe.MatchString(s) && len(s) <= 80
}

// NormalizeChurchRole returns church-admin or church-member.
func NormalizeChurchRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case RoleChurchAdmin:
		return RoleChurchAdmin
	default:
		return RoleChurchMember
	}
}

// ChurchPrefix is church/{denom}/{churchId}.
func ChurchPrefix(denomID, churchID string) string {
	return fmt.Sprintf("%s/%s/%s", RootPrefix, strings.Trim(denomID, "/"), strings.Trim(churchID, "/"))
}

// ChurchMetaKey is church.json under a church prefix.
func ChurchMetaKey(denomID, churchID string) string {
	return ChurchPrefix(denomID, churchID) + "/church.json"
}

// ActivityPrefix is activities/{id} under a church.
func ActivityPrefix(denomID, churchID, activityID string) string {
	return ChurchPrefix(denomID, churchID) + "/activities/" + strings.Trim(activityID, "/")
}

// ActivityMetaKey is activity.json.
func ActivityMetaKey(denomID, churchID, activityID string) string {
	return ActivityPrefix(denomID, churchID, activityID) + "/activity.json"
}

// ReportKey is reports/{reportId}.json under an activity.
func ReportKey(denomID, churchID, activityID, reportID string) string {
	return ActivityPrefix(denomID, churchID, activityID) + "/reports/" + strings.Trim(reportID, "/") + ".json"
}

// ImageKey is images/{filename} under an activity.
func ImageKey(denomID, churchID, activityID, filename string) string {
	return ActivityPrefix(denomID, churchID, activityID) + "/images/" + path.Base(strings.TrimSpace(filename))
}

// CatalogSK builds the Dynamo SK for a church card.
func CatalogSK(denomID, churchID string) string {
	return "church:d:" + strings.TrimSpace(denomID) + "|c:" + strings.TrimSpace(churchID)
}

// CatalogSKPrefix is the begins_with prefix for all church cards.
func CatalogSKPrefix() string {
	return "church:d:"
}

// MembershipSK builds the Dynamo SK for a user→church membership.
func MembershipSK(email, denomID, churchID string) string {
	return "church-member:u:" + strings.ToLower(strings.TrimSpace(email)) +
		"|d:" + strings.TrimSpace(denomID) +
		"|c:" + strings.TrimSpace(churchID)
}

// MembershipSKPrefixForUser is begins_with for one user's memberships.
func MembershipSKPrefixForUser(email string) string {
	return "church-member:u:" + strings.ToLower(strings.TrimSpace(email)) + "|"
}
