/**
 * PamphletV2.tsx — Pamphlet generator workspace (preview driven by mm settings).
 */
import type { PamphletLayoutSettings } from "../../lib/pamphletLayout";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import { PamphletSheetPreview } from "./PamphletSheetPreview";
import "./PamphletV2.css";
import "./pamphlet-print.css";

interface PamphletV2Props {
  settings: PamphletLayoutSettings;
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
      <PamphletSheetPreview
        settings={settings}
        previewMode={previewMode}
        zoomScale={zoomScale}
        pan={pan}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onPanChange={onPanChange}
        onExitPreviewMode={onExitPreviewMode}
      />
    </div>
  );
}
