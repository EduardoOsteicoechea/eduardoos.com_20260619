// Package obsstore — flight log and test-run persistence with live broadcast.
package obsstore

import (
	"context"
	"strings"
	"time"

	"eduardoos/pkg/common"
)

const LogTTL = 7 * 24 * time.Hour

// LogQuery filters flight log listing.
type LogQuery struct {
	Service       string
	Status        string
	CorrelationID string
	Event         string
	Limit         int
}

// LogAnalytics matches the frontend analytics contract.
type LogAnalytics struct {
	Total              int                     `json:"total"`
	UniqueCorrelations int                     `json:"uniqueCorrelations"`
	ByService          map[string]int          `json:"byService"`
	ByStatus           map[string]int          `json:"byStatus"`
	ByEvent            map[string]int          `json:"byEvent"`
	ErrorRatePercent   float64                 `json:"errorRatePercent"`
	RecentErrors       []common.FlightLogEntry `json:"recentErrors"`
}

func (q LogQuery) normalizedLimit() int {
	if q.Limit <= 0 {
		return 500
	}
	if q.Limit > 5000 {
		return 5000
	}
	return q.Limit
}

func (q LogQuery) matches(e common.FlightLogEntry) bool {
	if q.Service != "" && !strings.EqualFold(e.Service, q.Service) {
		return false
	}
	if q.Status != "" && !strings.EqualFold(e.Status, q.Status) {
		return false
	}
	if q.CorrelationID != "" && !strings.Contains(e.CorrelationID, q.CorrelationID) {
		return false
	}
	if q.Event != "" && !strings.Contains(strings.ToLower(e.Event), strings.ToLower(q.Event)) {
		return false
	}
	return true
}

// LogStore persists and streams flight logs.
type LogStore interface {
	Ingest(ctx context.Context, entry common.FlightLogEntry) error
	List(ctx context.Context, q LogQuery) ([]common.FlightLogEntry, error)
	Analytics(ctx context.Context) (LogAnalytics, error)
	Trace(ctx context.Context, correlationID string) ([]common.FlightLogEntry, error)
	Subscribe(ctx context.Context) <-chan common.FlightLogEntry
}

// TestStep is one step inside a QA run.
type TestStep struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	DurationMs int64  `json:"durationMs"`
}

// TestRun is a persisted tester execution record.
type TestRun struct {
	RunID         string     `json:"runId"`
	Script        string     `json:"script"`
	CorrelationID string     `json:"correlationId"`
	Passed        bool       `json:"passed"`
	Steps         []TestStep `json:"steps"`
	StartedAt     time.Time  `json:"startedAt"`
	FinishedAt    time.Time  `json:"finishedAt"`
	DurationMs    int64      `json:"durationMs"`
	Source        string     `json:"source,omitempty"`
	BuildID       string     `json:"buildId,omitempty"`
}

// TestStore persists QA runs (manual + build-time).
type TestStore interface {
	SaveRun(ctx context.Context, run TestRun) error
	ListRuns(ctx context.Context, limit int) ([]TestRun, error)
	GetRun(ctx context.Context, runID string) (TestRun, bool, error)
}
