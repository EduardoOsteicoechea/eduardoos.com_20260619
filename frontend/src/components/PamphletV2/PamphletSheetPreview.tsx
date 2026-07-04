/**
 * PamphletSheetPreview.tsx — Sheet zone preview driven by mm layout settings.
 */
import type { CSSProperties } from "react";
import type { PamphletLayoutSettings } from "../../lib/pamphletLayout";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import { pamphletLayoutToCssVars } from "../../lib/pamphletLayout";
import PamphletPreviewViewport from "./PamphletPreviewViewport";

interface PamphletSheetPreviewProps {
  settings: PamphletLayoutSettings;
  previewMode: PreviewInteractionMode | null;
  zoomScale: number;
  pan: PreviewPan;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanChange: (x: number, y: number) => void;
  onExitPreviewMode: () => void;
}

function PamphletSheetPage1({ sheetStyle }: { sheetStyle: CSSProperties }) {
  return (
    <article className="pamphlet-sheet pamphlet-sheet--page-1" id="sheet1" data-sheet-index="1" style={sheetStyle}>
      <div className="pamphlet-sheet__content">
        <div className="pamphlet-sheet__halves">
          <div className="pamphlet-sheet__half pamphlet-sheet__half--back">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--left" id="s1-left-body">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1l-col0">
                <span className="pamphlet-sheet__zone-label">Left Col 1</span>
              </div>
              <div
                className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep"
                aria-hidden="true"
              />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1l-col1">
                <span className="pamphlet-sheet__zone-label">Left Col 2</span>
              </div>
            </div>
            <div className="pamphlet-sheet__row-sep pamphlet-sheet__zone pamphlet-sheet__zone--row-sep" aria-hidden="true" />
            <footer className="pamphlet-sheet__footer pamphlet-sheet__zone pamphlet-sheet__zone--footer" id="zone-footer">
              <span className="pamphlet-sheet__zone-label">Footer</span>
            </footer>
          </div>

          <div className="pamphlet-sheet__center-gap pamphlet-sheet__zone pamphlet-sheet__zone--center" aria-hidden="true" />

          <div className="pamphlet-sheet__half pamphlet-sheet__half--front">
            <header className="pamphlet-sheet__header pamphlet-sheet__zone pamphlet-sheet__zone--header" id="zone-header">
              <span className="pamphlet-sheet__zone-label">Header</span>
            </header>
            <div className="pamphlet-sheet__row-sep pamphlet-sheet__zone pamphlet-sheet__zone--row-sep" aria-hidden="true" />
            <div className="pamphlet-sheet__body pamphlet-sheet__body--right" id="s1-right-body">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1r-col0">
                <span className="pamphlet-sheet__zone-label">Right Col 1</span>
              </div>
              <div
                className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep"
                aria-hidden="true"
              />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1r-col1">
                <span className="pamphlet-sheet__zone-label">Right Col 2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PamphletSheetInner({ sheetStyle }: { sheetStyle: CSSProperties }) {
  return (
    <article className="pamphlet-sheet pamphlet-sheet--inner" id="sheet2" data-sheet-index="2" style={sheetStyle}>
      <div className="pamphlet-sheet__content">
        <div className="pamphlet-sheet__halves">
          <div className="pamphlet-sheet__half pamphlet-sheet__half--back">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--inner">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <span className="pamphlet-sheet__zone-label">S2 L Col 1</span>
              </div>
              <div className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep" aria-hidden="true" />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <span className="pamphlet-sheet__zone-label">S2 L Col 2</span>
              </div>
            </div>
          </div>
          <div className="pamphlet-sheet__center-gap pamphlet-sheet__zone pamphlet-sheet__zone--center" aria-hidden="true" />
          <div className="pamphlet-sheet__half pamphlet-sheet__half--front">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--inner">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <span className="pamphlet-sheet__zone-label">S2 R Col 1</span>
              </div>
              <div className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep" aria-hidden="true" />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <span className="pamphlet-sheet__zone-label">S2 R Col 2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PamphletSheetPreview({
  settings,
  previewMode,
  zoomScale,
  pan,
  onZoomIn,
  onZoomOut,
  onPanChange,
  onExitPreviewMode,
}: PamphletSheetPreviewProps) {
  const sheetStyle = pamphletLayoutToCssVars(settings) as CSSProperties;

  return (
    <PamphletPreviewViewport
      mode={previewMode}
      zoomScale={zoomScale}
      pan={pan}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onPanChange={onPanChange}
      onExitMode={onExitPreviewMode}
    >
      <div className="pamphlet-v2__canvas">
        <div className="pamphlet-v2__sheet-fit">
          <PamphletSheetPage1 sheetStyle={sheetStyle} />
        </div>
        <div className="pamphlet-v2__sheet-fit">
          <PamphletSheetInner sheetStyle={sheetStyle} />
        </div>
      </div>
    </PamphletPreviewViewport>
  );
}

export default PamphletSheetPreview;
