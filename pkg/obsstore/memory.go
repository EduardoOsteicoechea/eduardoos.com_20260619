package obsstore

import (
	"context"
	"sort"
	"strings"
	"sync"

	"eduardoos/pkg/common"
)

type memoryLogStore struct {
	mu   sync.RWMutex
	logs []common.FlightLogEntry
	hub  *Hub
}

func NewMemoryLogStore() LogStore {
	return &memoryLogStore{logs: []common.FlightLogEntry{}, hub: NewHub()}
}

func (m *memoryLogStore) Ingest(_ context.Context, entry common.FlightLogEntry) error {
	m.mu.Lock()
	m.logs = append(m.logs, entry)
	m.mu.Unlock()
	m.hub.Publish(entry)
	return nil
}

func (m *memoryLogStore) List(_ context.Context, q LogQuery) ([]common.FlightLogEntry, error) {
	limit := q.normalizedLimit()
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []common.FlightLogEntry
	for i := len(m.logs) - 1; i >= 0; i-- {
		if q.matches(m.logs[i]) {
			out = append(out, m.logs[i])
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

func (m *memoryLogStore) Analytics(_ context.Context) (LogAnalytics, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return computeAnalytics(m.logs), nil
}

func (m *memoryLogStore) Trace(_ context.Context, correlationID string) ([]common.FlightLogEntry, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var out []common.FlightLogEntry
	for _, e := range m.logs {
		if e.CorrelationID == correlationID {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	return out, nil
}

func (m *memoryLogStore) Subscribe(ctx context.Context) <-chan common.FlightLogEntry {
	return m.hub.Subscribe(ctx)
}

func computeAnalytics(logs []common.FlightLogEntry) LogAnalytics {
	byService := map[string]int{}
	byStatus := map[string]int{}
	byEvent := map[string]int{}
	corrs := map[string]struct{}{}
	errors := 0
	var recent []common.FlightLogEntry
	for _, e := range logs {
		byService[e.Service]++
		byStatus[e.Status]++
		byEvent[e.Event]++
		corrs[e.CorrelationID] = struct{}{}
		if strings.EqualFold(e.Status, "error") {
			errors++
			if len(recent) < 10 {
				recent = append(recent, e)
			}
		}
	}
	total := len(logs)
	rate := 0.0
	if total > 0 {
		rate = float64(errors) / float64(total) * 100
	}
	if recent == nil {
		recent = []common.FlightLogEntry{}
	}
	return LogAnalytics{
		Total: total, UniqueCorrelations: len(corrs),
		ByService: byService, ByStatus: byStatus, ByEvent: byEvent,
		ErrorRatePercent: rate, RecentErrors: recent,
	}
}

type memoryTestStore struct {
	mu   sync.RWMutex
	runs []TestRun
}

func NewMemoryTestStore() TestStore {
	return &memoryTestStore{runs: []TestRun{}}
}

func (m *memoryTestStore) SaveRun(_ context.Context, run TestRun) error {
	m.mu.Lock()
	m.runs = append(m.runs, run)
	m.mu.Unlock()
	return nil
}

func (m *memoryTestStore) ListRuns(_ context.Context, limit int) ([]TestRun, error) {
	if limit <= 0 {
		limit = 500
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	runs := make([]TestRun, len(m.runs))
	copy(runs, m.runs)
	sort.Slice(runs, func(i, j int) bool { return runs[i].StartedAt.After(runs[j].StartedAt) })
	if len(runs) > limit {
		runs = runs[:limit]
	}
	return runs, nil
}

func (m *memoryTestStore) GetRun(_ context.Context, runID string) (TestRun, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, run := range m.runs {
		if run.RunID == runID {
			return run, true, nil
		}
	}
	return TestRun{}, false, nil
}
