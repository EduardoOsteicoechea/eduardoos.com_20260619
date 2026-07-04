/**
 * pamphletFontSettings.ts — Preview typography sizes expressed in millimeters.
 */

export interface PamphletFontSettings {
  mainHeadingFontSizeMm: number;
  regularHeadingFontSizeMm: number;
  regularFontSizeMm: number;
  referenceFontSizeMm: number;
}

export type PamphletFontSettingKey = keyof PamphletFontSettings;

export interface PamphletFontSettingDefinition {
  key: PamphletFontSettingKey;
  label: string;
  tooltip: string;
  min: number;
  max: number;
  step: number;
}

/** ~10pt body size converted to mm for the preview editor. */
export const DEFAULT_PAMPHLET_FONT_SETTINGS: PamphletFontSettings = {
  mainHeadingFontSizeMm: 4.4,
  regularHeadingFontSizeMm: 4,
  regularFontSizeMm: 3.53,
  referenceFontSizeMm: 3,
};

export const PAMPHLET_FONT_SETTING_DEFINITIONS: PamphletFontSettingDefinition[] = [
  {
    key: "mainHeadingFontSizeMm",
    label: "Main heading font size",
    tooltip: "Primary heading size in millimeters",
    min: 2,
    max: 12,
    step: 0.1,
  },
  {
    key: "regularHeadingFontSizeMm",
    label: "Regular heading font size",
    tooltip: "Section heading size in millimeters",
    min: 2,
    max: 10,
    step: 0.1,
  },
  {
    key: "regularFontSizeMm",
    label: "Regular font size",
    tooltip: "Body text size in millimeters",
    min: 2,
    max: 8,
    step: 0.1,
  },
  {
    key: "referenceFontSizeMm",
    label: "Reference font size",
    tooltip: "Image legend and quote reference size in millimeters",
    min: 1.5,
    max: 6,
    step: 0.1,
  },
];

const LINE_HEIGHT_FACTOR = 1.2;
const TEXT_CHAR_WIDTH_FACTOR = 0.55;
const HEIGHT_CALIBRATION = 0.95;

function clampFontMm(value: number, max = 12): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}

/** Returns updated font settings after applying one saved field. */
export function applyPamphletFontSetting(
  settings: PamphletFontSettings,
  key: PamphletFontSettingKey,
  rawValue: number,
): PamphletFontSettings {
  const def = PAMPHLET_FONT_SETTING_DEFINITIONS.find((item) => item.key === key);
  const max = def?.max ?? 12;
  return {
    ...settings,
    [key]: clampFontMm(rawValue, max),
  };
}

/** Maps font settings to CSS custom properties for preview typography. */
export function pamphletFontSettingsToCssVars(settings: PamphletFontSettings): Record<string, string> {
  return {
    "--pamphlet-font-main-heading": `${clampFontMm(settings.mainHeadingFontSizeMm, 12)}mm`,
    "--pamphlet-font-regular-heading": `${clampFontMm(settings.regularHeadingFontSizeMm, 10)}mm`,
    "--pamphlet-font-regular": `${clampFontMm(settings.regularFontSizeMm, 8)}mm`,
    "--pamphlet-font-reference": `${clampFontMm(settings.referenceFontSizeMm, 6)}mm`,
    "--pamphlet-line-height": String(LINE_HEIGHT_FACTOR),
  };
}

/** Estimates characters per line from column width and font size in mm. */
export function charsPerLineForWidth(columnWidthMm: number, fontSizeMm: number): number {
  const avgCharMm = fontSizeMm * TEXT_CHAR_WIDTH_FACTOR;
  if (avgCharMm <= 0) {
    return 0;
  }
  return Math.floor(columnWidthMm / avgCharMm);
}

/** Returns one line of leading in millimeters. */
export function lineHeightMm(fontSizeMm: number): number {
  return fontSizeMm * LINE_HEIGHT_FACTOR * HEIGHT_CALIBRATION;
}

/** Estimates wrapped text height in millimeters. */
export function measureTextHeightMm(text: string, columnWidthMm: number, fontSizeMm: number): number {
  const normalized = text.trim();
  if (!normalized || columnWidthMm <= 0 || fontSizeMm <= 0) {
    return lineHeightMm(fontSizeMm);
  }
  const chars = charsPerLineForWidth(columnWidthMm, fontSizeMm);
  if (chars <= 0) {
    return lineHeightMm(fontSizeMm);
  }
  const words = normalized.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
  let lines = 0;
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= chars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines++;
    }
    current = word;
  }
  if (current) {
    lines++;
  }
  return Math.max(1, lines) * lineHeightMm(fontSizeMm);
}

export { LINE_HEIGHT_FACTOR, HEIGHT_CALIBRATION };
