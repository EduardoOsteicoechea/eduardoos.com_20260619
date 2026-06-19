import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

describe("api client", () => {
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
});
