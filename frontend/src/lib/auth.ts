/**
 * auth.ts — Authentication route helpers for the public gateway endpoints.
 *
 * Routes (all bypass gateway JWT middleware):
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/verify-otp
 */

import { apiRequest } from "./api";
import {
  buildFlightLog,
  createCorrelationId,
  emitFlightLog,
  type FlightLogEntry,
} from "./telemetry";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface OtpVerification {
  email: string;
  otp: string;
}

export interface AuthSuccess {
  message: string;
  token?: string;
}

export const AUTH_ROUTES = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  verifyOtp: "/api/auth/verify-otp",
} as const;

/** Registers a new user and emits flight logs for each lifecycle phase. */
export async function registerUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch
): Promise<{ result: AuthSuccess | null; log: FlightLogEntry }> {
  const correlationId = createCorrelationId();
  const started = buildFlightLog("auth.register", "started", correlationId, {
    email: credentials.email,
  });
  await emitFlightLog(started, fetchFn);

  const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.register, {
    method: "POST",
    body: credentials,
    correlationId,
    fetchFn,
  });

  const log = buildFlightLog(
    "auth.register",
    response.error ? "error" : "success",
    correlationId,
    { email: credentials.email }
  );
  await emitFlightLog(log, fetchFn);

  return { result: response.data ?? null, log };
}

/** Logs in an existing user. */
export async function loginUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch
): Promise<{ result: AuthSuccess | null; log: FlightLogEntry }> {
  const correlationId = createCorrelationId();
  const started = buildFlightLog("auth.login", "started", correlationId, {
    email: credentials.email,
  });
  await emitFlightLog(started, fetchFn);

  const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.login, {
    method: "POST",
    body: credentials,
    correlationId,
    fetchFn,
  });

  const log = buildFlightLog(
    "auth.login",
    response.error ? "error" : "success",
    correlationId,
    { email: credentials.email }
  );
  await emitFlightLog(log, fetchFn);

  return { result: response.data ?? null, log };
}

/** Verifies a one-time password sent via SMTP. */
export async function verifyOtp(
  payload: OtpVerification,
  fetchFn?: typeof fetch
): Promise<{ result: AuthSuccess | null; log: FlightLogEntry }> {
  const correlationId = createCorrelationId();
  const started = buildFlightLog("auth.verify-otp", "started", correlationId, {
    email: payload.email,
  });
  await emitFlightLog(started, fetchFn);

  const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.verifyOtp, {
    method: "POST",
    body: payload,
    correlationId,
    fetchFn,
  });

  const log = buildFlightLog(
    "auth.verify-otp",
    response.error ? "error" : "success",
    correlationId,
    { email: payload.email }
  );
  await emitFlightLog(log, fetchFn);

  return { result: response.data ?? null, log };
}
