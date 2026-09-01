// Package ereport stores Issue Tracker .ereport files under S3 prefix ereport/.
//
// Legacy (flat, still served by older handlers — no migrate):
//
//	ereport/{ownerSafe}/library.json
//	ereport/{ownerSafe}/reports/{reportId}/meta.json
//	ereport/{ownerSafe}/reports/{reportId}/report.ereport
//	ereport/{viewerSafe}/shared-index.json
//
// Org-based (feature 046 — new work only):
//
//	ereport/{ownerSafe}/orgs.json
//	ereport/{ownerSafe}/orgs/{orgId}/meta.json
//	ereport/{ownerSafe}/orgs/{orgId}/library.json
//	ereport/{ownerSafe}/orgs/{orgId}/reports/{reportId}/meta.json
//	ereport/{ownerSafe}/orgs/{orgId}/reports/{reportId}/report.ereport
//	ereport/invites/{token}.json
package ereport

import (
	"fmt"
	"strings"
)

// RootPrefix is the top-level S3 key prefix for all eReport objects.
const RootPrefix = "ereport"

// SafeEmailKey turns an email into a filesystem/S3/URL-safe segment.
func SafeEmailKey(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	email = strings.ReplaceAll(email, "@", "_at_")
	email = strings.ReplaceAll(email, "/", "_")
	return email
}

// UserPrefix is ereport/{userSafe} with no trailing slash.
func UserPrefix(email string) string {
	return fmt.Sprintf("%s/%s", RootPrefix, SafeEmailKey(email))
}

func LibraryKey(email string) string {
	return UserPrefix(email) + "/library.json"
}

func SharedIndexKey(email string) string {
	return UserPrefix(email) + "/shared-index.json"
}

func MetaKey(ownerEmail, reportID string) string {
	return fmt.Sprintf("%s/reports/%s/meta.json", UserPrefix(ownerEmail), strings.TrimSpace(reportID))
}

func ReportKey(ownerEmail, reportID string) string {
	return fmt.Sprintf("%s/reports/%s/report.ereport", UserPrefix(ownerEmail), strings.TrimSpace(reportID))
}

func ReportPrefix(ownerEmail, reportID string) string {
	return fmt.Sprintf("%s/reports/%s/", UserPrefix(ownerEmail), strings.TrimSpace(reportID))
}

// --- Org-based keys (046) ---

// OrgsIndexKey is the owner's org list: ereport/{ownerSafe}/orgs.json
func OrgsIndexKey(email string) string {
	return UserPrefix(email) + "/orgs.json"
}

// OrgMetaKey is ereport/{ownerSafe}/orgs/{orgId}/meta.json
func OrgMetaKey(ownerEmail, orgID string) string {
	return fmt.Sprintf("%s/orgs/%s/meta.json", UserPrefix(ownerEmail), strings.TrimSpace(orgID))
}

// OrgLibraryKey is ereport/{ownerSafe}/orgs/{orgId}/library.json
func OrgLibraryKey(ownerEmail, orgID string) string {
	return fmt.Sprintf("%s/orgs/%s/library.json", UserPrefix(ownerEmail), strings.TrimSpace(orgID))
}

// OrgMetaKeyBySafe builds meta key from the URL-safe owner segment (invite paths).
func OrgMetaKeyBySafe(ownerSafe, orgID string) string {
	return fmt.Sprintf("%s/%s/orgs/%s/meta.json", RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(orgID))
}

// OrgLibraryKeyBySafe builds library key from the URL-safe owner segment.
func OrgLibraryKeyBySafe(ownerSafe, orgID string) string {
	return fmt.Sprintf("%s/%s/orgs/%s/library.json", RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(orgID))
}

// OrgReportMetaKey is ereport/{ownerSafe}/orgs/{orgId}/reports/{reportId}/meta.json
func OrgReportMetaKey(ownerEmail, orgID, reportID string) string {
	return fmt.Sprintf("%s/orgs/%s/reports/%s/meta.json",
		UserPrefix(ownerEmail), strings.TrimSpace(orgID), strings.TrimSpace(reportID))
}

// OrgReportKey is ereport/{ownerSafe}/orgs/{orgId}/reports/{reportId}/report.ereport
func OrgReportKey(ownerEmail, orgID, reportID string) string {
	return fmt.Sprintf("%s/orgs/%s/reports/%s/report.ereport",
		UserPrefix(ownerEmail), strings.TrimSpace(orgID), strings.TrimSpace(reportID))
}

// OrgReportMetaKeyBySafe builds org report meta from ownerSafe (invite / public paths).
func OrgReportMetaKeyBySafe(ownerSafe, orgID, reportID string) string {
	return fmt.Sprintf("%s/%s/orgs/%s/reports/%s/meta.json",
		RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(orgID), strings.TrimSpace(reportID))
}

// OrgReportKeyBySafe builds org report payload key from ownerSafe.
func OrgReportKeyBySafe(ownerSafe, orgID, reportID string) string {
	return fmt.Sprintf("%s/%s/orgs/%s/reports/%s/report.ereport",
		RootPrefix, strings.TrimSpace(ownerSafe), strings.TrimSpace(orgID), strings.TrimSpace(reportID))
}

// OrgPrefix is ereport/{ownerSafe}/orgs/{orgId}/ (trailing slash for ListKeys deletes).
func OrgPrefix(ownerEmail, orgID string) string {
	return fmt.Sprintf("%s/orgs/%s/", UserPrefix(ownerEmail), strings.TrimSpace(orgID))
}

// InviteKey is ereport/invites/{token}.json
func InviteKey(token string) string {
	return fmt.Sprintf("%s/invites/%s.json", RootPrefix, strings.TrimSpace(token))
}
