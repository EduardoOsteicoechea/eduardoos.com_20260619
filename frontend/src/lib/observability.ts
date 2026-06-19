/**
 * observability.ts — Full observability API client for dashboards and analysis.
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

export interface TestStep {
  name: string;
  status: string;
  durationMs: number;
}

export interface TesterRunResult {
  runId: string;
  script: string;
  correlationId: string;
  passed: boolean;
  steps: TestStep[];
  durationMs: number;
}

export interface TestRunRecord extends TesterRunResult {
  startedAt: string;
  finishedAt: string;
}

export interface RunsSummary {
  totalRuns: number;
  passed: number;
  failed: number;
  passRatePercent: number;
  runs: TestRunRecord[];
}

export interface LogAnalytics {
  total: number;
  uniqueCorrelations: number;
  byService: Record<string, number>;
  byStatus: Record<string, number>;
  byEvent: Record<string, number>;
  errorRatePercent: number;
  recentErrors: FlightLogEntry[];
}

export interface LogFilters {
  service?: string;
  status?: string;
  correlationId?: string;
  event?: string;
  limit?: number;
}

function buildQuery(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.status) params.set("status", filters.status);
  if (filters.correlationId) params.set("correlation_id", filters.correlationId);
  if (filters.event) params.set("event", filters.event);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchLogAnalytics(
  fetchFn?: typeof fetch
): Promise<LogAnalytics | null> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<LogAnalytics>(
    OBSERVABILITY_ROUTES.analytics,
    { correlationId, fetchFn }
  );
  return response.data ?? null;
}

export async function fetchLogs(
  filters: LogFilters = {},
  fetchFn?: typeof fetch
): Promise<FlightLogEntry[]> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<FlightLogEntry[]>(
    `${OBSERVABILITY_ROUTES.logs}${buildQuery(filters)}`,
    { correlationId, fetchFn }
  );
  return response.data ?? [];
}

export async function fetchTrace(
  correlationId: string,
  fetchFn?: typeof fetch
): Promise<FlightLogEntry[]> {
  const response = await apiRequest<FlightLogEntry[]>(
    `${OBSERVABILITY_ROUTES.trace}/${encodeURIComponent(correlationId)}`,
    { correlationId: createCorrelationId(), fetchFn }
  );
  return response.data ?? [];
}

export async function fetchTesterRuns(
  fetchFn?: typeof fetch
): Promise<RunsSummary | null> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<RunsSummary>(OBSERVABILITY_ROUTES.testerRuns, {
    correlationId,
    fetchFn,
  });
  return response.data ?? null;
}

export async function fetchTesterRun(
  runId: string,
  fetchFn?: typeof fetch
): Promise<TestRunRecord | null> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<TestRunRecord>(
    `${OBSERVABILITY_ROUTES.testerRuns}/${encodeURIComponent(runId)}`,
    { correlationId, fetchFn }
  );
  return response.data ?? null;
}

export async function submitFlightLog(
  input: LoggerSubmitInput,
  fetchFn?: typeof fetch
): Promise<{ ok: boolean; log: FlightLogEntry }> {
  const correlationId = createCorrelationId();
  await emitFlightLog(
    buildFlightLog("observability.logger", "started", correlationId),
    fetchFn
  );

  const log = buildFlightLog(
    input.event,
    input.status,
    correlationId,
    input.metadata
  );

  const verify = await apiRequest<{ ingested: boolean }>(
    OBSERVABILITY_ROUTES.logger,
    { method: "POST", body: log, correlationId, fetchFn }
  );

  await emitFlightLog(
    buildFlightLog(
      "observability.logger",
      verify.error ? "error" : "success",
      correlationId
    ),
    fetchFn
  );

  return { ok: !verify.error, log };
}

export async function runTesterScript(
  input: TesterRunInput,
  fetchFn?: typeof fetch
): Promise<{ result: TesterRunResult | null; correlationId: string }> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<TesterRunResult>(
    OBSERVABILITY_ROUTES.tester,
    { method: "POST", body: input, correlationId, fetchFn }
  );
  return {
    result: response.data ?? null,
    correlationId: response.data?.correlationId ?? correlationId,
  };
}

/** Groups flight logs by correlation ID for trace analysis. */
export function groupByCorrelation(
  logs: FlightLogEntry[]
): Map<string, FlightLogEntry[]> {
  const map = new Map<string, FlightLogEntry[]>();
  for (const log of logs) {
    const list = map.get(log.correlationId) ?? [];
    list.push(log);
    map.set(log.correlationId, list);
  }
  return map;
}
