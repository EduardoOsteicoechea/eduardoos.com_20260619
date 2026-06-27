/**
 * auth.ts — Authentication route helpers for the public gateway endpoints.
 *
 * Routes (all bypass gateway JWT middleware):
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/auth/verify-otp
 */

import { apiRequest, type ApiError } from "./api";
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
  token?: string | null;
}

/** True only when the gateway returned a non-empty JWT string. */
export function hasIssuedToken(data?: AuthSuccess | null): boolean {
  return typeof data?.token === "string" && data.token.trim().length > 0;
}

export const AUTH_ROUTES = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  verifyOtp: "/api/auth/verify-otp",
} as const;

const AUTH_TOKEN_KEY = "eduardoos-auth-token";

/** Persists the JWT issued by the authenticator after login or OTP verification. */
export function saveAuthToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

/** Returns the stored JWT for authenticated gateway routes (e.g. playlists). */
export function getAuthToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

/** Clears the stored session token. */
export function clearAuthToken(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** Registers a new user and emits flight logs for each lifecycle phase. */
export async function registerUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch
): Promise<{ result: AuthSuccess | null; log: FlightLogEntry; error?: ApiError }> {
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

  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }

  return { result: response.data ?? null, log, error: response.error };
}

/** Logs in an existing user. */
export async function loginUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch
): Promise<{ result: AuthSuccess | null; log: FlightLogEntry; error?: ApiError }> {
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

  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }

  return { result: response.data ?? null, log, error: response.error };
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

  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }

  return { result: response.data ?? null, log };
}
