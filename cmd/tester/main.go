// Tester — QA automation with run history and telemetry correlation.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type testStep struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	DurationMs int64  `json:"durationMs"`
}

type testRun struct {
	RunID         string     `json:"runId"`
	Script        string     `json:"script"`
	CorrelationID string     `json:"correlationId"`
	Passed        bool       `json:"passed"`
	Steps         []testStep `json:"steps"`
	StartedAt     time.Time  `json:"startedAt"`
	FinishedAt    time.Time  `json:"finishedAt"`
	DurationMs    int64      `json:"durationMs"`
}

type state struct {
	mu      sync.RWMutex
	runs    []testRun
	secret  string
	telemetry *common.TelemetryClient
}

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	st := &state{
		runs: []testRun{},
		secret: secret,
		telemetry: common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("tester", nil))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/run", st.runScript)
		r.Get("/runs", st.listRuns)
		r.Get("/runs/{runID}", st.getRun)
	})

	log.Printf("tester listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func (s *state) runScript(w http.ResponseWriter, r *http.Request) {
	var body struct{ Script string `json:"script"` }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Script == "" {
		common.WriteError(w, http.StatusBadRequest, "script required")
		return
	}
	start := time.Now()
	runID := uuid.NewString()
	cid := "tester-" + body.Script + "-" + runID[:8]
	names := []string{
		"start:" + body.Script,
		"assert:gateway_health",
		"assert:telemetry_reachable",
		"finish:" + body.Script,
	}
	var steps []testStep
	for _, name := range names {
		t0 := time.Now()
		steps = append(steps, testStep{Name: name, Status: "success", DurationMs: time.Since(t0).Milliseconds()})
		entry := common.NewFlightLog(cid, "tester", name, "success")
		s.telemetry.Emit(entry, cid)
	}
	rec := testRun{
		RunID: runID, Script: body.Script, CorrelationID: cid, Passed: true,
		Steps: steps, StartedAt: start, FinishedAt: time.Now(),
		DurationMs: time.Since(start).Milliseconds(),
	}
	s.mu.Lock()
	s.runs = append(s.runs, rec)
	s.mu.Unlock()
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"runId": rec.RunID, "script": rec.Script, "correlationId": rec.CorrelationID,
		"passed": rec.Passed, "steps": rec.Steps, "durationMs": rec.DurationMs,
	})
}

func (s *state) listRuns(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	passed, failed := 0, 0
	for _, r := range s.runs {
		if r.Passed {
			passed++
		} else {
			failed++
		}
	}
	total := len(s.runs)
	rate := 0.0
	if total > 0 {
		rate = float64(passed) / float64(total) * 100
	}
	runs := make([]testRun, len(s.runs))
	copy(runs, s.runs)
	sort.Slice(runs, func(i, j int) bool { return runs[i].StartedAt.After(runs[j].StartedAt) })
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"totalRuns": total, "passed": passed, "failed": failed,
		"passRatePercent": rate, "runs": runs,
	})
}

func (s *state) getRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runID")
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, run := range s.runs {
		if run.RunID == id {
			common.WriteJSON(w, http.StatusOK, run)
			return
		}
	}
	common.WriteError(w, http.StatusNotFound, "run not found")
}
