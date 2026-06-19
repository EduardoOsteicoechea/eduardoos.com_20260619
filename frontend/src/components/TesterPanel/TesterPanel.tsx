/**
 * TesterPanel.tsx — UI for running QA scripts via /api/tester.
 */
import { useState, type FormEvent } from "react";
import { runTesterScript } from "../../lib/observability";
import { validateTesterScript } from "../../lib/validation";
import "./TesterPanel.css";

export default function TesterPanel() {
  const [script, setScript] = useState("smoke");
  const [scriptError, setScriptError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateTesterScript(script);
    setScriptError(validationError ?? "");
    if (validationError) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { result, correlationId } = await runTesterScript({ script });
      if (!result) {
        setError("Tester proxy returned an error");
        return;
      }
      setMessage(
        `Script "${result.script}" ${result.passed ? "passed" : "failed"} — steps: ${result.steps.join(", ")} (trace: ${correlationId})`
      );
    } catch {
      setError("Network error — is the gateway running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="tester-panel panel" onSubmit={handleSubmit}>
      <h1 className="panel__title">QA Tester</h1>
      <p className="page-lead">
        Execute an internal test script through the public{" "}
        <code>/api/tester</code> gateway route.
      </p>

      <div className={`form-field ${scriptError ? "form-field--error" : ""}`}>
        <label htmlFor="tester-script">Script name</label>
        <input
          id="tester-script"
          value={script}
          onChange={(ev) => setScript(ev.target.value)}
          placeholder="smoke"
          required
        />
        {scriptError && <span className="field-error">{scriptError}</span>}
      </div>

      <div className="panel__actions">
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Running…" : "Run script"}
        </button>
      </div>

      {error && <p className="status-message status-message--error">{error}</p>}
      {message && (
        <p className="status-message status-message--success">{message}</p>
      )}
    </form>
  );
}
