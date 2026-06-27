import { describe, expect, it } from "vitest";
import { formatPlaybackTime } from "./formatTime";

describe("formatPlaybackTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(65)).toBe("1:05");
    expect(formatPlaybackTime(3723)).toBe("62:03");
  });

  it("handles invalid values", () => {
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
    expect(formatPlaybackTime(-1)).toBe("0:00");
  });
});
