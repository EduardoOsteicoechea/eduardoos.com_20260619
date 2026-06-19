import { describe, expect, it, vi } from "vitest";
import { OBSERVABILITY_ROUTES } from "../config/routes";
import {
  groupByCorrelation,
  runTesterScript,
  submitFlightLog,
} from "./observability";

describe("observability routes config", () => {
  it("maps dashboard API endpoints", () => {
    expect(OBSERVABILITY_ROUTES.logs).toBe("/api/logger/logs");
    expect(OBSERVABILITY_ROUTES.stream).toBe("/api/logger/stream");
    expect(OBSERVABILITY_ROUTES.analytics).toBe("/api/logger/analytics");
    expect(OBSERVABILITY_ROUTES.trace).toBe("/api/logger/trace");
    expect(OBSERVABILITY_ROUTES.testerRuns).toBe("/api/tester/runs");
  });
});

describe("observability clients", () => {
  it("submitFlightLog posts to logger API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ingested: true }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { ok, log } = await submitFlightLog(
      { event: "test.event", status: "success" },
      fetchMock
    );

    expect(ok).toBe(true);
    expect(log.event).toBe("test.event");
    expect(fetchMock).toHaveBeenCalledWith(
      OBSERVABILITY_ROUTES.logger,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("runTesterScript posts to tester API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          runId: "r1",
          script: "smoke",
          correlationId: "c1",
          passed: true,
          steps: [],
          durationMs: 5,
        }),
    });

    const { result } = await runTesterScript({ script: "smoke" }, fetchMock);

    expect(result?.passed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      OBSERVABILITY_ROUTES.tester,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("groupByCorrelation clusters traces", () => {
    const map = groupByCorrelation([
      {
        correlationId: "a",
        service: "s",
        event: "e",
        status: "success",
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        correlationId: "a",
        service: "s2",
        event: "e2",
        status: "success",
        timestamp: "2026-01-01T00:00:01Z",
      },
    ]);
    expect(map.get("a")?.length).toBe(2);
  });
});
