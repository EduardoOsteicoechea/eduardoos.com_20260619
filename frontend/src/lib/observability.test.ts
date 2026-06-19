import { describe, expect, it, vi } from "vitest";
import { APP_ROUTES, OBSERVABILITY_ROUTES } from "../config/routes";
import { runTesterScript, submitFlightLog } from "./observability";

describe("observability routes config", () => {
  it("maps frontend pages to API proxies", () => {
    expect(APP_ROUTES.logger).toBe("/observability/logger");
    expect(APP_ROUTES.tester).toBe("/observability/tester");
    expect(OBSERVABILITY_ROUTES.logger).toBe("/api/logger");
    expect(OBSERVABILITY_ROUTES.tester).toBe("/api/tester");
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
          script: "smoke",
          passed: true,
          steps: ["start:smoke"],
        }),
    });

    const { result } = await runTesterScript(
      { script: "smoke" },
      fetchMock
    );

    expect(result?.passed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      OBSERVABILITY_ROUTES.tester,
      expect.objectContaining({ method: "POST" })
    );
  });
});
