/**
 * Auth helpers for Eduardo OS Next.
 * Token storage key is intentionally distinct from production (`eduardoos-auth-token`)
 * so local Next and prod sessions do not collide in the same browser.
 */

import { AUTH_API_ROUTES } from "../config/routes";
import { apiRequest, type ApiError } from "./api";
import { createCorrelationId } from "./correlation";

export interface AuthCredentials {
  email: string;
  password: string;
  /** Set true after register anti-bot hold (Contact pattern). */
  notABot?: boolean;
  humanToken?: string;
}

export interface OtpVerification {
  email: string;
  otp: string;
}

export interface AuthSuccess {
  message: string;
  token?: string | null;
}

export function hasIssuedToken(data?: AuthSuccess | null): boolean {
  return typeof data?.token === "string" && data.token.trim().length > 0;
}

/** Next-only localStorage key — do not reuse production key. */
export const AUTH_TOKEN_KEY = "eduardoos-next-auth-token";
export const AUTH_SESSION_EXPIRED_EVENT = "eduardoos-next-auth-session-expired";

export const APS_ADMIN_EMAIL = "eduardooost@gmail.com";

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  role?: unknown;
  exp?: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized.padEnd(normalized.length + padLength, "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function claimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAuthTokenExpired(token: string, nowMs = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return true;
  return nowMs >= exp * 1000;
}

export function saveAuthToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getAuthToken(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}

export function clearAuthToken(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function invalidateAuthSession(): void {
  clearAuthToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
  }
}

export function isAuthenticated(): boolean {
  const token = getAuthToken().trim();
  if (!token || isAuthTokenExpired(token)) {
    if (token) invalidateAuthSession();
    return false;
  }
  return decodeJwtPayload(token) !== null;
}

export function getAuthEmailFromToken(): string | null {
  const token = getAuthToken().trim();
  if (!token || isAuthTokenExpired(token)) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const email = claimString(payload.sub) ?? claimString(payload.email);
  return email ? email.toLowerCase() : null;
}

/** RBAC role from JWT (`admin` | `user`). Bootstrap admin email always counts as admin. */
export function getAuthRoleFromToken(): string {
  if (isApsAdminEmail(getAuthEmailFromToken())) return "admin";
  const token = getAuthToken().trim();
  if (!token || isAuthTokenExpired(token)) return "user";
  const payload = decodeJwtPayload(token);
  const role = claimString(payload?.role)?.toLowerCase() ?? "";
  return role === "admin" ? "admin" : "user";
}

export function isApsAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === APS_ADMIN_EMAIL;
}

/**
 * Platform admin: bootstrap APS email allowlist OR JWT/stored role `admin`.
 * Prefer this over isApsAdminEmail alone for service gates / entitlements.
 */
export function isPlatformAdmin(
  email: string | null | undefined = getAuthEmailFromToken(),
  role: string | null | undefined = getAuthRoleFromToken(),
): boolean {
  if (isApsAdminEmail(email)) return true;
  return (role ?? "").trim().toLowerCase() === "admin";
}

export async function registerUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.register, {
    method: "POST",
    body: credentials,
    correlationId,
    fetchFn,
  });
  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }
  return { result: response.data ?? null, correlationId, error: response.error };
}

export async function loginUser(
  credentials: AuthCredentials,
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.login, {
    method: "POST",
    body: credentials,
    correlationId,
    fetchFn,
  });
  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }
  return { result: response.data ?? null, correlationId, error: response.error };
}

export async function verifyOtp(
  payload: OtpVerification,
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.verifyOtp, {
    method: "POST",
    body: payload,
    correlationId,
    fetchFn,
  });
  if (hasIssuedToken(response.data)) {
    saveAuthToken(response.data!.token!.trim());
  }
  return { result: response.data ?? null, correlationId, error: response.error };
}

export async function requestPasswordReset(
  email: string,
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.forgotPassword, {
    method: "POST",
    body: { email },
    correlationId,
    fetchFn,
  });
  return { result: response.data ?? null, correlationId, error: response.error };
}

export async function confirmPasswordReset(
  payload: { email: string; otp: string; password: string },
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  // Send both field names so older/newer backends both accept the new password.
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.resetPassword, {
    method: "POST",
    body: {
      email: payload.email,
      otp: payload.otp,
      password: payload.password,
      newPassword: payload.password,
    },
    correlationId,
    fetchFn,
  });
  return { result: response.data ?? null, correlationId, error: response.error };
}

export async function logoutUser(
  fetchFn?: typeof fetch,
): Promise<{ result: AuthSuccess | null; correlationId: string; error?: ApiError }> {
  const correlationId = createCorrelationId();
  const token = getAuthToken();
  const response = await apiRequest<AuthSuccess>(AUTH_API_ROUTES.logout, {
    method: "POST",
    body: {},
    correlationId,
    authToken: token || undefined,
    fetchFn,
  });
  clearAuthToken();
  return { result: response.data ?? null, correlationId, error: response.error };
}
