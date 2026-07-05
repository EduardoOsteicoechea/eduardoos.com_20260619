/**
 * PamphletImmersiveView.tsx — Single-column vertical edit view using the same zones in reading order.
 */
import { useMemo, type CSSProperties } from "react";
import {
  distributeContentToZones,
  IMMERSIVE_ZONE_ORDER,
  type PamphletContentDocument,
} from "../../lib/pamphletContent";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import { pamphletLayoutToCssVars, type PamphletLayoutSettings } from "../../lib/pamphletLayout";
import { pamphletFontSettingsToCssVars } from "../../lib/pamphletFontSettings";
import { PamphletContentZone, type PamphletContentZoneHandlers } from "./PamphletContentZone";
import "./PamphletImmersiveView.css";

interface PamphletImmersiveViewProps {
  settings: PamphletLayoutSettings;
  contentDocument: PamphletContentDocument;
  fontSettings: PamphletFontSettings;
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  contentHandlers: PamphletContentZoneHandlers;
  imageUploadingItemId: string | null;
  imageUploadError: string;
}

export function PamphletImmersiveView({
  settings,
  contentDocument,
  fontSettings,
  selectedItemId,
  actionPlacement,
  contentHandlers,
  imageUploadingItemId,
  imageUploadError,
}: PamphletImmersiveViewProps) {
  const zones = useMemo(
    () => distributeContentToZones(contentDocument, settings, fontSettings),
    [contentDocument, settings, fontSettings],
  );
  const zoneMap = useMemo(() => new Map(zones.map((zone) => [zone.zoneId, zone])), [zones]);
  const cssVars = useMemo(
    () => ({
      ...pamphletLayoutToCssVars(settings),
      ...pamphletFontSettingsToCssVars(fontSettings),
    }),
    [settings, fontSettings],
  );

  return (
    <div className="pamphlet-immersive" style={cssVars as CSSProperties} aria-label="Immersive pamphlet editor">
      <div className="pamphlet-immersive__stream">
        {IMMERSIVE_ZONE_ORDER.map((zoneId) => {
          const zone = zoneMap.get(zoneId);
          if (!zone || zone.items.length === 0) {
            return null;
          }
          return (
            <section
              key={zoneId}
              className="pamphlet-immersive__zone"
              data-zone-id={zoneId}
              style={{ width: `${zone.widthMm}mm`, maxWidth: "100%" }}
            >
              <PamphletContentZone
                zoneId={zoneId}
                items={zone.items}
                selectedItemId={selectedItemId}
                actionPlacement={actionPlacement}
                fonts={fontSettings}
                imageUploadingItemId={imageUploadingItemId}
                imageUploadError={imageUploadError}
                handlers={contentHandlers}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default PamphletImmersiveView;
