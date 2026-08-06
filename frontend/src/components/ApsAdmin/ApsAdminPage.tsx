import { useEffect, useState } from "react";
import { APP_ROUTES, APS_ROUTES } from "../../config/routes";
import {
  getAuthEmailFromToken,
  getAuthToken,
  isApsAdminEmail,
  isAuthenticated,
} from "../../lib/auth";
import { apiRequest } from "../../lib/api";
import { createCorrelationId } from "../../lib/telemetry";
import "./ApsAdminPage.css";

const DEFAULT_INPUT_KEY = "Snowdon Towers Sample Architectural.rvt";

export default function ApsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.replace(
        `${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.apsAdmin)}`,
      );
      return;
    }
    setAuthorized(isApsAdminEmail(getAuthEmailFromToken()));
  }, []);

  async function handleTrigger() {
    setLoading(true);
    setError("");
    setPayload(null);
    const correlationId = createCorrelationId();
    const response = await apiRequest<unknown>(APS_ROUTES.triggerWorkItem, {
      method: "POST",
      body: { inputObjectKey: DEFAULT_INPUT_KEY },
      correlationId,
      authToken: getAuthToken(),
    });
    if (response.error) {
      setError(response.error.message);
      setPayload({
        error: response.error,
        data: response.data ?? null,
      });
    } else {
      setPayload(response.data ?? null);
    }
    setLoading(false);
  }

  if (authorized === null) {
    return <p className="aps-admin__status">Checking access…</p>;
  }

  if (!authorized) {
    return (
      <section className="aps-admin aps-admin--denied" aria-labelledby="aps-denied-title">
        <h1 id="aps-denied-title" className="aps-admin__title">
          Unauthorized
        </h1>
        <p className="aps-admin__lead">
          This page is restricted. Your account does not have access.
        </p>
      </section>
    );
  }

  return (
    <section className="aps-admin" aria-labelledby="aps-admin-title">
      <h1 id="aps-admin-title" className="aps-admin__title">
        APS Design Automation
      </h1>
      <p className="aps-admin__lead">
        One click runs Revit Design Automation on
        <code> {DEFAULT_INPUT_KEY} </code>
        in <code>aps20250806</code>, extracts model counts/project data, and
        returns the JSON result.
      </p>

      <button
        type="button"
        className="btn btn--primary"
        disabled={loading}
        onClick={() => void handleTrigger()}
      >
        {loading ? "Running extraction…" : "Extract model data"}
      </button>

      {loading ? (
        <p className="aps-admin__status">
          Waiting for Autodesk Design Automation (can take several minutes)…
        </p>
      ) : null}

      {error ? <p className="aps-admin__error">{error}</p> : null}

      {payload !== null ? (
        <pre className="aps-admin__payload" tabIndex={0}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
