/**
 * TesterDashboard.tsx — QA automation console with run history and trace linking.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { FlightLogEntry } from "../../lib/telemetry";
import {
  fetchLogs,
  fetchTesterRun,
  fetchTesterRuns,
  fetchTrace,
  runTesterScript,
  type RunsSummary,
  type TestRunRecord,
} from "../../lib/observability";
import { validateTesterScript } from "../../lib/validation";
import "../LoggerPanel/LoggerDashboard.css";
import "./TesterDashboard.css";

const REFRESH_MS = 3000;

export default function TesterDashboard() {
  const [summary, setSummary] = useState<RunsSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<TestRunRecord | null>(null);
  const [trace, setTrace] = useState<FlightLogEntry[]>([]);
  const [relatedLogs, setRelatedLogs] = useState<FlightLogEntry[]>([]);
  const [script, setScript] = useState("smoke");
  const [scriptError, setScriptError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTesterRuns();
      setSummary(data);
    } catch {
      setError("Failed to load test runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    const validationError = validateTesterScript(script);
    setScriptError(validationError ?? "");
    if (validationError) return;

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { result } = await runTesterScript({ script });
      if (!result) {
        setError("Test run failed");
        return;
      }
      setMessage(
        `Run ${result.runId.slice(0, 8)}… ${result.passed ? "PASSED" : "FAILED"} in ${result.durationMs}ms`
      );
      await refresh();
      await selectRun(result.runId);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function selectRun(runId: string) {
    const run = await fetchTesterRun(runId);
    if (!run) return;
    setSelectedRun(run);
    const [hops, logs] = await Promise.all([
      fetchTrace(run.correlationId),
      fetchLogs({ correlationId: run.correlationId, limit: 50 }),
    ]);
    setTrace(hops);
    setRelatedLogs(logs);
  }

  function exportReport() {
    const blob = new Blob(
      [JSON.stringify({ summary, selectedRun, trace, relatedLogs }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="obs-dashboard tester-dashboard">
      <header className="obs-dashboard__header panel">
        <div>
          <h1 className="panel__title">QA Tester — Automation Console</h1>
          <p className="page-lead">
            Build-time tests (Docker image build) and manual scripts are stored
            in DynamoDB for 7 days. Latest deploy build regime is highlighted
            below.
          </p>
        </div>
        <div className="panel__actions">
          <label className="obs-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="btn" type="button" onClick={refresh} disabled={loading}>
            Refresh
          </button>
          <button className="btn" type="button" onClick={exportReport}>
            Export report
          </button>
        </div>
      </header>

      {summary?.latestBuild && (
        <section className="panel tester-build-panel">
          <h2>Latest build test regime</h2>
          <dl className="tester-detail__meta">
            <dt>Build ID</dt>
            <dd className="obs-mono">{summary.latestBuild.buildId ?? "—"}</dd>
            <dt>Script</dt>
            <dd>{summary.latestBuild.script}</dd>
            <dt>Result</dt>
            <dd>
              <span
                className={`obs-badge obs-badge--${summary.latestBuild.passed ? "success" : "error"}`}
              >
                {summary.latestBuild.passed ? "passed" : "failed"}
              </span>
            </dd>
            <dt>Finished</dt>
            <dd>{new Date(summary.latestBuild.finishedAt).toLocaleString()}</dd>
          </dl>
          <ul className="tester-steps">
            {summary.latestBuild.steps.map((step, i) => (
              <li key={i}>
                <span className={`obs-badge obs-badge--${step.status}`}>
                  {step.status}
                </span>
                <span>{step.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <section className="obs-dashboard__stats">
          <div className="obs-stat">
            <span className="obs-stat__label">Total runs</span>
            <span className="obs-stat__value">{summary.totalRuns}</span>
          </div>
          <div className="obs-stat">
            <span className="obs-stat__label">Passed</span>
            <span className="obs-stat__value">{summary.passed}</span>
          </div>
          <div className="obs-stat">
            <span className="obs-stat__label">Failed</span>
            <span className="obs-stat__value">{summary.failed}</span>
          </div>
          <div className="obs-stat">
            <span className="obs-stat__label">Pass rate</span>
            <span className="obs-stat__value">
              {summary.passRatePercent.toFixed(1)}%
            </span>
          </div>
        </section>
      )}

      <form className="panel tester-run-form" onSubmit={handleRun}>
        <h2>Run script</h2>
        <div className={`form-field ${scriptError ? "form-field--error" : ""}`}>
          <label htmlFor="tester-script">Script name</label>
          <input
            id="tester-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="smoke, integration, auth_flow…"
          />
          {scriptError && <span className="field-error">{scriptError}</span>}
        </div>
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Running…" : "Execute"}
        </button>
        {error && <p className="status-message status-message--error">{error}</p>}
        {message && (
          <p className="status-message status-message--success">{message}</p>
        )}
      </form>

      <section className="obs-dashboard__grid">
        <div className="panel obs-table-wrap">
          <h2>Run history</h2>
          <div className="obs-table-scroll">
            <table className="obs-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Script</th>
                  <th>Result</th>
                  <th>Duration</th>
                  <th>Steps</th>
                  <th>Source</th>
                  <th>Build</th>
                </tr>
              </thead>
              <tbody>
                {summary?.runs?.map((run) => (
                  <tr
                    key={run.runId}
                    className={
                      selectedRun?.runId === run.runId
                        ? "obs-table__row--active"
                        : ""
                    }
                    onClick={() => selectRun(run.runId)}
                  >
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>{run.script}</td>
                    <td>
                      <span
                        className={`obs-badge obs-badge--${run.passed ? "success" : "error"}`}
                      >
                        {run.passed ? "passed" : "failed"}
                      </span>
                    </td>
                    <td>{run.durationMs}ms</td>
                    <td>{run.steps.length}</td>
                    <td>{run.source ?? "manual"}</td>
                    <td className="obs-mono">{run.buildId?.slice(0, 8) ?? "—"}</td>
                  </tr>
                ))}
                {(!summary || (summary.runs?.length ?? 0) === 0) && (
                  <tr>
                    <td colSpan={7}>No runs yet — deploy or execute a script.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel tester-detail">
          <h2>Run analysis</h2>
          {!selectedRun ? (
            <p className="page-lead">Select a run to inspect steps and traces.</p>
          ) : (
            <>
              <dl className="tester-detail__meta">
                <dt>Run ID</dt>
                <dd className="obs-mono">{selectedRun.runId}</dd>
                <dt>Correlation</dt>
                <dd className="obs-mono">{selectedRun.correlationId}</dd>
                <dt>Duration</dt>
                <dd>{selectedRun.durationMs}ms</dd>
              </dl>
              <h3>Steps</h3>
              <ul className="tester-steps">
                {selectedRun.steps.map((step, i) => (
                  <li key={i}>
                    <span className={`obs-badge obs-badge--${step.status}`}>
                      {step.status}
                    </span>
                    <span>{step.name}</span>
                    <span className="tester-steps__ms">{step.durationMs}ms</span>
                  </li>
                ))}
              </ul>
              <h3>Telemetry trace ({trace.length} hops)</h3>
              <ol className="obs-timeline">
                {trace.map((hop, i) => (
                  <li key={i} className="obs-timeline__item">
                    <div className="obs-timeline__meta">
                      <span>{hop.service}</span>
                      <span className={`obs-badge obs-badge--${hop.status}`}>
                        {hop.status}
                      </span>
                    </div>
                    <div className="obs-timeline__event">{hop.event}</div>
                  </li>
                ))}
              </ol>
              {relatedLogs.length > 0 && (
                <>
                  <h3>All correlated logs ({relatedLogs.length})</h3>
                  <ul className="tester-related-logs">
                    {relatedLogs.map((log, i) => (
                      <li key={i}>
                        [{log.service}] {log.event} — {log.status}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
