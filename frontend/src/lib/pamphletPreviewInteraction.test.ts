import { describe, expect, it } from "vitest";
import {
  applyPreviewZoomIn,
  applyPreviewZoomOut,
  clampPreviewZoom,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
} from "./pamphletPreviewInteraction";

describe("pamphletPreviewInteraction", () => {
  it("clamps zoom scale to safe bounds", () => {
    expect(clampPreviewZoom(1)).toBe(1);
    expect(clampPreviewZoom(999)).toBe(PREVIEW_ZOOM_MAX);
    expect(clampPreviewZoom(0.01)).toBe(PREVIEW_ZOOM_MIN);
  });

  it("applies zoom in and out steps", () => {
    expect(applyPreviewZoomIn(1)).toBeGreaterThan(1);
    expect(applyPreviewZoomOut(applyPreviewZoomIn(1))).toBeCloseTo(1, 5);
  });
});
