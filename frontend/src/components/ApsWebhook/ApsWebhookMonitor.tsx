/**
 * Admin-only APS webhook monitor — live SSE feed of POST /api/aps/webhooks.
 */

import { useEffect, useRef, useState } from "react";
import {
  getAuthToken,
  isAuthenticated,
  isPlatformAdmin,
} from "../../lib/auth";
import { createCorrelationId } from "../../lib/correlation";
import "./ApsWebhookMonitor.css";

export type ApsWebhookEvent = {
  id: string;
  receivedAt: string;
  correlationId: string;
  contentType?: string;
  remoteAddr?: string;
  method?: string;
  path?: string;
  query?: string;
  headers?: Record<string, string>;
  body?: unknown;
  bodyText?: string;
};

const LIST_URL = "/api/admin/aps/webhook-events";
const STREAM_URL = "/api/admin/aps/webhook-events/stream";
const INGEST_PATH = "/api/aps/webhooks";

/** Prompt for another agent: where/how to POST APS webhooks into Eduardo OS. */
function buildAgentHandoffPrompt(callbackUrl: string): string {
  return `You are configuring Autodesk Platform Services (APS) / ACC to deliver webhooks into Eduardo OS.

## Destination (send ALL webhook traffic here)

- Method: POST
- URL: ${callbackUrl}
- Content-Type: application/json
- Body: the full APS/ACC webhook JSON payload (e.g. dm.version.added, WorkItem callbacks, or any JSON event). Do not wrap it; POST the event body as-is.
- Optional shared secret (only if the Eduardo OS server has APS_WEBHOOK_SECRET set):
  - Header: X-Aps-Webhook-Secret: <same value as APS_WEBHOOK_SECRET>
  - Or query: ${callbackUrl}?secret=<APS_WEBHOOK_SECRET>
- Optional tracing: X-Correlation-ID: <uuid>
- Expected success response: HTTP 200 JSON { "ok": true, "id": "<eventId>", "correlationId": "..." }
- Probe (no body): GET ${callbackUrl} → { "ok": true, "message": "...", "path": "/api/aps/webhooks" }

## What this endpoint does

Eduardo OS stores the payload in an in-memory ring buffer and fans it out over SSE to the admin monitor at:
https://eduardoos.com/product-tests/mps/aps-webhook
(or the same path on the current origin). It does NOT trigger Design Automation by itself in this MVP — receive + display only.

## Related Eduardo OS routes (do not confuse)

| Role | Method | Path | Auth |
|------|--------|------|------|
| Ingest (you call this) | POST | /api/aps/webhooks | Public (+ optional secret) |
| Probe | GET | /api/aps/webhooks | Public (+ optional secret) |
| Admin list | GET | /api/admin/aps/webhook-events | JWT platform admin |
| Admin live SSE | GET | /api/admin/aps/webhook-events/stream | JWT platform admin |
| Admin UI | — | /product-tests/mps/aps-webhook | Platform admin only |

## Register in APS Webhooks API

1. Create a webhook whose callbackUrl is exactly: ${callbackUrl}
2. Prefer events such as dm.version.added on the ACC Docs folder(s) to monitor.
3. Fast ACK: the server responds 200 quickly; do not require a long-running response.
4. After registering, publish/sync a test .rvt (or POST a sample JSON) and confirm the payload appears on the admin monitor page.

## Minimal curl test

curl -X POST "${callbackUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Correlation-ID: agent-test-001" \\
  -d '{"hook":{"event":"dm.version.added"},"payload":{"name":"demo.rvt","source":"agent-handoff"}}'

## Config knobs on Eduardo OS server

- APS_WEBHOOK_SECRET (optional): if set, every ingest must send the matching header/query.
- No APS_CLIENT_ID/SECRET required for ingest — this path only receives HTTP callbacks.

Send every APS/ACC webhook you create for this product-test to ${callbackUrl}.`;
}

function formatBody(ev: ApsWebhookEvent): string {
  if (ev.bodyText) return ev.bodyText;
  if (ev.body === undefined || ev.body === null) return "(empty)";
  try {
    return JSON.stringify(ev.body, null, 2);
  } catch {
    return String(ev.body);
  }
}

export default function ApsWebhookMonitor() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [events, setEvents] = useState<ApsWebhookEvent[]>([]);
  const [streamState, setStreamState] = useState<"idle" | "live" | "error">("idle");
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const seenIds = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);

  const callbackUrl =
    typeof window !== "undefined" ? `${window.location.origin}${INGEST_PATH}` : INGEST_PATH;
  const agentPrompt = buildAgentHandoffPrompt(callbackUrl);

  async function copyAgentPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("fail");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  useEffect(() => {
    const ok = isAuthenticated() && isPlatformAdmin();
    setAllowed(ok);
    if (!ok) return;

    const token = getAuthToken();
    let cancelled = false;

    async function loadList() {
      try {
        const res = await fetch(LIST_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-ID": createCorrelationId(),
          },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { events?: ApsWebhookEvent[] };
        const list = Array.isArray(data.events) ? data.events : [];
        if (cancelled) return;
        for (const ev of list) seenIds.current.add(ev.id);
        setEvents(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    async function openStream() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStreamState("idle");
      try {
        const res = await fetch(STREAM_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
            "X-Correlation-ID": createCorrelationId(),
          },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream HTTP ${res.status}`);
        }
        setStreamState("live");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "message";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const lines = chunk.split(/\r?\n/);
            let dataLine = "";
            eventName = "message";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLine += line.slice(5).trim();
              }
            }
            if (!dataLine || eventName !== "event") continue;
            try {
              const ev = JSON.parse(dataLine) as ApsWebhookEvent;
              if (!ev?.id || seenIds.current.has(ev.id)) continue;
              seenIds.current.add(ev.id);
              setEvents((prev) => [ev, ...prev].slice(0, 100));
            } catch {
              /* ignore malformed */
            }
          }
        }
        if (!cancelled) setStreamState("error");
      } catch (err) {
        if (ac.signal.aborted || cancelled) return;
        setStreamState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    void loadList().then(() => openStream());

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  if (allowed === null) {
    return <p className="aps-webhook-monitor__status">Comprobando acceso…</p>;
  }
  if (!allowed) {
    return (
      <section className="aps-webhook-monitor aps-webhook-monitor--denied" aria-labelledby="aps-wh-denied">
        <h1 id="aps-wh-denied">APS webhook</h1>
        <p>Acceso exclusivo para administradores de plataforma.</p>
      </section>
    );
  }

  return (
    <section className="aps-webhook-monitor" aria-labelledby="aps-wh-title">
      <header className="aps-webhook-monitor__head">
        <h1 id="aps-wh-title">APS webhook monitor</h1>
        <p className="aps-webhook-monitor__lead">
          Recibe payloads públicos en el backend y actualiza esta vista en vivo (SSE) cuando llegan.
        </p>
        <dl className="aps-webhook-monitor__meta">
          <div>
            <dt>Callback URL</dt>
            <dd>
              <code>{callbackUrl}</code>
            </dd>
          </div>
          <div>
            <dt>Stream</dt>
            <dd>
              <span className={`aps-webhook-monitor__pill aps-webhook-monitor__pill--${streamState}`}>
                {streamState === "live" ? "live" : streamState === "error" ? "reconnect needed" : "connecting…"}
              </span>
            </dd>
          </div>
        </dl>
        {error ? <p className="aps-webhook-monitor__error">{error}</p> : null}

        <div className="aps-webhook-monitor__prompt">
          <div className="aps-webhook-monitor__prompt-head">
            <label htmlFor="aps-agent-handoff-prompt">
              Prompt para el otro agente (endpoint, rutas y config)
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => void copyAgentPrompt()}
            >
              {copyState === "ok" ? "Copiado" : copyState === "fail" ? "Error al copiar" : "Copiar"}
            </button>
          </div>
          <textarea
            id="aps-agent-handoff-prompt"
            className="aps-webhook-monitor__prompt-box"
            readOnly
            rows={18}
            value={agentPrompt}
            spellCheck={false}
          />
        </div>
      </header>

      <ol className="aps-webhook-monitor__list">
        {events.length === 0 ? (
          <li className="aps-webhook-monitor__empty">
            Sin eventos aún. Prueba:{" "}
            <code>
              curl -X POST {callbackUrl} -H &quot;Content-Type: application/json&quot; -d
              &quot;{`{"ping":true}`}&quot;
            </code>
          </li>
        ) : (
          events.map((ev) => (
            <li key={ev.id} className="aps-webhook-monitor__card">
              <div className="aps-webhook-monitor__card-head">
                <time dateTime={ev.receivedAt}>{new Date(ev.receivedAt).toLocaleString()}</time>
                <span>id={ev.id.slice(0, 8)}…</span>
                <span>cid={ev.correlationId}</span>
              </div>
              <pre className="aps-webhook-monitor__pre">{formatBody(ev)}</pre>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
