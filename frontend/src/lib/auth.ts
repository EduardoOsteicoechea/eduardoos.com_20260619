import { apiRequest, type ApiError } from "./api";
import { buildFlightLog, createCorrelationId, emitFlightLog, type FlightLogEntry, } from "./telemetry";
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
export function hasIssuedToken(data?: AuthSuccess | null): boolean {
    return typeof data?.token === "string" && data.token.trim().length > 0;
}
export const AUTH_ROUTES = {
    register: "/api/auth/register",
    login: "/api/auth/login",
    verifyOtp: "/api/auth/verify-otp",
    forgotPassword: "/api/auth/forgot-password",
    resetPassword: "/api/auth/reset-password",
    logout: "/api/auth/logout",
    profile: "/api/auth/profile",
    profileImage: "/api/auth/profile/image",
} as const;
const AUTH_TOKEN_KEY = "eduardoos-auth-token";
export const AUTH_SESSION_EXPIRED_EVENT = "eduardoos-auth-session-expired";
interface JwtPayload {
    sub?: unknown;
    exp?: unknown;
}
function decodeJwtPayload(token: string): JwtPayload | null {
    try {
        const payloadPart = token.split(".")[1];
        if (!payloadPart) {
            return null;
        }
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padLength = (4 - (normalized.length % 4)) % 4;
        const padded = normalized.padEnd(normalized.length + padLength, "=");
        return JSON.parse(atob(padded)) as JwtPayload;
    }
    catch {
        return null;
    }
}
export function isAuthTokenExpired(token: string, nowMs = Date.now()): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload) {
        return true;
    }
    const exp = payload.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) {
        return true;
    }
    return nowMs >= exp * 1000;
}
export function saveAuthToken(token: string): void {
    if (typeof localStorage === "undefined")
        return;
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}
export function getAuthToken(): string {
    if (typeof localStorage === "undefined")
        return "";
    return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
}
export function clearAuthToken(): void {
    if (typeof localStorage === "undefined")
        return;
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
        if (token) {
            invalidateAuthSession();
        }
        return false;
    }
    return decodeJwtPayload(token) !== null;
}
export function getAuthEmailFromToken(): string | null {
    const token = getAuthToken().trim();
    if (!token || isAuthTokenExpired(token)) {
        return null;
    }
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.sub !== "string") {
        return null;
    }
    const email = payload.sub.trim().toLowerCase();
    return email.length > 0 ? email : null;
}
export const APS_ADMIN_EMAIL = "eduardooost@gmail.com";
export function isApsAdminEmail(email: string | null | undefined): boolean {
    return (email ?? "").trim().toLowerCase() === APS_ADMIN_EMAIL;
}
export async function registerUser(credentials: AuthCredentials, fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
    error?: ApiError;
}> {
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
    const log = buildFlightLog("auth.register", response.error ? "error" : "success", correlationId, { email: credentials.email });
    await emitFlightLog(log, fetchFn);
    if (hasIssuedToken(response.data)) {
        saveAuthToken(response.data!.token!.trim());
    }
    return { result: response.data ?? null, log, error: response.error };
}
export async function loginUser(credentials: AuthCredentials, fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
    error?: ApiError;
}> {
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
    const log = buildFlightLog("auth.login", response.error ? "error" : "success", correlationId, { email: credentials.email });
    await emitFlightLog(log, fetchFn);
    if (hasIssuedToken(response.data)) {
        saveAuthToken(response.data!.token!.trim());
    }
    return { result: response.data ?? null, log, error: response.error };
}
export async function verifyOtp(payload: OtpVerification, fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
}> {
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
    const log = buildFlightLog("auth.verify-otp", response.error ? "error" : "success", correlationId, { email: payload.email });
    await emitFlightLog(log, fetchFn);
    if (hasIssuedToken(response.data)) {
        saveAuthToken(response.data!.token!.trim());
    }
    return { result: response.data ?? null, log };
}
export async function requestPasswordReset(email: string, fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
    error?: ApiError;
}> {
    const correlationId = createCorrelationId();
    const started = buildFlightLog("auth.forgot-password", "started", correlationId, { email });
    await emitFlightLog(started, fetchFn);
    const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.forgotPassword, {
        method: "POST",
        body: { email },
        correlationId,
        fetchFn,
    });
    const log = buildFlightLog("auth.forgot-password", response.error ? "error" : "success", correlationId, { email });
    await emitFlightLog(log, fetchFn);
    return { result: response.data ?? null, log, error: response.error };
}
export async function confirmPasswordReset(payload: {
    email: string;
    otp: string;
    password: string;
}, fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
    error?: ApiError;
}> {
    const correlationId = createCorrelationId();
    const started = buildFlightLog("auth.reset-password", "started", correlationId, {
        email: payload.email,
    });
    await emitFlightLog(started, fetchFn);
    const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.resetPassword, {
        method: "POST",
        body: payload,
        correlationId,
        fetchFn,
    });
    const log = buildFlightLog("auth.reset-password", response.error ? "error" : "success", correlationId, {
        email: payload.email,
    });
    await emitFlightLog(log, fetchFn);
    return { result: response.data ?? null, log, error: response.error };
}
export async function logoutUser(fetchFn?: typeof fetch): Promise<{
    result: AuthSuccess | null;
    log: FlightLogEntry;
    error?: ApiError;
}> {
    const correlationId = createCorrelationId();
    const token = getAuthToken();
    const started = buildFlightLog("auth.logout", "started", correlationId, {});
    await emitFlightLog(started, fetchFn);
    const response = await apiRequest<AuthSuccess>(AUTH_ROUTES.logout, {
        method: "POST",
        body: {},
        correlationId,
        authToken: token || undefined,
        fetchFn,
    });
    clearAuthToken();
    const log = buildFlightLog("auth.logout", response.error ? "error" : "success", correlationId, {});
    await emitFlightLog(log, fetchFn);
    return { result: response.data ?? null, log, error: response.error };
}
