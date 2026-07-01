import { describe, expect, it, vi } from "vitest";
import {
  AUTH_ROUTES,
  getAuthToken,
  hasIssuedToken,
  loginUser,
  logoutUser,
  registerUser,
  saveAuthToken,
  verifyOtp,
} from "./auth";

describe("auth routes", () => {
  it("hasIssuedToken ignores null, empty, and missing tokens", () => {
    expect(hasIssuedToken({ message: "ok", token: null })).toBe(false);
    expect(hasIssuedToken({ message: "ok", token: "" })).toBe(false);
    expect(hasIssuedToken({ message: "ok" })).toBe(false);
    expect(hasIssuedToken({ message: "ok", token: "eyJhbGciOiJIUzI1NiJ9" })).toBe(true);
  });
  it("exposes correct public gateway paths", () => {
    expect(AUTH_ROUTES.register).toBe("/api/auth/register");
    expect(AUTH_ROUTES.login).toBe("/api/auth/login");
    expect(AUTH_ROUTES.verifyOtp).toBe("/api/auth/verify-otp");
    expect(AUTH_ROUTES.logout).toBe("/api/auth/logout");
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
