/**
 * PamphletImmersiveView.tsx — Single-column vertical edit view with full-width resizable zones.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  distributeContentToZones,
  IMMERSIVE_ZONE_ORDER,
  immersiveZoneItems,
  immersiveZoneLabel,
  type PamphletContentDocument,
  type PamphletZoneId,
} from "../../lib/pamphletContent";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import { pamphletLayoutToCssVars, type PamphletLayoutSettings } from "../../lib/pamphletLayout";
import { pamphletFontSettingsToCssVars } from "../../lib/pamphletFontSettings";
import { PamphletContentZone, type PamphletContentZoneHandlers } from "./PamphletContentZone";
import "./PamphletImmersiveView.css";

const IMMERSIVE_MIN_ZONE_WIDTH_PX = 240;
const IMMERSIVE_RESIZE_HANDLE_PX = 10;

interface PamphletImmersiveViewProps {
  settings: PamphletLayoutSettings;
  contentDocument: PamphletContentDocument;
  fontSettings: PamphletFontSettings;
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  contentHandlers: PamphletContentZoneHandlers;
  imageUploadingItemId: string | null;
  imageUploadError: string;
  zoneWidthsPx: Partial<Record<PamphletZoneId, number>>;
  onZoneWidthChange: (zoneId: PamphletZoneId, widthPx: number) => void;
  onEmptyZoneActivate: (zoneId: PamphletZoneId) => void;
}

interface ImmersiveZoneProps {
  zoneId: PamphletZoneId;
  label: string;
  widthPx: number | undefined;
  streamWidthPx: number;
  onWidthChange: (zoneId: PamphletZoneId, widthPx: number) => void;
  children: ReactNode;
}

function ImmersiveZone({ zoneId, label, widthPx, streamWidthPx, onWidthChange, children }: ImmersiveZoneProps) {
  const dragRef = useRef<{
    edge: "left" | "right";
    startX: number;
    startWidth: number;
  } | null>(null);

  const effectiveWidth = widthPx ?? streamWidthPx;

  const handleResizeStart = useCallback(
    (edge: "left" | "right", event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        edge,
        startX: event.clientX,
        startWidth: effectiveWidth,
      };
    },
    [effectiveWidth],
  );

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const delta = event.clientX - drag.startX;
      const signedDelta = drag.edge === "right" ? delta : -delta;
      const nextWidth = Math.max(IMMERSIVE_MIN_ZONE_WIDTH_PX, Math.min(streamWidthPx, drag.startWidth + signedDelta));
      onWidthChange(zoneId, nextWidth);
    }

    function handleMouseUp() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWidthChange, streamWidthPx, zoneId]);

  return (
    <section
      className="pamphlet-immersive__zone"
      data-zone-id={zoneId}
      style={{ width: `${effectiveWidth}px`, maxWidth: "100%" }}
    >
      <div className="pamphlet-immersive__zone-label">{label}</div>
      <div
        className="pamphlet-immersive__resize-handle pamphlet-immersive__resize-handle--left"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${zoneId} left edge`}
        onMouseDown={(event) => handleResizeStart("left", event)}
      />
      <div className="pamphlet-immersive__zone-body">{children}</div>
      <div
        className="pamphlet-immersive__resize-handle pamphlet-immersive__resize-handle--right"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${zoneId} right edge`}
        onMouseDown={(event) => handleResizeStart("right", event)}
      />
    </section>
  );
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
  zoneWidthsPx,
  onZoneWidthChange,
  onEmptyZoneActivate,
}: PamphletImmersiveViewProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const [streamWidthPx, setStreamWidthPx] = useState(960);

  useEffect(() => {
    const node = streamRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) {
        setStreamWidthPx(width);
      }
    });
    observer.observe(node);
    setStreamWidthPx(node.clientWidth || 960);
    return () => observer.disconnect();
  }, []);

  const zones = useMemo(
    () => distributeContentToZones(contentDocument, settings, fontSettings),
    [contentDocument, settings, fontSettings],
  );

  const cssVars = useMemo(
    () => ({
      ...pamphletLayoutToCssVars(settings),
      ...pamphletFontSettingsToCssVars(fontSettings),
    }),
    [settings, fontSettings],
  );

  return (
    <div className="pamphlet-immersive" style={cssVars as CSSProperties} aria-label="Column stack pamphlet editor">
      <div ref={streamRef} className="pamphlet-immersive__stream">
        {IMMERSIVE_ZONE_ORDER.map((zoneId) => {
          const items = immersiveZoneItems(zoneId, contentDocument, zones);

          return (
            <ImmersiveZone
              key={zoneId}
              zoneId={zoneId}
              label={immersiveZoneLabel(zoneId)}
              widthPx={zoneWidthsPx[zoneId]}
              streamWidthPx={streamWidthPx}
              onWidthChange={onZoneWidthChange}
            >
              <PamphletContentZone
                zoneId={zoneId}
                items={items}
                selectedItemId={selectedItemId}
                actionPlacement={actionPlacement}
                fonts={fontSettings}
                imageUploadingItemId={imageUploadingItemId}
                imageUploadError={imageUploadError}
                handlers={contentHandlers}
                allowEmpty
                emptyHint="Click to add content"
                onEmptyActivate={() => onEmptyZoneActivate(zoneId)}
              />
            </ImmersiveZone>
          );
        })}
      </div>
    </div>
  );
}

export default PamphletImmersiveView;
