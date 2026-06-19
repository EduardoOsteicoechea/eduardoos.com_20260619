/**
 * LoggerPanel.tsx — UI for submitting flight logs via /api/logger.
 */
import { useState, type FormEvent } from "react";
import { submitFlightLog } from "../../lib/observability";
import { validateLoggerEvent } from "../../lib/validation";
import "./LoggerPanel.css";

export default function LoggerPanel() {
  const [event, setEvent] = useState("manual.logger.test");
  const [status, setStatus] = useState<"started" | "success" | "error">("success");
  const [eventError, setEventError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateLoggerEvent(event);
    setEventError(validationError ?? "");
    if (validationError) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { ok, log } = await submitFlightLog({ event, status });
      if (!ok) {
        setError("Logger proxy returned an error");
        return;
      }
      setMessage(
        `Log ingested (correlation: ${log.correlationId}, event: ${log.event})`
      );
    } catch {
      setError("Network error — is the gateway running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="logger-panel panel" onSubmit={handleSubmit}>
      <h1 className="panel__title">Flight Logger</h1>
      <p className="page-lead">
        Submit a structured flight log to the public <code>/api/logger</code>{" "}
        gateway route. Logs are proxied to the telemetry microservice.
      </p>

      <div className={`form-field ${eventError ? "form-field--error" : ""}`}>
        <label htmlFor="logger-event">Event name</label>
        <input
          id="logger-event"
          value={event}
          onChange={(ev) => setEvent(ev.target.value)}
          required
        />
        {eventError && <span className="field-error">{eventError}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="logger-status">Status</label>
        <select
          id="logger-status"
          value={status}
          onChange={(ev) =>
            setStatus(ev.target.value as "started" | "success" | "error")
          }
        >
          <option value="started">started</option>
          <option value="success">success</option>
          <option value="error">error</option>
        </select>
      </div>

      <div className="panel__actions">
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send log"}
        </button>
      </div>

      {error && <p className="status-message status-message--error">{error}</p>}
      {message && (
        <p className="status-message status-message--success">{message}</p>
      )}
    </form>
  );
}
