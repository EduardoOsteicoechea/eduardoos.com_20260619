package ereport

import (
	"fmt"
	"strings"
)

// HistoryIndexKey is ereport/{ownerSafe}/reports/{reportId}/history-index.json
func HistoryIndexKey(ownerEmail, reportID string) string {
	return fmt.Sprintf("%s/reports/%s/history-index.json",
		UserPrefix(ownerEmail), strings.TrimSpace(reportID))
}

// HistorySnapshotKey is ereport/{ownerSafe}/reports/{reportId}/history/{snapshotId}.json
func HistorySnapshotKey(ownerEmail, reportID, snapshotID string) string {
	return fmt.Sprintf("%s/reports/%s/history/%s.json",
		UserPrefix(ownerEmail), strings.TrimSpace(reportID), strings.TrimSpace(snapshotID))
}

// MaxHistorySnapshots is the retention cap per report (spec 055).
const MaxHistorySnapshots = 50
