/**
 * LoggerDashboard.tsx — Full flight-log observability console with analytics.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { FlightLogEntry } from "../../lib/telemetry";
import {
  fetchLogAnalytics,
  fetchLogs,
  fetchTrace,
  submitFlightLog,
  subscribeLogStream,
  type LogAnalytics,
  type LogFilters,
} from "../../lib/observability";
import { validateLoggerEvent } from "../../lib/validation";
import "./LoggerDashboard.css";

const REFRESH_MS = 15000;
const LIVE_LOG_CAP = 3000;

function logKey(log: FlightLogEntry, index: number) {
  return `${log.correlationId}-${log.timestamp}-${index}`;
}

function matchesFilters(log: FlightLogEntry, filters: LogFilters) {
  if (filters.service && !log.service.toLowerCase().includes(filters.service.toLowerCase())) {
    return false;
  }
  if (filters.status && log.status.toLowerCase() !== filters.status.toLowerCase()) {
    return false;
  }
  if (filters.correlationId && !log.correlationId.includes(filters.correlationId)) {
    return false;
  }
  if (filters.event && !log.event.toLowerCase().includes(filters.event.toLowerCase())) {
    return false;
  }
  return true;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="obs-stat">
      <span className="obs-stat__label">{label}</span>
      <span className="obs-stat__value">{value}</span>
    </div>
  );
}

function BarChart({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="obs-chart">
      <h3>{title}</h3>
      <ul className="obs-chart__bars">
        {Object.entries(data).map(([key, count]) => (
          <li key={key}>
            <span className="obs-chart__key">{key}</span>
            <div className="obs-chart__track">
              <div
                className="obs-chart__fill"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="obs-chart__count">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LoggerDashboard() {
  const [analytics, setAnalytics] = useState<LogAnalytics | null>(null);
  const [logs, setLogs] = useState<FlightLogEntry[]>([]);
  const [trace, setTrace] = useState<FlightLogEntry[]>([]);
  const [selectedCorrelation, setSelectedCorrelation] = useState("");
  const [filters, setFilters] = useState<LogFilters>({ limit: 2000 });
  const [liveMode, setLiveMode] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [emitEvent, setEmitEvent] = useState("manual.analysis.test");
  const [emitStatus, setEmitStatus] = useState<"started" | "success" | "error">("success");
  const [emitError, setEmitError] = useState("");
  const [showEmit, setShowEmit] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stats, entries] = await Promise.all([
        fetchLogAnalytics(),
        fetchLogs(filters),
      ]);
      setAnalytics(stats);
      setLogs(entries);
    } catch {
      setError("Failed to load observability data");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!liveMode) return;
    return subscribeLogStream((entry) => {
      setLogs((prev) => {
        if (!matchesFilters(entry, filters)) return prev;
        const next = [entry, ...prev];
        if (next.length > LIVE_LOG_CAP) {
          return next.slice(0, LIVE_LOG_CAP);
        }
        return next;
      });
    });
  }, [liveMode, filters]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  async function loadTrace(correlationId: string) {
    setSelectedCorrelation(correlationId);
    const hops = await fetchTrace(correlationId);
    setTrace(hops);
  }

  async function handleEmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateLoggerEvent(emitEvent);
    setEmitError(validationError ?? "");
    if (validationError) return;
    await submitFlightLog({ event: emitEvent, status: emitStatus });
    refresh();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ analytics, logs, trace }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flight-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="obs-dashboard">
      <header className="obs-dashboard__header panel">
        <div>
          <h1 className="panel__title">Flight Logger — Observability Console</h1>
          <p className="page-lead">
            Live telemetry from EC2 (DynamoDB, 7-day TTL) via SSE at{" "}
            <code>/api/logger/stream</code>. Actions on the server appear
            immediately — no manual refresh required.
          </p>
        </div>
        <div className="panel__actions">
          <label className="obs-toggle">
            <input
              type="checkbox"
              checked={liveMode}
              onChange={(e) => setLiveMode(e.target.checked)}
            />
            Live stream
          </label>
          <label className="obs-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Analytics refresh ({REFRESH_MS / 1000}s)
          </label>
          <button className="btn" type="button" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn" type="button" onClick={exportJson}>
            Export JSON
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => setShowEmit((v) => !v)}
          >
            {showEmit ? "Hide emitter" : "Emit log"}
          </button>
        </div>
      </header>

      {error && <p className="status-message status-message--error">{error}</p>}

      {analytics && (
        <section className="obs-dashboard__stats">
          <StatCard label="Total logs" value={analytics.total} />
          <StatCard label="Unique traces" value={analytics.uniqueCorrelations} />
          <StatCard
            label="Error rate"
            value={`${analytics.errorRatePercent.toFixed(1)}%`}
          />
          <StatCard
            label="Services"
            value={Object.keys(analytics.byService).length}
          />
        </section>
      )}

      {analytics && (
        <section className="obs-dashboard__charts">
          <BarChart title="By service" data={analytics.byService} />
          <BarChart title="By status" data={analytics.byStatus} />
          <BarChart title="Top events" data={analytics.byEvent} />
        </section>
      )}

      <section className="obs-dashboard__filters panel">
        <h2>Filters</h2>
        <div className="obs-filters">
          <div className="form-field">
            <label>Service</label>
            <input
              value={filters.service ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, service: e.target.value || undefined }))
              }
              placeholder="frontend, backend, tester…"
            />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value || undefined }))
              }
            >
              <option value="">All</option>
              <option value="started">started</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </div>
          <div className="form-field">
            <label>Correlation ID</label>
            <input
              value={filters.correlationId ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  correlationId: e.target.value || undefined,
                }))
              }
              placeholder="Partial match"
            />
          </div>
          <div className="form-field">
            <label>Event</label>
            <input
              value={filters.event ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, event: e.target.value || undefined }))
              }
              placeholder="auth.login, payments…"
            />
          </div>
        </div>
      </section>

      {showEmit && (
        <form className="panel obs-emit" onSubmit={handleEmit}>
          <h2>Emit test flight log</h2>
          <div className={`form-field ${emitError ? "form-field--error" : ""}`}>
            <label>Event</label>
            <input value={emitEvent} onChange={(e) => setEmitEvent(e.target.value)} />
            {emitError && <span className="field-error">{emitError}</span>}
          </div>
          <div className="form-field">
            <label>Status</label>
            <select
              value={emitStatus}
              onChange={(e) =>
                setEmitStatus(e.target.value as typeof emitStatus)
              }
            >
              <option value="started">started</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </div>
          <button className="btn btn--primary" type="submit">
            Send log
          </button>
        </form>
      )}

      <section className="obs-dashboard__grid">
        <div className="panel obs-table-wrap">
          <h2>Flight logs ({logs.length})</h2>
          <div className="obs-table-scroll">
            <table className="obs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Service</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Correlation</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={logKey(log, i)}
                    className={
                      log.correlationId === selectedCorrelation
                        ? "obs-table__row--active"
                        : ""
                    }
                    onClick={() => loadTrace(log.correlationId)}
                  >
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.service}</td>
                    <td>{log.event}</td>
                    <td>
                      <span className={`obs-badge obs-badge--${log.status}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="obs-mono">{log.correlationId.slice(0, 12)}…</td>
                    <td className="obs-mono obs-meta">
                      {log.metadata ? JSON.stringify(log.metadata) : "—"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6}>Waiting for live logs…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel obs-trace">
          <h2>
            Trace analysis
            {selectedCorrelation && (
              <span className="obs-mono"> — {selectedCorrelation}</span>
            )}
          </h2>
          {trace.length === 0 ? (
            <p className="page-lead">Click a log row to inspect its full hop chain.</p>
          ) : (
            <ol className="obs-timeline">
              {trace.map((hop, i) => (
                <li key={`${hop.timestamp}-${i}`} className="obs-timeline__item">
                  <div className="obs-timeline__meta">
                    <span className={`obs-badge obs-badge--${hop.status}`}>
                      {hop.status}
                    </span>
                    <span>{hop.service}</span>
                    <time>{new Date(hop.timestamp).toLocaleTimeString()}</time>
                  </div>
                  <div className="obs-timeline__event">{hop.event}</div>
                  {hop.metadata && (
                    <pre className="obs-timeline__meta-json">
                      {JSON.stringify(hop.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {analytics && analytics.recentErrors.length > 0 && (
        <section className="panel obs-errors">
          <h2>Recent errors</h2>
          <ul>
            {analytics.recentErrors.map((err, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="obs-link"
                  onClick={() => loadTrace(err.correlationId)}
                >
                  [{err.service}] {err.event} — {err.correlationId.slice(0, 8)}…
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
