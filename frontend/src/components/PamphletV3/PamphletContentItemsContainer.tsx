/**
 * PamphletContentItemsContainer.tsx — Zone wrapper; reports occupation % from item heights.
 */
import { useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import PamphletContentItem, { type PamphletContentItemHandlers } from "./PamphletContentItem";
import {
  PAMPHLET_V3_ZONE_CAPACITY_MM,
  pxToMm,
  zoneHasRoomForAddControl,
  zoneOccupationPercent,
  zoneUsedHeightMm,
  type PamphletV3ContentItem,
} from "./pamphletV3Content";
import "./PamphletPages.css";

export type PamphletContainerType = "header" | "column" | "footer";

export interface PamphletContentItemsContainerProps {
  type: PamphletContainerType;
  label?: string;
  gridArea?: "header" | "footer" | "col-a" | "col-b";
  /** Stable key used when reporting measured stack capacity (e.g. "first", "header"). */
  capacityKey?: string;
  content: PamphletV3ContentItem[];
  editingItemId: string | null;
  itemGapMm?: number;
  occupationPercent?: number;
  usedMm?: number;
  capacityMm?: number;
  handlers: PamphletContentItemHandlers;
  onEmptyActivate?: () => void;
  /** Click empty leftover space in this zone to add (and save any open edit first). */
  onZoneBackgroundActivate?: () => void;
  /** Reports the content-stack height in mm for packing / occupation. */
  onCapacityChange?: (capacityKey: string, capacityMm: number) => void;
}

const classByType: Record<PamphletContainerType, string> = {
  header: "pamphlet_header",
  column: "pamphlet_column",
  footer: "pamphlet_footer",
};

export function PamphletContentItemsContainer({
  type,
  label,
  gridArea,
  capacityKey,
  content,
  editingItemId,
  itemGapMm = 0,
  occupationPercent,
  usedMm: usedMmProp,
  capacityMm: capacityMmProp,
  handlers,
  onEmptyActivate,
  onZoneBackgroundActivate,
  onCapacityChange,
}: PamphletContentItemsContainerProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const capacityProbeRef = useRef<HTMLDivElement>(null);

  const fallbackCapacityMm =
    type === "header"
      ? PAMPHLET_V3_ZONE_CAPACITY_MM.header
      : type === "footer"
        ? PAMPHLET_V3_ZONE_CAPACITY_MM.footer
        : PAMPHLET_V3_ZONE_CAPACITY_MM.column;

  const capacityMm = capacityMmProp && capacityMmProp > 1 ? capacityMmProp : fallbackCapacityMm;
  const usedMm = usedMmProp ?? zoneUsedHeightMm(content, itemGapMm);

  const localOccupation = useMemo(
    () => zoneOccupationPercent(usedMm, capacityMm),
    [capacityMm, usedMm],
  );

  const percent = occupationPercent ?? localOccupation;
  const showAddControl = content.length === 0 || zoneHasRoomForAddControl(usedMm, capacityMm);
  const areaClass = gridArea ? `pamphlet_area_${gridArea.replace("-", "_")}` : "";

  useLayoutEffect(() => {
    const probe = capacityProbeRef.current;
    if (!probe || !capacityKey || !onCapacityChange || typeof ResizeObserver === "undefined") {
      return;
    }

    function publish() {
      if (!capacityProbeRef.current) {
        return;
      }
      // Probe is position:absolute; inset:0 — height is the constrained stack slot,
      // not the content-driven scroll height (which caused over-packing feedback).
      const nextMm = pxToMm(capacityProbeRef.current.getBoundingClientRect().height);
      onCapacityChange!(capacityKey!, nextMm);
    }

    const observer = new ResizeObserver(() => publish());
    observer.observe(probe);
    // Re-publish on mount and whenever edit mode changes (layout can shift header/footer).
    publish();
    return () => observer.disconnect();
  }, [capacityKey, onCapacityChange, editingItemId, content.length]);

  function handleZonePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-item-id]")) {
      return;
    }
    if (target.closest(".pamphlet_zone_empty") || target.closest(".pamphlet_zone_fill")) {
      return;
    }
    if (!showAddControl) {
      return;
    }
    onZoneBackgroundActivate?.();
  }

  return (
    <section
      className={`pamphlet_content_container ${classByType[type]} ${areaClass}`.trim()}
      data-zone-type={type}
      data-capacity-key={capacityKey}
      data-occupation-percent={percent.toFixed(1)}
      data-capacity-mm={capacityMm.toFixed(2)}
      data-used-mm={usedMm.toFixed(2)}
      aria-label={label || undefined}
      style={gridArea ? { gridArea } : undefined}
      onPointerDown={handleZonePointerDown}
    >
      <div ref={stackRef} className="pamphlet_zone_stack">
        <div
          ref={capacityProbeRef}
          className="pamphlet_zone_capacity_probe"
          aria-hidden="true"
          data-capacity-probe="true"
        />
        {content.length === 0 ? (
          <button
            type="button"
            className="pamphlet_zone_empty pamphlet-no-print"
            onClick={onEmptyActivate}
          >
            Click to add content
          </button>
        ) : (
          <>
            {content.map((item) => (
              <PamphletContentItem
                key={item.id}
                item={item}
                editing={editingItemId === item.id}
                editDisabled={editingItemId !== null && editingItemId !== item.id}
                handlers={handlers}
              />
            ))}
            {showAddControl ? (
              <button
                type="button"
                className="pamphlet_zone_fill pamphlet-no-print"
                data-zone-fill="true"
                onClick={onZoneBackgroundActivate}
              >
                Click to add content
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
