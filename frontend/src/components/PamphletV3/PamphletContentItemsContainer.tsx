/**
 * PamphletContentItemsContainer.tsx — Zone wrapper; sheet content comes only from distribution.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import PamphletContentItem, { type PamphletContentItemHandlers } from "./PamphletContentItem";
import {
  PAMPHLET_V3_ZONE_CAPACITY_MM,
  pxToMm,
  zoneOccupationPercent,
  zoneUsedHeightMm,
  type PamphletV3ContentItem,
  type PamphletV3Stream,
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
  /** When true, zone items cannot be selected for editing (e.g. fixed footer). */
  editDisabled?: boolean;
  /** When false, items in this zone do not publish measured heights. */
  measureEnabled?: boolean;
  /** Empty zones only — appends to the stream; packing decides placement. */
  onEmptyActivate?: () => void;
  /** Reports the content-stack height in mm for packing / occupation. */
  onCapacityChange?: (capacityKey: string, capacityMm: number) => void;
}

const classByType: Record<PamphletContainerType, string> = {
  header: "pamphlet_header",
  column: "pamphlet_column",
  footer: "pamphlet_footer",
};

function streamForContainer(type: PamphletContainerType): PamphletV3Stream {
  if (type === "header") {
    return "header";
  }
  if (type === "footer") {
    return "footer";
  }
  return "body";
}

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
  editDisabled = false,
  measureEnabled = true,
  onEmptyActivate,
  onCapacityChange,
}: PamphletContentItemsContainerProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const capacityProbeRef = useRef<HTMLDivElement>(null);
  const stream = streamForContainer(type);

  const fallbackCapacityMm =
    type === "header"
      ? PAMPHLET_V3_ZONE_CAPACITY_MM.header
      : type === "footer"
        ? PAMPHLET_V3_ZONE_CAPACITY_MM.footer
        : PAMPHLET_V3_ZONE_CAPACITY_MM.column;

  const capacityMm = capacityMmProp && capacityMmProp > 1 ? capacityMmProp : fallbackCapacityMm;
  const usedMm = usedMmProp ?? zoneUsedHeightMm(content, itemGapMm, stream);

  const localOccupation = useMemo(
    () => zoneOccupationPercent(usedMm, capacityMm),
    [capacityMm, usedMm],
  );

  const percent = occupationPercent ?? localOccupation;
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
      const nextMm = pxToMm(capacityProbeRef.current.getBoundingClientRect().height);
      onCapacityChange!(capacityKey!, nextMm);
    }

    const observer = new ResizeObserver(() => publish());
    observer.observe(probe);
    publish();
    return () => observer.disconnect();
  }, [capacityKey, onCapacityChange, editingItemId, content.length]);

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
    >
      <div ref={stackRef} className="pamphlet_zone_stack">
        <div
          ref={capacityProbeRef}
          className="pamphlet_zone_capacity_probe"
          aria-hidden="true"
          data-capacity-probe="true"
        />
        {content.length === 0 ? (
          onEmptyActivate ? (
            <button
              type="button"
              className="pamphlet_zone_empty pamphlet-no-print"
              onClick={onEmptyActivate}
            >
              Click to add content
            </button>
          ) : null
        ) : (
          content.map((item) => (
            <PamphletContentItem
              key={item.id}
              item={item}
              editing={editingItemId === item.id}
              editDisabled={editDisabled}
              measureEnabled={measureEnabled}
              stream={stream}
              handlers={handlers}
            />
          ))
        )}
      </div>
    </section>
  );
}
