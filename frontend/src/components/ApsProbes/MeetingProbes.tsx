/**
 * MPS meeting probes console — one-at-a-time admin probes for APS/ACC (MPSAPS-21).
 */

import { useCallback, useEffect, useState } from "react";
import {
  getAuthToken,
  isAuthenticated,
  isPlatformAdmin,
} from "../../lib/auth";
import { createCorrelationId } from "../../lib/correlation";
import { APP_ROUTES } from "../../config/routes";
import "./MeetingProbes.css";

type ProbeMeta = {
  id: string;
  title: string;
  description: string;
};

type ProbeResult = {
  ok: boolean;
  probeId: string;
  title: string;
  startedAt?: string;
  finishedAt?: string;
  summary: string;
  details?: Record<string, unknown>;
  nextStep?: string;
  httpStatus?: number;
};

type RowState = {
  status: "idle" | "running" | "ok" | "fail";
  result?: ProbeResult;
  at?: string;
  open?: boolean;
};

const CATALOG_URL = "/api/admin/aps/probes";
const runURL = (id: string) => `/api/admin/aps/probes/${encodeURIComponent(id)}`;

const FALLBACK_PROBES: ProbeMeta[] = [
  { id: "health", title: "Eduardo health", description: "Eduardo API /health responds." },
  { id: "env-check", title: "Env check", description: "Required APS env vars present (booleans only)." },
  { id: "aps-token", title: "APS 2LO token", description: "Obtain client_credentials token; never return the token." },
  { id: "webhook-ingest-get", title: "Webhook ingest GET", description: "Probe GET /api/aps/webhooks." },
  {
    id: "webhook-ingest-post-synthetic",
    title: "Webhook SYNC_COMPLETE",
    description: "POST synthetic model.sync SYNC_COMPLETE; confirm monitor store.",
  },
  {
    id: "webhook-ignore-sync-start",
    title: "Webhook SYNC_START",
    description: "POST SYNC_START; confirm stored-only (no DA trigger).",
  },
  { id: "hubs-list", title: "Hubs list", description: "Data Management hubs visible to the app." },
  { id: "projects-list", title: "Projects list", description: "Projects for configured hub." },
  { id: "docs-smoke", title: "Docs smoke", description: "Read top folders for a project." },
  { id: "admin-project-params", title: "Admin project params", description: "Admin API parameters; verbose 403." },
  { id: "hooks-list-c4r", title: "List c4r hooks", description: "Read-only adsk.c4r model.sync hooks." },
];

export default function MeetingProbes() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [probes, setProbes] = useState<ProbeMeta[]>(FALLBACK_PROBES);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [hubId, setHubId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("US");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seqSummary, setSeqSummary] = useState("");

  useEffect(() => {
    const ok = isAuthenticated() && isPlatformAdmin();
    setAllowed(ok);
    if (!ok) return;
    const token = getAuthToken();
    void (async () => {
      try {
        const res = await fetch(CATALOG_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-ID": createCorrelationId(),
          },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { probes?: ProbeMeta[] };
        if (Array.isArray(data.probes) && data.probes.length) {
          setProbes(data.probes);
        }
      } catch {
        /* keep fallback */
      }
    })();
  }, []);

  const runProbe = useCallback(
    async (probeId: string) => {
      if (busyId) return;
      setBusyId(probeId);
      setRows((prev) => ({
        ...prev,
        [probeId]: { ...prev[probeId], status: "running", open: true },
      }));
      setSeqSummary("");
      const token = getAuthToken();
      const qs = new URLSearchParams();
      if (hubId.trim()) qs.set("hubId", hubId.trim());
      if (projectId.trim()) qs.set("projectId", projectId.trim());
      if (region.trim()) qs.set("region", region.trim());
      const url = `${runURL(probeId)}${qs.toString() ? `?${qs}` : ""}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Correlation-ID": createCorrelationId(),
          },
          body: JSON.stringify({
            hubId: hubId.trim() || undefined,
            projectId: projectId.trim() || undefined,
            region: region.trim() || undefined,
          }),
        });
        const text = await res.text();
        let result: ProbeResult;
        try {
          result = JSON.parse(text) as ProbeResult;
        } catch {
          result = {
            ok: false,
            probeId,
            title: probeId,
            summary: `Non-JSON response HTTP ${res.status}`,
            details: { bodyPreview: text.slice(0, 2000) },
            nextStep: "Check Eduardo backend logs / deploy.",
          };
        }
        setRows((prev) => ({
          ...prev,
          [probeId]: {
            status: result.ok ? "ok" : "fail",
            result,
            at: new Date().toISOString(),
            open: true,
          },
        }));
      } catch (err) {
        setRows((prev) => ({
          ...prev,
          [probeId]: {
            status: "fail",
            at: new Date().toISOString(),
            open: true,
            result: {
              ok: false,
              probeId,
              title: probeId,
              summary: err instanceof Error ? err.message : String(err),
              details: { error: String(err) },
              nextStep: "Network/API error — is the backend deployed with apsprobes?",
            },
          },
        }));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, hubId, projectId, region],
  );

  async function runAllSequential() {
    if (busyId) return;
    let okN = 0;
    let failN = 0;
    for (const p of probes) {
      setBusyId(p.id);
      setRows((prev) => ({
        ...prev,
        [p.id]: { ...prev[p.id], status: "running", open: true },
      }));
      const token = getAuthToken();
      const qs = new URLSearchParams();
      if (hubId.trim()) qs.set("hubId", hubId.trim());
      if (projectId.trim()) qs.set("projectId", projectId.trim());
      if (region.trim()) qs.set("region", region.trim());
      try {
        const res = await fetch(`${runURL(p.id)}${qs.toString() ? `?${qs}` : ""}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Correlation-ID": createCorrelationId(),
          },
          body: JSON.stringify({
            hubId: hubId.trim() || undefined,
            projectId: projectId.trim() || undefined,
            region: region.trim() || undefined,
          }),
        });
        const result = (await res.json()) as ProbeResult;
        if (result.ok) okN += 1;
        else failN += 1;
        setRows((prev) => ({
          ...prev,
          [p.id]: {
            status: result.ok ? "ok" : "fail",
            result,
            at: new Date().toISOString(),
            open: !result.ok,
          },
        }));
      } catch (err) {
        failN += 1;
        setRows((prev) => ({
          ...prev,
          [p.id]: {
            status: "fail",
            at: new Date().toISOString(),
            open: true,
            result: {
              ok: false,
              probeId: p.id,
              title: p.title,
              summary: err instanceof Error ? err.message : String(err),
              nextStep: "Continue — sequential mode does not stop on failure.",
            },
          },
        }));
      }
    }
    setBusyId(null);
    setSeqSummary(`Sequential run finished: ${okN} ok, ${failN} fail (continued after failures).`);
  }

  if (allowed === null) {
    return <p className="mps-probes__status">Comprobando acceso…</p>;
  }
  if (!allowed) {
    return (
      <section className="mps-probes mps-probes--denied">
        <h1>MPS meeting probes</h1>
        <p>Acceso exclusivo para administradores de plataforma.</p>
      </section>
    );
  }

  return (
    <section className="mps-probes" aria-labelledby="mps-probes-title">
      <header className="mps-probes__head">
        <h1 id="mps-probes-title">MPS meeting probes</h1>
        <p className="mps-probes__lead">
          Click one probe at a time during the client meeting. Failures stay in their panel and do not
          block the next button. Secrets never leave the Eduardo backend.
        </p>
        <p className="mps-probes__readme">
          <strong>Meeting use:</strong> fill hub/project if known → Run env-check → aps-token → webhook
          probes → hubs/projects/docs → admin params → hooks list. Watch{" "}
          <a href={APP_ROUTES.apsWebhookMonitor}>APS webhook monitor</a> for synthetic POSTs. Default
          callback: <code>https://eduardoos.com/api/aps/webhooks</code>. Eduardo{" "}
          <code>X-Aps-Webhook-Secret</code> ≠ APS <code>x-adsk-signature</code>.
        </p>
        <div className="mps-probes__config">
          <label>
            hubId
            <input value={hubId} onChange={(e) => setHubId(e.target.value)} placeholder="APS_HUB_ID" />
          </label>
          <label>
            projectId
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="APS_PROJECT_ID"
            />
          </label>
          <label>
            region
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="US" />
          </label>
        </div>
        <div className="mps-probes__actions">
          <button
            type="button"
            className="btn"
            disabled={Boolean(busyId)}
            onClick={() => void runAllSequential()}
          >
            Run all sequentially
          </button>
          {seqSummary ? <p className="mps-probes__seq">{seqSummary}</p> : null}
        </div>
      </header>

      <ol className="mps-probes__list">
        {probes.map((p) => {
          const row = rows[p.id] ?? { status: "idle" as const };
          return (
            <li key={p.id} className="mps-probes__card">
              <div className="mps-probes__card-top">
                <div>
                  <h2>{p.title}</h2>
                  <p>{p.description}</p>
                </div>
                <div className="mps-probes__card-meta">
                  <span className={`mps-probes__chip mps-probes__chip--${row.status}`}>{row.status}</span>
                  {row.at ? <time dateTime={row.at}>{new Date(row.at).toLocaleString()}</time> : null}
                  <button
                    type="button"
                    className="btn"
                    disabled={Boolean(busyId)}
                    onClick={() => void runProbe(p.id)}
                  >
                    {row.status === "running" ? "Running…" : "Run probe"}
                  </button>
                </div>
              </div>
              {row.result ? (
                <div className="mps-probes__result">
                  <p className="mps-probes__summary">
                    <strong>{row.result.ok ? "OK" : "FAIL"}</strong> — {row.result.summary}
                  </p>
                  {row.result.nextStep ? (
                    <p className="mps-probes__next">
                      <strong>Next:</strong> {row.result.nextStep}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="mps-probes__toggle"
                    onClick={() =>
                      setRows((prev) => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], open: !prev[p.id]?.open },
                      }))
                    }
                  >
                    {row.open ? "Hide details" : "Show details"}
                  </button>
                  {row.open ? (
                    <pre className="mps-probes__pre">
                      {JSON.stringify(row.result.details ?? {}, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
