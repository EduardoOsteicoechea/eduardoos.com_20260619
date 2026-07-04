/**
 * PamphletMarginIcons.tsx — Simple SVG icons for margin activity-bar buttons.
 */

export function IconMarginTop() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconMarginBottom() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconMarginExternal() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="7" y="4" width="10" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="4" x2="4" y2="20" stroke="currentColor" strokeWidth="2" />
      <line x1="20" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconMarginInternal() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
      <rect x="5" y="6" width="5" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="6" width="5" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconColumnSep() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="4" y="4" width="7" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="4" width="7" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11.5" y1="4" x2="11.5" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconRowSep() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="4" y="4" width="16" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="13" width="16" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="11.5" x2="20" y2="11.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const MARGIN_ICONS = {
  pageTopMarginMm: IconMarginTop,
  pageBottomMarginMm: IconMarginBottom,
  pageLateralExternalMarginMm: IconMarginExternal,
  pageLateralInternalMarginMm: IconMarginInternal,
  pageSideColumnSeparationMm: IconColumnSep,
  pageRowSeparationMm: IconRowSep,
} as const;

export function marginSettingIcon(key: keyof typeof MARGIN_ICONS) {
  const Icon = MARGIN_ICONS[key];
  return <Icon />;
}
