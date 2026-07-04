/**
 * pamphletPreviewInteraction.ts — Preview canvas zoom / pan interaction helpers.
 */

export type PreviewInteractionMode = "zoom-in" | "zoom-out" | "drag";

export const PREVIEW_ZOOM_STEP = 1.15;
export const PREVIEW_ZOOM_MIN = 0.35;
export const PREVIEW_ZOOM_MAX = 4;

export interface PreviewPan {
  x: number;
  y: number;
}

export function clampPreviewZoom(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, scale));
}

export function applyPreviewZoomIn(scale: number): number {
  return clampPreviewZoom(scale * PREVIEW_ZOOM_STEP);
}

export function applyPreviewZoomOut(scale: number): number {
  return clampPreviewZoom(scale / PREVIEW_ZOOM_STEP);
}

export function isPreviewInteractionMode(value: string | null | undefined): value is PreviewInteractionMode {
  return value === "zoom-in" || value === "zoom-out" || value === "drag";
}
