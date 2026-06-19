/**
 * telemetry.ts — Client-side flight log contract for the observability pipeline.
 *
 * Every user-facing action (auth submit, navigation) emits a structured log
 * that the backend proxies to the telemetry microservice via /api/logger.
 */

/** Shape of a single flight log entry sent to the observability engine. */
export interface FlightLogEntry {
  correlationId: string;
  service: string;
  event: string;
  status: "started" | "success" | "error";
  timestamp: string;
  metadata?: Record<string, string>;
}

/** Generates a RFC-4122-style correlation token for distributed tracing. */
export function createCorrelationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Builds a flight log payload ready for POST /api/logger. */
export function buildFlightLog(
  event: string,
  status: FlightLogEntry["status"],
  correlationId: string,
  metadata?: Record<string, string>
): FlightLogEntry {
  return {
    correlationId,
    service: "frontend",
    event,
    status,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

/** Serializes a flight log to JSON for transport and test assertions. */
export function serializeFlightLog(entry: FlightLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Sends a flight log to the backend observability proxy.
 * Failures are swallowed so telemetry never blocks user flows.
 */
export async function emitFlightLog(
  entry: FlightLogEntry,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  try {
    await fetchFn("/api/logger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": entry.correlationId,
      },
      body: serializeFlightLog(entry),
    });
  } catch {
    // Telemetry is best-effort on the client; the gateway still traces server hops.
  }
}
