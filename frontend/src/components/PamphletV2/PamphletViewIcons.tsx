/**
 * PamphletViewIcons.tsx — Filled activity bar icons for preview viewport tools.
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

export function IconZoomIn() {
  return (
    <Icon>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.5 3a7.5 7.5 0 015.3 12.8L21 21l-1.4 1.4-5.2-5.2A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM10 9h2v4h-2V9zm0-2h2v2h-2V7z"
      />
    </Icon>
  );
}

export function IconZoomOut() {
  return (
    <Icon>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.5 3a7.5 7.5 0 015.3 12.8L21 21l-1.4 1.4-5.2-5.2A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM9 10h5v2H9v-2z"
      />
    </Icon>
  );
}

export function IconDragMove() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M11 3h2v6h6v2h-6v6h-2v-6H5v-2h6V3zm-6 8h2v2H5v-2zm14 0h2v2h-2v-2zm-7 7h2v2h-2v-2z"
      />
    </Icon>
  );
}

export function IconOpenFolder() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M3 7h7l2 2h9v10H3V7zm2 2v8h14V9h-8l-2-2H5z"
      />
    </Icon>
  );
}

export function IconSaveCloud() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M8 18h8v2H8v-2zm4-14l4 4h-3v5h-2V8H8l4-4zm-4.5 6A4.5 4.5 0 0012 19h1a5 5 0 10-5.5-5z"
      />
    </Icon>
  );
}

export function IconImmersiveEdit() {
  return <IconColumnStack />;
}

export function IconPreviewLayout() {
  return (
    <Icon>
      <path fill="currentColor" d="M3 5h18v14H3V5zm2 2v10h14V7H5zM12 7v10h-2V7h2zm0 0h7v2h-7V7zm0 4h7v2h-7v-2z" />
    </Icon>
  );
}

export function IconColumnStack() {
  return (
    <Icon>
      <path fill="currentColor" d="M6 4h12v4H6V4zm0 6h12v4H6v-4zm0 6h12v4H6v-4z" />
    </Icon>
  );
}

export function IconPrintPreview() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M5 4h14v4H5V4zm-1 6h16v7h-4v3H8v-3H4v-7zm3 2v2h10v-2H7zm0 4v2h6v-2H7z"
      />
    </Icon>
  );
}

export function IconPrint() {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M7 3h10v4H7V3zm-2 6h14a2 2 0 012 2v5h-3v4H6v-4H3v-5a2 2 0 012-2zm2 2v2h10V11H7zm0 4v3h10v-3H7z"
      />
    </Icon>
  );
}
