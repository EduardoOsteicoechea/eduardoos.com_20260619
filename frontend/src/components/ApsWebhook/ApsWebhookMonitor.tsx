/**
 * Admin-only APS webhook monitor — live SSE feed of POST /api/aps/webhooks.
 * Newest events first; FE + ingest errors print verbosely on this page.
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
  kind?: string;
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
  error?: string;
  httpStatus?: number;
};

type VerboseError = {
  id: string;
  at: string;
  source: string;
  message: string;
  detail: string;
};

const LIST_URL = "/api/admin/aps/webhook-events";
const STREAM_URL = "/api/admin/aps/webhook-events/stream";
const INGEST_PATH = "/api/aps/webhooks";
const MAX_ERRORS = 50;

function formatBody(ev: ApsWebhookEvent): string {
  if (ev.bodyText) return ev.bodyText;
  if (ev.body === undefined || ev.body === null) {
    if (ev.error) return ev.error;
    return "(empty)";
  }
  try {
    return JSON.stringify(ev.body, null, 2);
  } catch {
    return String(ev.body);
  }
}

function eventTimeMs(ev: ApsWebhookEvent): number {
  const t = Date.parse(ev.receivedAt);
  return Number.isFinite(t) ? t : 0;
}

/** Newest POST / error event first. */
function sortNewestFirst(list: ApsWebhookEvent[]): ApsWebhookEvent[] {
  return [...list].sort((a, b) => eventTimeMs(b) - eventTimeMs(a));
}

function mergeEvents(prev: ApsWebhookEvent[], next: ApsWebhookEvent[]): ApsWebhookEvent[] {
  const byId = new Map<string, ApsWebhookEvent>();
  for (const ev of prev) byId.set(ev.id, ev);
  for (const ev of next) byId.set(ev.id, ev);
  return sortNewestFirst([...byId.values()]).slice(0, 100);
}

function describeErr(err: unknown): { message: string; detail: string } {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Error",
      detail: [err.name, err.message, err.stack].filter(Boolean).join("\n"),
    };
  }
  try {
    return { message: String(err), detail: JSON.stringify(err, null, 2) };
  } catch {
    return { message: String(err), detail: String(err) };
  }
}

export default function ApsWebhookMonitor() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [events, setEvents] = useState<ApsWebhookEvent[]>([]);
  const [verboseErrors, setVerboseErrors] = useState<VerboseError[]>([]);
  const [streamState, setStreamState] = useState<"idle" | "live" | "error">("idle");
  const seenIds = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);

  const callbackUrl =
    typeof window !== "undefined" ? `${window.location.origin}${INGEST_PATH}` : INGEST_PATH;

  function pushVerboseError(source: string, err: unknown, extra = "") {
    const { message, detail } = describeErr(err);
    const entry: VerboseError = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      source,
      message,
      detail: extra ? `${detail}\n\n---\n${extra}` : detail,
    };
    setVerboseErrors((prev) => [entry, ...prev].slice(0, MAX_ERRORS));
  }

  useEffect(() => {
    const ok = isAuthenticated() && isPlatformAdmin();
    setAllowed(ok);
    if (!ok) return;

    const token = getAuthToken();
    let cancelled = false;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let backoffMs = 1500;

    function stopPoll() {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startPoll() {
      if (pollTimer !== null || cancelled) return;
      pollTimer = window.setInterval(() => {
        void refreshList("poll");
      }, 2000);
    }

    function diagnostics(extra: string): string {
      return [
        extra,
        `url=${window.location.origin}${STREAM_URL}`,
        `listUrl=${window.location.origin}${LIST_URL}`,
        `online=${navigator.onLine}`,
        `hasToken=${Boolean(token)}`,
        `tokenLen=${token?.length ?? 0}`,
        `userAgent=${navigator.userAgent}`,
      ].join("\n");
    }

    async function refreshList(source: string) {
      const cid = createCorrelationId();
      try {
        const res = await fetch(LIST_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Correlation-ID": cid,
          },
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`GET ${LIST_URL} → HTTP ${res.status}\n${text}`);
        }
        let data: { events?: ApsWebhookEvent[] };
        try {
          data = JSON.parse(text) as { events?: ApsWebhookEvent[] };
        } catch (parseErr) {
          pushVerboseError(`${source}.json_parse`, parseErr, text.slice(0, 4000));
          return;
        }
        const list = sortNewestFirst(Array.isArray(data.events) ? data.events : []);
        if (cancelled) return;
        for (const ev of list) seenIds.current.add(ev.id);
        setEvents((prev) => mergeEvents(prev, list));
      } catch (err) {
        if (!cancelled) {
          pushVerboseError(`${source}.fetch`, err, diagnostics(`correlationId=${cid}`));
        }
      }
    }

    async function openStream() {
      if (cancelled) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStreamState("idle");
      const cid = createCorrelationId();
      try {
        const res = await fetch(STREAM_URL, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
            "X-Correlation-ID": cid,
          },
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`GET ${STREAM_URL} → HTTP ${res.status} ${res.statusText}\n${text}`);
        }
        setStreamState("live");
        stopPoll();
        backoffMs = 1500;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) {
            if (!cancelled) {
              setStreamState("error");
              pushVerboseError(
                "stream.ended",
                new Error("SSE stream closed by server (will reconnect + poll)"),
                diagnostics(`correlationId=${cid}`),
              );
              startPoll();
              scheduleReconnect();
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const lines = chunk.split(/\r?\n/);
            let dataLine = "";
            let eventName = "message";
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
              if (!ev?.id) {
                pushVerboseError("stream.event_missing_id", new Error("SSE event without id"), dataLine);
                continue;
              }
              if (seenIds.current.has(ev.id)) continue;
              seenIds.current.add(ev.id);
              setEvents((prev) => mergeEvents(prev, [ev]));
            } catch (parseErr) {
              pushVerboseError("stream.event_parse", parseErr, dataLine.slice(0, 4000));
            }
          }
        }
      } catch (err) {
        if (ac.signal.aborted || cancelled) return;
        setStreamState("error");
        const name = err instanceof Error ? err.name : "Error";
        const message = err instanceof Error ? err.message : String(err);
        pushVerboseError(
          "stream.fetch",
          err,
          diagnostics(
            [
              `correlationId=${cid}`,
              `errorName=${name}`,
              `errorMessage=${message}`,
              "hint=If HTTP 404, backend deploy missing apswebhook routes. If Failed to fetch/network error, check nginx SSE proxy + backend :3000.",
            ].join("\n"),
          ),
        );
        startPoll();
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (cancelled || reconnectTimer !== null) return;
      const wait = backoffMs;
      backoffMs = Math.min(backoffMs * 1.6, 20000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void openStream();
      }, wait);
    }

    void refreshList("list").then(() => openStream());

    return () => {
      cancelled = true;
      stopPoll();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      abortRef.current?.abort();
    };
  }, []);

  if (allowed === null) {
    return <p className="aps-webhook-monitor__status">Checking access…</p>;
  }
  if (!allowed) {
    return (
      <section className="aps-webhook-monitor aps-webhook-monitor--denied" aria-labelledby="aps-wh-denied">
        <h1 id="aps-wh-denied">APS webhook</h1>
        <p>Platform administrators only.</p>
      </section>
    );
  }

  return (
    <section className="aps-webhook-monitor" aria-labelledby="aps-wh-title">
      <header className="aps-webhook-monitor__head">
        <h1 id="aps-wh-title">APS webhook monitor</h1>
        <p className="aps-webhook-monitor__lead">
          Public ingest lands on the Eduardo backend and updates this view live (SSE). Newest POST first.
          Ingest and monitor errors print below verbosely. Sync means Revit Sync With Central (C4R{" "}
          <code>adsk.c4r</code> / <code>model.sync</code>), not Design Automation.{" "}
          <a href="/product-tests/mps/meeting-probes">MPS meeting probes</a> — isolated APS/ACC setup
          buttons.
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
                {streamState === "live"
                  ? "live"
                  : streamState === "error"
                    ? "polling + reconnect…"
                    : "connecting…"}
              </span>
            </dd>
          </div>
        </dl>
      </header>

      {verboseErrors.length > 0 ? (
        <section className="aps-webhook-monitor__errors" aria-label="Verbose errors">
          <h2>Errors (newest first)</h2>
          <ol className="aps-webhook-monitor__error-list">
            {verboseErrors.map((e) => (
              <li key={e.id} className="aps-webhook-monitor__error-card">
                <div className="aps-webhook-monitor__card-head">
                  <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
                  <span>{e.source}</span>
                  <strong>{e.message}</strong>
                </div>
                <pre className="aps-webhook-monitor__pre aps-webhook-monitor__pre--error">{e.detail}</pre>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <h2 className="aps-webhook-monitor__list-title">Events (newest POST first)</h2>
      <ol className="aps-webhook-monitor__list">
        {events.length === 0 ? (
          <li className="aps-webhook-monitor__empty">
            No events yet. Try:{" "}
            <code>
              curl -X POST {callbackUrl} -H &quot;Content-Type: application/json&quot; -d
              &quot;{`{"ping":true}`}&quot;
            </code>
          </li>
        ) : (
          events.map((ev) => (
            <li
              key={ev.id}
              className={`aps-webhook-monitor__card${ev.kind === "error" ? " aps-webhook-monitor__card--error" : ""}`}
            >
              <div className="aps-webhook-monitor__card-head">
                <time dateTime={ev.receivedAt}>{new Date(ev.receivedAt).toLocaleString()}</time>
                <span>{ev.kind === "error" ? "ERROR" : "POST"}</span>
                {ev.httpStatus ? <span>HTTP {ev.httpStatus}</span> : null}
                <span>id={ev.id.slice(0, 8)}…</span>
                <span>cid={ev.correlationId}</span>
                {ev.error ? <strong>{ev.error}</strong> : null}
              </div>
              <pre className="aps-webhook-monitor__pre">{formatBody(ev)}</pre>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
