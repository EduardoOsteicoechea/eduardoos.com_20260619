/**
 * pamphletDebug.ts — Client-side pamphlet editor tracing (console + optional flight logs).
 */

import { getAuthToken } from "./auth";
import { buildFlightLog, createCorrelationId, emitFlightLog } from "./telemetry";

const PREFIX = "[pamphlet-editor]";

/** Logs pamphlet UI events when localStorage key eduardoos-pamphlet-debug is "1". */
export function pamphletDebug(event: string, detail?: Record<string, unknown>): void {
  const payload = { ...detail, authed: Boolean(getAuthToken()) };
  console.info(PREFIX, event, payload);
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem("eduardoos-pamphlet-debug") !== "1") return;
  const correlationId = createCorrelationId();
  void emitFlightLog(
    buildFlightLog(`pamphlet.ui.${event}`, "success", correlationId, {
      detail: JSON.stringify(payload).slice(0, 500),
    }),
  );
}

export function pamphletDebugError(event: string, err: unknown, detail?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(PREFIX, event, message, detail ?? {});
}
