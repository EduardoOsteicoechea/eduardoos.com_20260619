import { describe, expect, it } from "vitest";
import {
  applyPamphletSetting,
  computeSheet1Layout,
  DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
  PAMPHLET_LAYOUT_SETTING_DEFINITIONS,
  PAMPHLET_SHEET_HEIGHT_MM,
  PAMPHLET_SHEET_WIDTH_MM,
  pamphletLayoutToCssVars,
} from "./pamphletLayout";

describe("pamphletLayout settings", () => {
  it("exposes six activity-bar margin fields in millimeters", () => {
    expect(PAMPHLET_LAYOUT_SETTING_DEFINITIONS).toHaveLength(6);
    expect(PAMPHLET_LAYOUT_SETTING_DEFINITIONS.map((d) => d.label)).toEqual([
      "Page Top Margin",
      "Page Bottom Margin",
      "Page Lateral External Margin",
      "Page Lateral Internal Margin",
      "Page Side Column Separation",
      "Page Row Separation",
    ]);
  });

  it("applyPamphletSetting clamps invalid values and updates one key", () => {
    const next = applyPamphletSetting(DEFAULT_PAMPHLET_LAYOUT_SETTINGS, "pageTopMarginMm", 99);
    expect(next.pageTopMarginMm).toBe(40);
    expect(next.pageBottomMarginMm).toBe(DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageBottomMarginMm);
  });
});

describe("computeSheet1Layout", () => {
  it("derives content box from sheet size minus top/bottom and external margins", () => {
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(layout.contentHeightMm).toBe(
      PAMPHLET_SHEET_HEIGHT_MM -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageTopMarginMm -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageBottomMarginMm,
    );
    expect(layout.contentWidthMm).toBe(
      PAMPHLET_SHEET_WIDTH_MM - 2 * DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageLateralExternalMarginMm,
    );
  });

  it("computes right-side column height below header and row separation", () => {
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(layout.rightColumns.bodyHeightMm).toBe(
      layout.contentHeightMm -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageHeaderHeightMm -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageRowSeparationMm,
    );
  });

  it("computes left-side column height above footer and row separation", () => {
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(layout.leftColumns.bodyHeightMm).toBe(
      layout.contentHeightMm -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageFooterHeightMm -
        DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageRowSeparationMm,
    );
  });

  it("splits each half width between two columns and a vertical separation strip", () => {
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const halfWidth =
      layout.contentWidthMm / 2 - DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageLateralInternalMarginMm;
    const sep = DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageSideColumnSeparationMm;
    expect(layout.rightColumns.separationWidthMm).toBe(sep);
    expect(layout.rightColumns.col1WidthMm + layout.rightColumns.col2WidthMm + sep).toBeCloseTo(
      halfWidth,
      5,
    );
  });

  it("uses full content height for inner page columns", () => {
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(layout.innerPageColumnHeightMm).toBe(layout.contentHeightMm);
  });

  it("shrinks column height to zero when header consumes the page", () => {
    const layout = computeSheet1Layout({
      ...DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
      pageHeaderHeightMm: 999,
    });
    expect(layout.rightColumns.bodyHeightMm).toBe(0);
  });
});

describe("pamphletLayoutToCssVars", () => {
  it("maps saved settings to mm CSS variables for the preview sheet", () => {
    const vars = pamphletLayoutToCssVars({
      ...DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
      pageTopMarginMm: 12,
    });
    expect(vars["--pamphlet-sheet-w"]).toBe("279.4mm");
    expect(vars["--pamphlet-sheet-h"]).toBe("215.9mm");
    expect(vars["--pamphlet-margin-top"]).toBe("12mm");
    expect(vars["--pamphlet-col-sep"]).toBe("4mm");
    expect(vars["--pamphlet-right-col-h"]).toMatch(/mm$/);
  });
});
