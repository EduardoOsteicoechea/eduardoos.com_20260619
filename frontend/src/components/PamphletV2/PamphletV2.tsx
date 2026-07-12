/**
 * PamphletV2.tsx — Pamphlet generator workspace (pamphlet / column / print-preview views).
 */
import type { PamphletContentDocument, PamphletZoneId } from "../../lib/pamphletContent";
import type { PamphletLayoutSettings } from "../../lib/pamphletLayout";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import type { PamphletContentZoneHandlers } from "./PamphletContentZone";
import { PamphletImmersiveView } from "./PamphletImmersiveView";
import { PamphletSheetPreview } from "./PamphletSheetPreview";
import "./PamphletV2.css";
import "./pamphlet-print.css";

export type PamphletEditorViewMode = "pamphlet" | "column" | "print-preview";

interface PamphletV2Props {
  settings: PamphletLayoutSettings;
  contentDocument: PamphletContentDocument;
  fontSettings: PamphletFontSettings;
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  contentHandlers: PamphletContentZoneHandlers;
  imageUploadingItemId: string | null;
  imageUploadError: string;
  viewMode: PamphletEditorViewMode;
  previewMode: PreviewInteractionMode | null;
  zoomScale: number;
  pan: PreviewPan;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanChange: (x: number, y: number) => void;
  onExitPreviewMode: () => void;
  immersiveZoneWidthsPx: Partial<Record<PamphletZoneId, number>>;
  onImmersiveZoneWidthChange: (zoneId: PamphletZoneId, widthPx: number) => void;
  onEmptyZoneActivate: (zoneId: PamphletZoneId) => void;
  printSurface?: boolean;
}

export default function PamphletV2({
  settings,
  contentDocument,
  fontSettings,
  selectedItemId,
  actionPlacement,
  contentHandlers,
  imageUploadingItemId,
  imageUploadError,
  viewMode,
  previewMode,
  zoomScale,
  pan,
  onZoomIn,
  onZoomOut,
  onPanChange,
  onExitPreviewMode,
  immersiveZoneWidthsPx,
  onImmersiveZoneWidthChange,
  onEmptyZoneActivate,
  printSurface = false,
}: PamphletV2Props) {
  const rootClass = [
    "pamphlet-v2",
    printSurface ? "pamphlet-v2--print-surface" : "",
    viewMode === "print-preview" ? "pamphlet-v2--print-preview-mode" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (printSurface) {
    return (
      <div className={rootClass} aria-hidden="true">
        <PamphletSheetPreview
          settings={settings}
          contentDocument={contentDocument}
          fontSettings={fontSettings}
          selectedItemId={null}
          actionPlacement={actionPlacement}
          contentHandlers={contentHandlers}
          imageUploadingItemId={imageUploadingItemId}
          imageUploadError={imageUploadError}
          previewMode={null}
          zoomScale={1}
          pan={{ x: 0, y: 0 }}
          onZoomIn={() => {}}
          onZoomOut={() => {}}
          onPanChange={() => {}}
          onExitPreviewMode={() => {}}
          presentation="print-preview"
          interactive={false}
        />
      </div>
    );
  }

  return (
    <div className={rootClass} aria-label="Pamphlet generator">
      {viewMode === "column" ? (
        <PamphletImmersiveView
          settings={settings}
          contentDocument={contentDocument}
          fontSettings={fontSettings}
          selectedItemId={selectedItemId}
          actionPlacement={actionPlacement}
          contentHandlers={contentHandlers}
          imageUploadingItemId={imageUploadingItemId}
          imageUploadError={imageUploadError}
          zoneWidthsPx={immersiveZoneWidthsPx}
          onZoneWidthChange={onImmersiveZoneWidthChange}
          onEmptyZoneActivate={onEmptyZoneActivate}
        />
      ) : (
        <PamphletSheetPreview
          settings={settings}
          contentDocument={contentDocument}
          fontSettings={fontSettings}
          selectedItemId={selectedItemId}
          actionPlacement={actionPlacement}
          contentHandlers={contentHandlers}
          imageUploadingItemId={imageUploadingItemId}
          imageUploadError={imageUploadError}
          previewMode={previewMode}
          zoomScale={zoomScale}
          pan={pan}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onPanChange={onPanChange}
          onExitPreviewMode={onExitPreviewMode}
          presentation={viewMode === "print-preview" ? "print-preview" : "edit"}
          interactive={viewMode !== "print-preview"}
        />
      )}
    </div>
  );
}
