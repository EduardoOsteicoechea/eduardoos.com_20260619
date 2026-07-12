/**
 * PamphletSheetPreview.tsx — Sheet zone preview with distributed content items.
 */
import { useMemo, type CSSProperties } from "react";
import type { PamphletContentDocument, PamphletZoneId } from "../../lib/pamphletContent";
import { computeVisibleSheetNumbers, distributeContentToZones } from "../../lib/pamphletContent";
import type { PamphletLayoutSettings } from "../../lib/pamphletLayout";
import { pamphletLayoutToCssVars } from "../../lib/pamphletLayout";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import { pamphletFontSettingsToCssVars, type PamphletFontSettings } from "../../lib/pamphletFontSettings";
import PamphletContentZone, { type PamphletContentZoneHandlers } from "./PamphletContentZone";
import PamphletPreviewViewport from "./PamphletPreviewViewport";

interface PamphletSheetPreviewProps {
  settings: PamphletLayoutSettings;
  contentDocument: PamphletContentDocument;
  fontSettings: PamphletFontSettings;
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  contentHandlers: PamphletContentZoneHandlers;
  imageUploadingItemId: string | null;
  imageUploadError: string;
  previewMode: PreviewInteractionMode | null;
  zoomScale: number;
  pan: PreviewPan;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanChange: (x: number, y: number) => void;
  onExitPreviewMode: () => void;
  presentation?: "edit" | "print-preview";
  sheetNumbers?: number[];
  interactive?: boolean;
}

function itemsForZone(
  placements: ReturnType<typeof distributeContentToZones>,
  zoneId: PamphletZoneId,
) {
  return placements.find((zone) => zone.zoneId === zoneId)?.items ?? [];
}

type SheetRenderProps = {
  sheetStyle: CSSProperties;
  placements: ReturnType<typeof distributeContentToZones>;
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  fonts: PamphletFontSettings;
  contentHandlers: PamphletContentZoneHandlers;
  imageUploadingItemId: string | null;
  imageUploadError: string;
  readOnly?: boolean;
};

function PamphletSheetPage1({
  sheetStyle,
  placements,
  selectedItemId,
  actionPlacement,
  fonts,
  contentHandlers,
  imageUploadingItemId,
  imageUploadError,
  readOnly = false,
}: SheetRenderProps) {
  return (
    <article className="pamphlet-sheet pamphlet-sheet--page-1" id="sheet1" data-sheet-index="1" style={sheetStyle}>
      <div className="pamphlet-sheet__content">
        <div className="pamphlet-sheet__halves">
          <div className="pamphlet-sheet__half pamphlet-sheet__half--back">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--left" id="s1-left-body">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1l-col0">
                <PamphletContentZone
                  zoneId="s1l-col0"
                  items={itemsForZone(placements, "s1l-col0")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
              <div
                className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep"
                aria-hidden="true"
              />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1l-col1">
                <PamphletContentZone
                  zoneId="s1l-col1"
                  items={itemsForZone(placements, "s1l-col1")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
            </div>
            <div className="pamphlet-sheet__row-sep pamphlet-sheet__zone pamphlet-sheet__zone--row-sep" aria-hidden="true" />
            <footer className="pamphlet-sheet__footer pamphlet-sheet__zone pamphlet-sheet__zone--footer" id="zone-footer">
              <PamphletContentZone
                zoneId="footer"
                items={itemsForZone(placements, "footer")}
                selectedItemId={selectedItemId}
                actionPlacement={actionPlacement}
                fonts={fonts}
                handlers={contentHandlers}
                readOnly={readOnly}
              />
            </footer>
          </div>

          <div className="pamphlet-sheet__center-gap pamphlet-sheet__zone pamphlet-sheet__zone--center" aria-hidden="true" />

          <div className="pamphlet-sheet__half pamphlet-sheet__half--front">
            <header className="pamphlet-sheet__header pamphlet-sheet__zone pamphlet-sheet__zone--header" id="zone-header">
              <PamphletContentZone
                zoneId="header"
                items={itemsForZone(placements, "header")}
                selectedItemId={selectedItemId}
                actionPlacement={actionPlacement}
                fonts={fonts}
                handlers={contentHandlers}
                readOnly={readOnly}
              />
            </header>
            <div className="pamphlet-sheet__row-sep pamphlet-sheet__zone pamphlet-sheet__zone--row-sep" aria-hidden="true" />
            <div className="pamphlet-sheet__body pamphlet-sheet__body--right" id="s1-right-body">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1r-col0">
                <PamphletContentZone
                  zoneId="s1r-col0"
                  items={itemsForZone(placements, "s1r-col0")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
              <div
                className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep"
                aria-hidden="true"
              />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col" id="s1r-col1">
                <PamphletContentZone
                  zoneId="s1r-col1"
                  items={itemsForZone(placements, "s1r-col1")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PamphletSheetInner({
  sheetStyle,
  placements,
  selectedItemId,
  actionPlacement,
  fonts,
  contentHandlers,
  imageUploadingItemId,
  imageUploadError,
  readOnly = false,
}: SheetRenderProps) {
  return (
    <article className="pamphlet-sheet pamphlet-sheet--inner" id="sheet2" data-sheet-index="2" style={sheetStyle}>
      <div className="pamphlet-sheet__content">
        <div className="pamphlet-sheet__halves">
          <div className="pamphlet-sheet__half pamphlet-sheet__half--back">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--inner">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <PamphletContentZone
                  zoneId="s2l-col0"
                  items={itemsForZone(placements, "s2l-col0")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
              <div className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep" aria-hidden="true" />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <PamphletContentZone
                  zoneId="s2l-col1"
                  items={itemsForZone(placements, "s2l-col1")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
            </div>
          </div>
          <div className="pamphlet-sheet__center-gap pamphlet-sheet__zone pamphlet-sheet__zone--center" aria-hidden="true" />
          <div className="pamphlet-sheet__half pamphlet-sheet__half--front">
            <div className="pamphlet-sheet__body pamphlet-sheet__body--inner">
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <PamphletContentZone
                  zoneId="s2r-col0"
                  items={itemsForZone(placements, "s2r-col0")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
              </div>
              <div className="pamphlet-sheet__col-sep pamphlet-sheet__zone pamphlet-sheet__zone--sep" aria-hidden="true" />
              <div className="pamphlet-sheet__column pamphlet-sheet__zone pamphlet-sheet__zone--col">
                <PamphletContentZone
                  zoneId="s2r-col1"
                  items={itemsForZone(placements, "s2r-col1")}
                  selectedItemId={selectedItemId}
                  actionPlacement={actionPlacement}
                  fonts={fonts}
                  handlers={contentHandlers}
                  readOnly={readOnly}
                  imageUploadingItemId={imageUploadingItemId}
                  imageUploadError={imageUploadError}
                />
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
  contentDocument,
  fontSettings,
  selectedItemId,
  actionPlacement,
  contentHandlers,
  imageUploadingItemId,
  imageUploadError,
  previewMode,
  zoomScale,
  pan,
  onZoomIn,
  onZoomOut,
  onPanChange,
  onExitPreviewMode,
  presentation = "edit",
  sheetNumbers,
  interactive = true,
}: PamphletSheetPreviewProps) {
  const placements = useMemo(
    () => distributeContentToZones(contentDocument, settings, fontSettings),
    [contentDocument, settings, fontSettings],
  );

  const visibleSheets = sheetNumbers ?? (presentation === "print-preview" ? computeVisibleSheetNumbers(placements) : [1, 2]);
  const readOnly = !interactive || presentation === "print-preview";

  const sheetStyle = {
    ...pamphletLayoutToCssVars(settings),
    ...pamphletFontSettingsToCssVars(fontSettings),
    "--pamphlet-content-item-gap": `${contentDocument.itemBottomMarginMm}mm`,
  } as CSSProperties;

  const canvasClass = [
    "pamphlet-v2__canvas",
    presentation === "print-preview" ? "pamphlet-v2__canvas--print-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sheetProps: SheetRenderProps = {
    sheetStyle,
    placements,
    selectedItemId: readOnly ? null : selectedItemId,
    actionPlacement,
    fonts: fontSettings,
    contentHandlers,
    imageUploadingItemId,
    imageUploadError,
    readOnly,
  };

  const canvas = (
    <div className={canvasClass}>
      {visibleSheets.includes(1) ? (
        <div className="pamphlet-v2__sheet-fit">
          <PamphletSheetPage1 {...sheetProps} />
        </div>
      ) : null}
      {visibleSheets.includes(2) ? (
        <div className="pamphlet-v2__sheet-fit">
          <PamphletSheetInner {...sheetProps} />
        </div>
      ) : null}
    </div>
  );

  if (presentation === "print-preview" && !interactive) {
    return canvas;
  }

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
      {canvas}
    </PamphletPreviewViewport>
  );
}

export default PamphletSheetPreview;
