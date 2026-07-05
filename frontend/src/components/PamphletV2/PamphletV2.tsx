/**
 * PamphletV2.tsx — Pamphlet generator workspace (preview driven by mm settings + content).
 */
import type { PamphletContentDocument } from "../../lib/pamphletContent";
import type { PamphletLayoutSettings } from "../../lib/pamphletLayout";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import type { PamphletContentZoneHandlers } from "./PamphletContentZone";
import { PamphletImmersiveView } from "./PamphletImmersiveView";
import { PamphletSheetPreview } from "./PamphletSheetPreview";
import "./PamphletV2.css";
import "./pamphlet-print.css";

export type PamphletEditorViewMode = "preview" | "immersive";

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
}: PamphletV2Props) {
  return (
    <div className="pamphlet-v2" aria-label="Pamphlet generator">
      {viewMode === "immersive" ? (
        <PamphletImmersiveView
          settings={settings}
          contentDocument={contentDocument}
          fontSettings={fontSettings}
          selectedItemId={selectedItemId}
          actionPlacement={actionPlacement}
          contentHandlers={contentHandlers}
          imageUploadingItemId={imageUploadingItemId}
          imageUploadError={imageUploadError}
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
        />
      )}
    </div>
  );
}
