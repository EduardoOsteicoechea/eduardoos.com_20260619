package ereport

import (
	"fmt"
	"strings"
)

// HistoryIndexKey is ereport/{ownerSafe}/reports/{reportId}/history-index.json (legacy flat).
func HistoryIndexKey(ownerEmail, reportID string) string {
	return fmt.Sprintf("%s/reports/%s/history-index.json",
		UserPrefix(ownerEmail), strings.TrimSpace(reportID))
}

// HistorySnapshotKey is ereport/{ownerSafe}/reports/{reportId}/history/{snapshotId}.json
func HistorySnapshotKey(ownerEmail, reportID, snapshotID string) string {
	return fmt.Sprintf("%s/reports/%s/history/%s.json",
		UserPrefix(ownerEmail), strings.TrimSpace(reportID), strings.TrimSpace(snapshotID))
}

// OrgHistoryIndexKey is ereport/{ownerSafe}/orgs/{orgId}/reports/{reportId}/history-index.json
func OrgHistoryIndexKey(ownerEmail, orgID, reportID string) string {
	return fmt.Sprintf("%s/orgs/%s/reports/%s/history-index.json",
		UserPrefix(ownerEmail), strings.TrimSpace(orgID), strings.TrimSpace(reportID))
}

// OrgHistorySnapshotKey is …/orgs/{orgId}/reports/{reportId}/history/{snapshotId}.json
func OrgHistorySnapshotKey(ownerEmail, orgID, reportID, snapshotID string) string {
	return fmt.Sprintf("%s/orgs/%s/reports/%s/history/%s.json",
		UserPrefix(ownerEmail), strings.TrimSpace(orgID), strings.TrimSpace(reportID), strings.TrimSpace(snapshotID))
}

// MaxHistorySnapshots is the retention cap per report (spec 055).
const MaxHistorySnapshots = 50
