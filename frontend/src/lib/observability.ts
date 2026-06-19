/**
 * observability.ts — Client helpers for /api/logger and /api/tester gateway routes.
 */

import { apiRequest } from "./api";
import { OBSERVABILITY_ROUTES } from "../config/routes";
import {
  buildFlightLog,
  createCorrelationId,
  emitFlightLog,
  type FlightLogEntry,
} from "./telemetry";

export interface LoggerSubmitInput {
  event: string;
  status: FlightLogEntry["status"];
  metadata?: Record<string, string>;
}

export interface TesterRunInput {
  script: string;
}

export interface TesterRunResult {
  script: string;
  passed: boolean;
  steps: string[];
}

/** POSTs a flight log through the public gateway logger proxy. */
export async function submitFlightLog(
  input: LoggerSubmitInput,
  fetchFn?: typeof fetch
): Promise<{ ok: boolean; log: FlightLogEntry }> {
  const correlationId = createCorrelationId();

  const started = buildFlightLog("observability.logger", "started", correlationId);
  await emitFlightLog(started, fetchFn);

  const log = buildFlightLog(
    input.event,
    input.status,
    correlationId,
    input.metadata
  );

  const verify = await apiRequest<{ ingested: boolean }>(
    OBSERVABILITY_ROUTES.logger,
    {
      method: "POST",
      body: log,
      correlationId,
      fetchFn,
    }
  );

  const resultLog = buildFlightLog(
    "observability.logger",
    verify.error ? "error" : "success",
    correlationId
  );
  await emitFlightLog(resultLog, fetchFn);

  return { ok: !verify.error, log };
}

/** Runs a tester script through the public gateway tester proxy. */
export async function runTesterScript(
  input: TesterRunInput,
  fetchFn?: typeof fetch
): Promise<{ result: TesterRunResult | null; correlationId: string }> {
  const correlationId = createCorrelationId();

  const response = await apiRequest<TesterRunResult>(
    OBSERVABILITY_ROUTES.tester,
    {
      method: "POST",
      body: input,
      correlationId,
      fetchFn,
    }
  );

  return { result: response.data ?? null, correlationId };
}
