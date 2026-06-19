import { describe, expect, it, vi } from "vitest";
import {
  buildFlightLog,
  createCorrelationId,
  emitFlightLog,
  serializeFlightLog,
} from "../lib/telemetry";

describe("telemetry flight logs", () => {
  it("builds a valid flight log entry", () => {
    const entry = buildFlightLog("auth.login", "started", "corr-123", {
      email: "user@example.com",
    });

    expect(entry.service).toBe("frontend");
    expect(entry.event).toBe("auth.login");
    expect(entry.status).toBe("started");
    expect(entry.correlationId).toBe("corr-123");
    expect(entry.metadata?.email).toBe("user@example.com");
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serializes flight logs to JSON", () => {
    const entry = buildFlightLog("test", "success", "id-1");
    const json = serializeFlightLog(entry);
    expect(JSON.parse(json)).toEqual(entry);
  });

  it("creates a non-empty correlation id", () => {
    expect(createCorrelationId().length).toBeGreaterThan(8);
  });

  it("emits flight log to /api/logger with correlation header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const entry = buildFlightLog("page.view", "success", "corr-emit");

    await emitFlightLog(entry, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith("/api/logger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": "corr-emit",
      },
      body: serializeFlightLog(entry),
    });
  });
});
