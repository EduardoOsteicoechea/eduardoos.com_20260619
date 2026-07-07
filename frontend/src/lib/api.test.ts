import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";
import { getAuthToken, saveAuthToken } from "./auth";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload)).replace(/=+$/g, "");
  return `${header}.${body}.signature`;
}

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it("sends correlation header on requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });

    await apiRequest("/api/health", {
      correlationId: "corr-api-1",
      fetchFn: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Correlation-ID": "corr-api-1",
        }),
      })
    );
  });

  it("returns parsed error on non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ message: "Invalid credentials" }),
    });

    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "a@b.com", password: "x" },
      correlationId: "corr-err",
      fetchFn: fetchMock,
    });

    expect(result.error?.status).toBe(401);
    expect(result.error?.message).toBe("Invalid credentials");
  });

  it("clears the stored session when the gateway rejects the JWT", async () => {
    saveAuthToken(
      makeJwt({
        sub: "user@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ message: "invalid token" }),
    });

    const result = await apiRequest("/api/auth/profile", {
      correlationId: "corr-invalid",
      authToken: getAuthToken(),
      fetchFn: fetchMock,
    });

    expect(result.error?.message).toBe("invalid token");
    expect(getAuthToken()).toBe("");
  });

  it("returns debug logs from error payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () =>
        JSON.stringify({
          message: "authorization required",
          correlation_id: "corr-debug",
          debug_logs: ["authGate: Authorization header missing"],
        }),
    });

    const result = await apiRequest("/api/payments/intents", {
      method: "POST",
      body: { email: "a@b.com" },
      correlationId: "corr-debug",
      fetchFn: fetchMock,
    });

    expect(result.error?.correlationId).toBe("corr-debug");
    expect(result.error?.debugLogs).toEqual([
      "authGate: Authorization header missing",
    ]);
    expect(getAuthToken()).toBe("");
  });
});
