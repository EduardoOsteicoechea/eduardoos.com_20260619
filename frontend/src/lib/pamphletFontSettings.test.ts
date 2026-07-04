import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAMPHLET_FONT_SETTINGS,
  PAMPHLET_FONT_SETTING_DEFINITIONS,
  applyPamphletFontSetting,
  pamphletFontSettingsToCssVars,
} from "./pamphletFontSettings";

describe("pamphletFontSettings", () => {
  it("ships defaults in millimeters for all four font roles", () => {
    expect(DEFAULT_PAMPHLET_FONT_SETTINGS.mainHeadingFontSizeMm).toBeGreaterThan(0);
    expect(DEFAULT_PAMPHLET_FONT_SETTINGS.regularFontSizeMm).toBeGreaterThan(0);
    expect(PAMPHLET_FONT_SETTING_DEFINITIONS).toHaveLength(4);
  });

  it("updates one font field while preserving others", () => {
    const next = applyPamphletFontSetting(DEFAULT_PAMPHLET_FONT_SETTINGS, "regularFontSizeMm", 4);
    expect(next.regularFontSizeMm).toBe(4);
    expect(next.mainHeadingFontSizeMm).toBe(DEFAULT_PAMPHLET_FONT_SETTINGS.mainHeadingFontSizeMm);
  });

  it("maps font settings to css custom properties", () => {
    const vars = pamphletFontSettingsToCssVars(DEFAULT_PAMPHLET_FONT_SETTINGS);
    expect(vars["--pamphlet-font-main-heading"]).toContain("mm");
    expect(vars["--pamphlet-font-regular"]).toContain("mm");
    expect(vars["--pamphlet-font-reference"]).toContain("mm");
  });
});
