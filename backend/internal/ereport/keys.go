// Package ereport stores Issue Tracker .ereport files under S3 prefix ereport/.
//
//	ereport/{ownerSafe}/library.json
//	ereport/{ownerSafe}/reports/{reportId}/meta.json
//	ereport/{ownerSafe}/reports/{reportId}/report.ereport
//	ereport/{viewerSafe}/shared-index.json
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
