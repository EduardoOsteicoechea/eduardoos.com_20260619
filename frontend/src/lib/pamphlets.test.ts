import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, PAMPHLET_ROUTES } from "./pamphlets";

describe("pamphlets", () => {
  it("exposes gateway routes under /api/pamphlets", () => {
    expect(PAMPHLET_ROUTES.document).toBe("/api/pamphlets/document");
    expect(PAMPHLET_ROUTES.previewSheets).toBe("/api/pamphlets/preview-sheets");
    expect(PAMPHLET_ROUTES.images).toBe("/api/pamphlets/images");
  });

  it("ships domain-default layout fields matching Go query keys", () => {
    expect(DEFAULT_LAYOUT.marginLateral).toBe(10);
    expect(DEFAULT_LAYOUT.fontSize).toBe(10);
    expect(DEFAULT_LAYOUT.lineHeight).toBe(1.2);
  });
});
