/**
 * pamphletDebug.ts — Client-side pamphlet editor tracing (console + optional flight logs).
 *
 * Enable in browser console:
 *   localStorage.setItem('eduardoos-pamphlet-debug', '1')       // standard + telemetry
 *   localStorage.setItem('eduardoos-pamphlet-debug', 'verbose') // same line-by-line trace (always on editor ops)
 */

import { getAuthToken } from "./auth";
import { buildFlightLog, createCorrelationId, emitFlightLog } from "./telemetry";

const PREFIX = "[pamphlet-editor]";
let traceStep = 0;
let clickStep = 0;
let stateStep = 0;

/** Always-visible click log (console.log — shows even when Info is filtered). */
export function pamphletLogClick(label: string, detail?: Record<string, unknown>): void {
  clickStep += 1;
  console.log(`${PREFIX} CLICK #${clickStep} | ${label}`, detail ?? {});
}

/** State about to change or just changed. */
export function pamphletLogState(label: string, detail?: Record<string, unknown>): void {
  stateStep += 1;
  console.log(`${PREFIX} STATE #${stateStep} | ${label}`, detail ?? {});
}

/** Result after a state update or async action completes. */
export function pamphletLogStateResult(label: string, detail?: Record<string, unknown>): void {
  console.log(`${PREFIX} RESULT | ${label}`, detail ?? {});
}

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
  console.log(`${PREFIX} ${event}`, payload);
  const mode = debugMode();
  if (mode === "off") return;
  const correlationId = createCorrelationId();
  void emitFlightLog(
    buildFlightLog(`pamphlet.ui.${event}`, "success", correlationId, {
      detail: JSON.stringify(payload).slice(0, 500),
    }),
  );
}

/** Numbered line-by-line trace — always mirrors to console.info for editor diagnostics. */
export function pamphletTrace(step: string, detail?: Record<string, unknown>): void {
  traceStep += 1;
  const payload = {
    step: traceStep,
    at: new Date().toISOString(),
    ...detail,
    authed: Boolean(getAuthToken()),
  };
  console.info(PREFIX, "trace", step, payload);
  const mode = debugMode();
  if (mode === "standard" || mode === "verbose") {
    const correlationId = createCorrelationId();
    void emitFlightLog(
      buildFlightLog(`pamphlet.trace.${step}`, "success", correlationId, {
        detail: JSON.stringify(payload).slice(0, 800),
      }),
    );
  }
}

/** Alias for explicit step logging in hot paths. */
export function pamphletLogLine(step: string, detail?: Record<string, unknown>): void {
  pamphletTrace(step, detail);
}

export function pamphletDebugError(event: string, err: unknown, detail?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(PREFIX, event, message, detail ?? {});
  pamphletTrace(`${event}_error`, { message, ...(detail ?? {}) });
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

const SPACING_BLOCK_SELECTOR =
  ".block-paragraph, .block-heading, .block-list, .block-quote, .block-image-wrap";

const SPACING_BLOCK_TAGS =
  ".block-paragraph, .block-heading, .block-list, .block-quote, .block-image-wrap";

/** Force flex row-gap on columns so spacing survives margin collapse / global reset. */
export function pamphletEnforceColumnSpacing(root: HTMLElement | null, label: string): void {
  if (!root) {
    pamphletLogStateResult("enforce_spacing_skipped", { label, reason: "no_root" });
    return;
  }
  const columns = [...root.querySelectorAll<HTMLElement>(".column")];
  pamphletLogState("enforce_spacing_start", { label, columnCount: columns.length });
  columns.forEach((col, index) => {
    const sheet = col.closest<HTMLElement>(".sheet");
    const card = col.closest<HTMLElement>(".pamphlet-mobile-card");
    const paraSep =
      sheet?.style.getPropertyValue("--para-sep-mm") ||
      card?.style.getPropertyValue("--para-sep-mm") ||
      "4.2336mm";
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.rowGap = paraSep;
    col.querySelectorAll<HTMLElement>(SPACING_BLOCK_TAGS).forEach((block) => {
      block.style.marginBottom = "0";
    });
    pamphletLogStateResult(`enforce_spacing_column_${index}`, {
      label,
      columnId: col.id || undefined,
      paraSep,
      childCount: col.children.length,
      rowGap: col.style.rowGap,
    });
  });
  pamphletLogStateResult("enforce_spacing_done", { label, columnCount: columns.length });
}

/** Log computed spacing for each content block (line-by-line margin audit). */
export function pamphletAuditBlockSpacing(root: HTMLElement | null, label: string): void {
  if (!root || typeof window === "undefined") {
    pamphletTrace("spacing_audit_skipped", { label, reason: "root_missing" });
    return;
  }
  const blocks = [...root.querySelectorAll<HTMLElement>(SPACING_BLOCK_SELECTOR)];
  pamphletTrace("spacing_audit_start", { label, blockCount: blocks.length });
  blocks.forEach((el, index) => {
    const cs = window.getComputedStyle(el);
    pamphletTrace("spacing_audit_block", {
      label,
      index,
      ref: el.getAttribute("data-content-ref") ?? undefined,
      tag: el.tagName.toLowerCase(),
      classes: el.className,
      inlineStyle: el.getAttribute("style") ?? "",
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      heightPx: Math.round(el.getBoundingClientRect().height),
      parentTag: el.parentElement?.tagName.toLowerCase(),
    });
  });
  pamphletTrace("spacing_audit_done", { label, blockCount: blocks.length });
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
      paraSep: card.style.getPropertyValue("--para-sep-mm") || undefined,
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
  const sheets = [...root.querySelectorAll<HTMLElement>(".sheet")];
  pamphletTrace("print_source_sheets", {
    sheetCount: sheets.length,
    sheets: sheets.map((sheet, index) => ({
      index,
      id: sheet.id,
      paraSep: sheet.style.getPropertyValue("--para-sep-mm") || undefined,
      headingGap: sheet.style.getPropertyValue("--heading-gap-mm") || undefined,
    })),
  });
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
