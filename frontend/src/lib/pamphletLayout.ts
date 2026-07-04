/**
 * pamphletLayout.ts — US Letter pamphlet preview geometry (all spatial units in mm).
 */

export const PAMPHLET_SHEET_WIDTH_MM = 279.4;
export const PAMPHLET_SHEET_HEIGHT_MM = 215.9;

export interface PamphletLayoutSettings {
  pageTopMarginMm: number;
  pageBottomMarginMm: number;
  pageLateralExternalMarginMm: number;
  pageLateralInternalMarginMm: number;
  pageSideColumnSeparationMm: number;
  pageRowSeparationMm: number;
  pageHeaderHeightMm: number;
  pageFooterHeightMm: number;
}

export type PamphletSettingKey = keyof PamphletLayoutSettings;

export interface PamphletSettingDefinition {
  key: PamphletSettingKey;
  label: string;
  tooltip: string;
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_PAMPHLET_LAYOUT_SETTINGS: PamphletLayoutSettings = {
  pageTopMarginMm: 10,
  pageBottomMarginMm: 10,
  pageLateralExternalMarginMm: 10,
  pageLateralInternalMarginMm: 5,
  pageSideColumnSeparationMm: 4,
  pageRowSeparationMm: 5,
  pageHeaderHeightMm: 25,
  pageFooterHeightMm: 25,
};

export const PAMPHLET_LAYOUT_SETTING_DEFINITIONS: PamphletSettingDefinition[] = [
  {
    key: "pageTopMarginMm",
    label: "Page Top Margin",
    tooltip: "Top safe margin in millimeters",
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    key: "pageBottomMarginMm",
    label: "Page Bottom Margin",
    tooltip: "Bottom safe margin in millimeters",
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    key: "pageLateralExternalMarginMm",
    label: "Page Lateral External Margin",
    tooltip: "Outer left and right margin in millimeters",
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    key: "pageLateralInternalMarginMm",
    label: "Page Lateral Internal Margin",
    tooltip: "Inset from the horizontal center toward each side",
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    key: "pageSideColumnSeparationMm",
    label: "Page Side Column Separation",
    tooltip: "Vertical strip width between the two columns on each half",
    min: 0,
    max: 30,
    step: 0.5,
  },
  {
    key: "pageRowSeparationMm",
    label: "Page Row Separation",
    tooltip: "Vertical gap between header/footer bands and body columns",
    min: 0,
    max: 30,
    step: 0.5,
  },
];

export interface PamphletHalfColumnRects {
  col1WidthMm: number;
  col2WidthMm: number;
  separationWidthMm: number;
  bodyHeightMm: number;
}

export interface PamphletSheet1Layout {
  contentWidthMm: number;
  contentHeightMm: number;
  centerGapMm: number;
  rightHeaderHeightMm: number;
  leftFooterHeightMm: number;
  rightColumns: PamphletHalfColumnRects;
  leftColumns: PamphletHalfColumnRects;
  innerPageColumnHeightMm: number;
}

/** Clamps a numeric layout setting to a non-negative finite value. */
export function clampLayoutMm(value: number, max = 80): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}

/** Returns updated settings after applying one saved field. */
export function applyPamphletSetting(
  settings: PamphletLayoutSettings,
  key: PamphletSettingKey,
  rawValue: number,
): PamphletLayoutSettings {
  const def = PAMPHLET_LAYOUT_SETTING_DEFINITIONS.find((item) => item.key === key);
  const max = def?.max ?? 80;
  return {
    ...settings,
    [key]: clampLayoutMm(rawValue, max),
  };
}

function halfColumnRects(bodyWidthMm: number, bodyHeightMm: number, separationMm: number): PamphletHalfColumnRects {
  const sep = clampLayoutMm(separationMm, 30);
  const usableWidth = Math.max(0, bodyWidthMm - sep);
  const colWidth = usableWidth / 2;
  return {
    col1WidthMm: colWidth,
    col2WidthMm: colWidth,
    separationWidthMm: sep,
    bodyHeightMm: Math.max(0, bodyHeightMm),
  };
}

/** Computes sheet-1 zone dimensions from margin settings. */
export function computeSheet1Layout(settings: PamphletLayoutSettings): PamphletSheet1Layout {
  const top = clampLayoutMm(settings.pageTopMarginMm, 40);
  const bottom = clampLayoutMm(settings.pageBottomMarginMm, 40);
  const ext = clampLayoutMm(settings.pageLateralExternalMarginMm, 40);
  const internal = clampLayoutMm(settings.pageLateralInternalMarginMm, 30);
  const colSep = clampLayoutMm(settings.pageSideColumnSeparationMm, 30);
  const rowSep = clampLayoutMm(settings.pageRowSeparationMm, 30);

  const contentHeightMm = Math.max(0, PAMPHLET_SHEET_HEIGHT_MM - top - bottom);
  const contentWidthMm = Math.max(0, PAMPHLET_SHEET_WIDTH_MM - 2 * ext);
  const halfBodyWidthMm = Math.max(0, contentWidthMm / 2 - internal);

  const requestedHeader = clampLayoutMm(settings.pageHeaderHeightMm, PAMPHLET_SHEET_HEIGHT_MM);
  const requestedFooter = clampLayoutMm(settings.pageFooterHeightMm, PAMPHLET_SHEET_HEIGHT_MM);
  const headerH = Math.min(requestedHeader, contentHeightMm);
  const footerH = Math.min(requestedFooter, contentHeightMm);

  const rightColHeightMm = Math.max(0, contentHeightMm - headerH - rowSep);
  const leftColHeightMm = Math.max(0, contentHeightMm - footerH - rowSep);

  return {
    contentWidthMm,
    contentHeightMm,
    centerGapMm: internal * 2,
    rightHeaderHeightMm: headerH,
    leftFooterHeightMm: footerH,
    rightColumns: halfColumnRects(halfBodyWidthMm, rightColHeightMm, colSep),
    leftColumns: halfColumnRects(halfBodyWidthMm, leftColHeightMm, colSep),
    innerPageColumnHeightMm: contentHeightMm,
  };
}

/** Maps layout settings to CSS custom properties for the preview sheet. */
export function pamphletLayoutToCssVars(settings: PamphletLayoutSettings): Record<string, string> {
  const layout = computeSheet1Layout(settings);
  return {
    "--pamphlet-sheet-w": `${PAMPHLET_SHEET_WIDTH_MM}mm`,
    "--pamphlet-sheet-h": `${PAMPHLET_SHEET_HEIGHT_MM}mm`,
    "--pamphlet-margin-top": `${clampLayoutMm(settings.pageTopMarginMm, 40)}mm`,
    "--pamphlet-margin-bottom": `${clampLayoutMm(settings.pageBottomMarginMm, 40)}mm`,
    "--pamphlet-margin-ext": `${clampLayoutMm(settings.pageLateralExternalMarginMm, 40)}mm`,
    "--pamphlet-margin-int": `${clampLayoutMm(settings.pageLateralInternalMarginMm, 30)}mm`,
    "--pamphlet-col-sep": `${clampLayoutMm(settings.pageSideColumnSeparationMm, 30)}mm`,
    "--pamphlet-row-sep": `${clampLayoutMm(settings.pageRowSeparationMm, 30)}mm`,
    "--pamphlet-header-h": `${layout.rightHeaderHeightMm}mm`,
    "--pamphlet-footer-h": `${layout.leftFooterHeightMm}mm`,
    "--pamphlet-right-col-h": `${layout.rightColumns.bodyHeightMm}mm`,
    "--pamphlet-left-col-h": `${layout.leftColumns.bodyHeightMm}mm`,
    "--pamphlet-inner-col-h": `${layout.innerPageColumnHeightMm}mm`,
    "--pamphlet-center-gap": `${layout.centerGapMm}mm`,
    "--pamphlet-half-body-w": `${Math.max(0, layout.contentWidthMm / 2 - clampLayoutMm(settings.pageLateralInternalMarginMm, 30))}mm`,
  };
}

/** Maps preview layout settings to persisted API layout fields. */
export function layoutSettingsToApiLayout(
  settings: PamphletLayoutSettings,
  paragraphSep = 1,
): {
  marginLateral: number;
  marginVertical: number;
  midMargin: number;
  colSep: number;
  hfGap: number;
  fontSize: number;
  lineHeight: number;
  paragraphSep: number;
  headingBottomMargin: number;
} {
  return {
    marginLateral: settings.pageLateralExternalMarginMm,
    marginVertical: settings.pageTopMarginMm,
    midMargin: settings.pageLateralInternalMarginMm,
    colSep: settings.pageSideColumnSeparationMm,
    hfGap: settings.pageRowSeparationMm,
    fontSize: 10,
    lineHeight: 1.2,
    paragraphSep,
    headingBottomMargin: 5,
  };
}

/** Applies persisted API layout fields onto preview layout settings. */
export function apiLayoutToLayoutSettings(
  layout: {
    marginLateral: number;
    marginVertical: number;
    midMargin: number;
    colSep: number;
    hfGap: number;
  },
  base: PamphletLayoutSettings = DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
): PamphletLayoutSettings {
  return {
    ...base,
    pageTopMarginMm: layout.marginVertical,
    pageBottomMarginMm: layout.marginVertical,
    pageLateralExternalMarginMm: layout.marginLateral,
    pageLateralInternalMarginMm: layout.midMargin,
    pageSideColumnSeparationMm: layout.colSep,
    pageRowSeparationMm: layout.hfGap,
  };
}
