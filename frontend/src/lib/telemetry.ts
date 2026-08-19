/**
 * Pamphlet-generator imports `../../telemetry` (parity with production).
 * Next correlation IDs live in `./correlation` — re-export for the portable editor.
 */
export { createCorrelationId } from "./correlation";
