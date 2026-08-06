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

const DEFAULT_INPUT_KEY = "singleRoom.rvt";
const POLL_MS = 4000;
const MAX_POLLS = 180;

type TriggerResponse = {
  workItemId?: string;
  outputObjectKey?: string;
  message?: string;
};

type StatusResponse = {
  status?: string;
  done?: boolean;
  message?: string;
  extractedData?: unknown;
  workItemStatus?: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ApsAdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
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
    setStatusLabel("Submitting WorkItem…");
    const authToken = getAuthToken();
    const correlationId = createCorrelationId();

    const submitted = await apiRequest<TriggerResponse>(APS_ROUTES.triggerWorkItem, {
      method: "POST",
      body: { inputObjectKey: DEFAULT_INPUT_KEY },
      correlationId,
      authToken,
    });

    if (submitted.error || !submitted.data?.workItemId) {
      const detail = submitted.error?.debugLogs?.length
        ? `${submitted.error.message}\n\n${submitted.error.debugLogs.join("\n")}`
        : submitted.error?.message ?? "WorkItem submit failed";
      setError(detail);
      setPayload({ error: submitted.error, data: submitted.data ?? null });
      setLoading(false);
      setStatusLabel("");
      return;
    }

    const workItemId = submitted.data.workItemId;
    const outputObjectKey = submitted.data.outputObjectKey ?? "";
    setPayload(submitted.data);
    setStatusLabel(`Submitted ${workItemId}; polling APS…`);

    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      const statusRes = await apiRequest<StatusResponse>(
        APS_ROUTES.workItemStatus(workItemId, outputObjectKey),
        {
          method: "GET",
          correlationId: createCorrelationId(),
          authToken,
        },
      );

      if (statusRes.error) {
        const detail = statusRes.error.debugLogs?.length
          ? `${statusRes.error.message}\n\n${statusRes.error.debugLogs.join("\n")}`
          : statusRes.error.message;
        setError(detail);
        setPayload({ error: statusRes.error, data: statusRes.data ?? null });
        setLoading(false);
        setStatusLabel("");
        return;
      }

      const body = statusRes.data;
      setPayload(body ?? null);
      setStatusLabel(`APS status: ${body?.status ?? "unknown"}`);

      if (body?.done) {
        setLoading(false);
        setStatusLabel(body.message ?? "Done");
        return;
      }
    }

    setError("Timed out waiting for APS WorkItem (client poll limit)");
    setLoading(false);
    setStatusLabel("");
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

      {loading || statusLabel ? (
        <p className="aps-admin__status">
          {statusLabel ||
            "Waiting for Autodesk Design Automation (can take several minutes)…"}
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
