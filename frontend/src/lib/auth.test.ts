import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_ROUTES,
  AUTH_SESSION_EXPIRED_EVENT,
  clearAuthToken,
  getAuthEmailFromToken,
  getAuthToken,
  hasIssuedToken,
  invalidateAuthSession,
  isAuthenticated,
  isAuthTokenExpired,
  loginUser,
  logoutUser,
  registerUser,
  saveAuthToken,
  verifyOtp,
} from "./auth";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload)).replace(/=+$/g, "");
  return `${header}.${body}.signature`;
}

describe("auth routes", () => {
  beforeEach(() => {
    clearAuthToken();
  });

  it("hasIssuedToken ignores null, empty, and missing tokens", () => {
    expect(hasIssuedToken({ message: "ok", token: null })).toBe(false);
    expect(hasIssuedToken({ message: "ok", token: "" })).toBe(false);
    expect(hasIssuedToken({ message: "ok" })).toBe(false);
    expect(hasIssuedToken({ message: "ok", token: "eyJhbGciOiJIUzI1NiJ9" })).toBe(true);
  });

  it("isAuthenticated requires a valid unexpired JWT", () => {
    const token = makeJwt({
      sub: "user@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    saveAuthToken(token);
    expect(isAuthenticated()).toBe(true);
    expect(getAuthToken()).toBe(token);
  });

  it("isAuthenticated clears expired or malformed tokens", () => {
    saveAuthToken(
      makeJwt({
        sub: "user@example.com",
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
    );
    expect(isAuthenticated()).toBe(false);
    expect(getAuthToken()).toBe("");

    saveAuthToken("not-a-jwt");
    expect(isAuthenticated()).toBe(false);
    expect(getAuthToken()).toBe("");
  });

  it("invalidateAuthSession dispatches an auth-expired event", () => {
    const handler = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
    saveAuthToken("token");
    invalidateAuthSession();
    expect(getAuthToken()).toBe("");
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handler);
  });

  it("isAuthTokenExpired detects expired JWTs", () => {
    const expired = makeJwt({ exp: 1 });
    const valid = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isAuthTokenExpired(expired, 2000)).toBe(true);
    expect(isAuthTokenExpired(valid)).toBe(false);
  });

  it("getAuthEmailFromToken reads the JWT subject", () => {
    const token = makeJwt({
      sub: "User@Example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    saveAuthToken(token);
    expect(getAuthEmailFromToken()).toBe("user@example.com");
  });
  it("exposes correct public gateway paths", () => {
    expect(AUTH_ROUTES.register).toBe("/api/auth/register");
    expect(AUTH_ROUTES.login).toBe("/api/auth/login");
    expect(AUTH_ROUTES.verifyOtp).toBe("/api/auth/verify-otp");
    expect(AUTH_ROUTES.logout).toBe("/api/auth/logout");
    expect(AUTH_ROUTES.profile).toBe("/api/auth/profile");
    expect(AUTH_ROUTES.profileImage).toBe("/api/auth/profile/image");
  });

  it("registerUser calls register endpoint and emits logs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ message: "OTP sent", token: undefined }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { result, log } = await registerUser(
      { email: "test@example.com", password: "secret123" },
      fetchMock
    );

    expect(result?.message).toBe("OTP sent");
    expect(log.event).toBe("auth.register");
    expect(log.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledWith(
      AUTH_ROUTES.register,
      expect.any(Object)
    );
  });

  it("loginUser reports error status in flight log", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify({ message: "Bad login" }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { result, log } = await loginUser(
      { email: "bad@example.com", password: "wrong" },
      fetchMock
    );

    expect(result).toBeNull();
    expect(log.status).toBe("error");
  });

  it("verifyOtp posts to verify-otp route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ message: "Verified", token: "jwt-token" }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { result } = await verifyOtp(
      { email: "test@example.com", otp: "123456" },
      fetchMock
    );

    expect(result?.token).toBe("jwt-token");
    expect(fetchMock).toHaveBeenCalledWith(
      AUTH_ROUTES.verifyOtp,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("logoutUser posts to logout route, clears token, and emits logs", async () => {
    saveAuthToken("session-jwt");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ message: "Logged out" }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { result, log } = await logoutUser(fetchMock);

    expect(result?.message).toBe("Logged out");
    expect(log.event).toBe("auth.logout");
    expect(log.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledWith(
      AUTH_ROUTES.logout,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-jwt",
        }),
      })
    );
    expect(getAuthToken()).toBe("");
  });
});
