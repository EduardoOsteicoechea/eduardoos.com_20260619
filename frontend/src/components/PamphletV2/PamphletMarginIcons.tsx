/**
 * PamphletMarginIcons.tsx — Filled SVG icons for margin activity-bar buttons.
 */
import type { ReactNode } from "react";
import { ACTIVITY_BAR_ICON_CLASS } from "./activityBarIcon";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className={ACTIVITY_BAR_ICON_CLASS} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconMarginTop() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M4 4h16v3H4V4zm0 3h2v13H4V7zm14 0h2v13h-2V7zm-12 0h12v2H6V7zm0 11h12v2H6v-2z"
      />
    </Icon>
  );
}

export function IconMarginBottom() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M4 4h2v13H4V4zm14 0h2v13h-2V4zm-12 0h12v2H6V4zm0 11h12v3H6v-3z"
      />
    </Icon>
  );
}

export function IconMarginExternal() {
  return (
    <Icon>
      <path fill="currentColor" d="M4 4h3v16H4V4zm13 0h3v16h-3V4zM7 6h10v12H7V6z" />
    </Icon>
  );
}

export function IconMarginInternal() {
  return (
    <Icon>
      <path fill="currentColor" d="M4 6h8v12H4V6zm12 0h8v12h-8V6zM11 4h2v16h-2V4z" />
    </Icon>
  );
}

export function IconColumnSep() {
  return (
    <Icon>
      <path fill="currentColor" d="M4 4h7v16H4V4zm13 0h7v16h-7V4zM10 4h4v16h-4V4z" />
    </Icon>
  );
}

export function IconRowSep() {
  return (
    <Icon>
      <path fill="currentColor" d="M4 4h16v7H4V4zm0 13h16v7H4v-7zM4 10h16v4H4v-4z" />
    </Icon>
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
  const IconComponent = MARGIN_ICONS[key];
  return <IconComponent />;
}
