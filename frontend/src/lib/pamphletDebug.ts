/**
 * pamphletDebug.ts — Client-side pamphlet editor tracing (console + optional flight logs).
 *
 * Enable in browser console:
 *   localStorage.setItem('eduardoos-pamphlet-debug', '1')       // standard + telemetry
 *   localStorage.setItem('eduardoos-pamphlet-debug', 'verbose') // line-by-line trace
 */

import { getAuthToken } from "./auth";
import { buildFlightLog, createCorrelationId, emitFlightLog } from "./telemetry";

const PREFIX = "[pamphlet-editor]";
let traceStep = 0;

function debugMode(): "off" | "standard" | "verbose" {
  if (typeof localStorage === "undefined") return "off";
  const raw = localStorage.getItem("eduardoos-pamphlet-debug");
  if (raw === "verbose" || raw === "2") return "verbose";
  if (raw === "1") return "standard";
  return "off";
}

/** Always logs to console; emits flight log when debug flag is on. */
export function pamphletDebug(event: string, detail?: Record<string, unknown>): void {
  const payload = { ...detail, authed: Boolean(getAuthToken()) };
  console.info(PREFIX, event, payload);
  const mode = debugMode();
  if (mode === "off") return;
  const correlationId = createCorrelationId();
  void emitFlightLog(
    buildFlightLog(`pamphlet.ui.${event}`, "success", correlationId, {
      detail: JSON.stringify(payload).slice(0, 500),
    }),
  );
}

/** Line-by-line trace when debug mode is `verbose` (also mirrors to console.info). */
export function pamphletTrace(step: string, detail?: Record<string, unknown>): void {
  traceStep += 1;
  const payload = {
    step: traceStep,
    at: new Date().toISOString(),
    ...detail,
    authed: Boolean(getAuthToken()),
  };
  const mode = debugMode();
  if (mode === "verbose") {
    console.info(PREFIX, "trace", step, payload);
  } else if (mode === "standard") {
    console.debug(PREFIX, "trace", step, payload);
  }
}

export function pamphletDebugError(event: string, err: unknown, detail?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(PREFIX, event, message, detail ?? {});
}

/** Summarize a DOM node for console feedback. */
export function pamphletDomSummary(el: Element | null | undefined): Record<string, unknown> {
  if (!el || !(el instanceof HTMLElement)) {
    return { connected: false };
  }
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: el.className || undefined,
    contentRef: el.getAttribute("data-content-ref") ?? undefined,
    mobileOrder: el.getAttribute("data-mobile-order") ?? undefined,
    isEditing: el.classList.contains("is-editing"),
    textLen: (el.textContent ?? "").trim().length,
    rect: {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      top: Math.round(rect.top),
    },
    connected: el.isConnected,
  };
}

/** Log ordered mobile-stream nodes after layout. */
export function pamphletLogMobileStream(root: HTMLElement | null): void {
  if (!root) {
    pamphletTrace("mobile_stream_audit", { error: "root_missing" });
    return;
  }
  const cards = [...root.querySelectorAll<HTMLElement>(".pamphlet-mobile-card")];
  pamphletTrace("mobile_stream_audit", {
    cardCount: cards.length,
    cards: cards.map((card, index) => ({
      index,
      order: card.getAttribute("data-mobile-order"),
      sourceId: card.getAttribute("data-stream-source-id"),
      ...pamphletDomSummary(card),
    })),
  });
}

/** Log all data-mobile-order nodes in the print source tree. */
export function pamphletLogPrintSource(root: HTMLElement | null): void {
  if (!root) {
    pamphletTrace("print_source_audit", { error: "root_missing" });
    return;
  }
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-mobile-order]")];
  pamphletTrace("print_source_audit", {
    nodeCount: nodes.length,
    nodes: nodes.map((node, index) => ({
      index,
      order: node.getAttribute("data-mobile-order"),
      ...pamphletDomSummary(node),
    })),
  });
}

/** Reset trace counter (e.g. on full preview reload). */
export function pamphletResetTrace(): void {
  traceStep = 0;
  pamphletTrace("trace_reset");
}
