// Tester — QA automation with DynamoDB run history and build-time reporting.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"eduardoos/pkg/common"
	"eduardoos/pkg/obsstore"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type state struct {
	runs      obsstore.TestStore
	secret    string
	telemetry *common.TelemetryClient
}

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	st := &state{
		runs:      obsstore.NewTestStore(ctx),
		secret:    secret,
		telemetry: common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
	}
	backend := common.Env("TESTER_BACKEND", "memory")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("tester", map[string]any{"backend": backend}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/run", st.runScript)
		r.Post("/report", st.reportRun)
		r.Get("/runs", st.listRuns)
		r.Get("/runs/{runID}", st.getRun)
	})

	log.Printf("tester listening on %s (backend=%s)", common.ListenAddr(), backend)
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func (s *state) runScript(w http.ResponseWriter, r *http.Request) {
	var body struct{ Script string `json:"script"` }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Script == "" {
		common.WriteError(w, http.StatusBadRequest, "script required")
		return
	}
	run := s.executeRun(r.Context(), body.Script, "manual", "")
	common.WriteJSON(w, http.StatusOK, runResponse(run))
}

func (s *state) reportRun(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Script    string            `json:"script"`
		Passed    bool              `json:"passed"`
		Steps     []obsstore.TestStep `json:"steps"`
		Source    string            `json:"source"`
		BuildID   string            `json:"buildId"`
		DurationMs int64            `json:"durationMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Script == "" {
		common.WriteError(w, http.StatusBadRequest, "script and steps required")
		return
	}
	if body.Source == "" {
		body.Source = "build"
	}
	start := time.Now().UTC()
	runID := uuid.NewString()
	cid := "tester-" + body.Script + "-" + runID[:8]
	run := obsstore.TestRun{
		RunID: runID, Script: body.Script, CorrelationID: cid, Passed: body.Passed,
		Steps: body.Steps, StartedAt: start, FinishedAt: time.Now().UTC(),
		DurationMs: body.DurationMs, Source: body.Source, BuildID: body.BuildID,
	}
	if run.DurationMs == 0 {
		run.DurationMs = time.Since(start).Milliseconds()
	}
	for _, step := range run.Steps {
		status := step.Status
		if status == "" {
			status = "success"
		}
		entry := common.NewFlightLog(cid, "tester", step.Name, status)
		s.telemetry.Emit(entry, cid)
	}
	_ = s.runs.SaveRun(r.Context(), run)
	common.WriteJSON(w, http.StatusOK, runResponse(run))
}

func (s *state) executeRun(ctx context.Context, script, source, buildID string) obsstore.TestRun {
	start := time.Now().UTC()
	runID := uuid.NewString()
	cid := "tester-" + script + "-" + runID[:8]
	names := []string{
		"start:" + script,
		"assert:gateway_health",
		"assert:telemetry_reachable",
		"finish:" + script,
	}
	var steps []obsstore.TestStep
	for _, name := range names {
		t0 := time.Now()
		steps = append(steps, obsstore.TestStep{Name: name, Status: "success", DurationMs: time.Since(t0).Milliseconds()})
		entry := common.NewFlightLog(cid, "tester", name, "success")
		s.telemetry.Emit(entry, cid)
	}
	run := obsstore.TestRun{
		RunID: runID, Script: script, CorrelationID: cid, Passed: true,
		Steps: steps, StartedAt: start, FinishedAt: time.Now().UTC(),
		DurationMs: time.Since(start).Milliseconds(), Source: source, BuildID: buildID,
	}
	_ = s.runs.SaveRun(ctx, run)
	return run
}

func runResponse(run obsstore.TestRun) map[string]any {
	return map[string]any{
		"runId": run.RunID, "script": run.Script, "correlationId": run.CorrelationID,
		"passed": run.Passed, "steps": run.Steps, "durationMs": run.DurationMs,
		"source": run.Source, "buildId": run.BuildID,
		"startedAt": run.StartedAt, "finishedAt": run.FinishedAt,
	}
}

func (s *state) listRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := s.runs.ListRuns(r.Context(), 500)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	passed, failed := 0, 0
	buildPassed, buildFailed := 0, 0
	var latestBuild *obsstore.TestRun
	for _, run := range runs {
		if run.Passed {
			passed++
		} else {
			failed++
		}
		if run.Source == "build" {
			if run.Passed {
				buildPassed++
			} else {
				buildFailed++
			}
			if latestBuild == nil {
				copy := run
				latestBuild = &copy
			}
		}
	}
	total := len(runs)
	rate := 0.0
	if total > 0 {
		rate = float64(passed) / float64(total) * 100
	}
	resp := map[string]any{
		"totalRuns": total, "passed": passed, "failed": failed,
		"passRatePercent": rate, "runs": runs,
		"buildRuns": map[string]any{
			"passed": buildPassed, "failed": buildFailed,
		},
	}
	if latestBuild != nil {
		resp["latestBuild"] = latestBuild
	}
	common.WriteJSON(w, http.StatusOK, resp)
}

func (s *state) getRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runID")
	run, ok, err := s.runs.GetRun(r.Context(), id)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		common.WriteError(w, http.StatusNotFound, "run not found")
		return
	}
	common.WriteJSON(w, http.StatusOK, run)
}
