/**
 * PamphletContentItemsContainer.tsx — Zone wrapper; reports occupation % from item heights.
 */
import { useMemo } from "react";
import PamphletContentItem, { type PamphletContentItemHandlers } from "./PamphletContentItem";
import {
  PAMPHLET_V3_ZONE_CAPACITY_MM,
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
  content: PamphletV3ContentItem[];
  editingItemId: string | null;
  itemGapMm?: number;
  occupationPercent?: number;
  handlers: PamphletContentItemHandlers;
  onEmptyActivate?: () => void;
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
  content,
  editingItemId,
  itemGapMm = 2,
  occupationPercent,
  handlers,
  onEmptyActivate,
}: PamphletContentItemsContainerProps) {
  const capacityMm =
    type === "header"
      ? PAMPHLET_V3_ZONE_CAPACITY_MM.header
      : type === "footer"
        ? PAMPHLET_V3_ZONE_CAPACITY_MM.footer
        : PAMPHLET_V3_ZONE_CAPACITY_MM.column;

  const localOccupation = useMemo(() => {
    const usedMm = zoneUsedHeightMm(content, itemGapMm);
    return zoneOccupationPercent(usedMm, capacityMm);
  }, [capacityMm, content, itemGapMm]);

  const percent = occupationPercent ?? localOccupation;
  const areaClass = gridArea ? `pamphlet_area_${gridArea.replace("-", "_")}` : "";

  return (
    <section
      className={`pamphlet_content_container ${classByType[type]} ${areaClass}`.trim()}
      data-zone-type={type}
      data-occupation-percent={percent.toFixed(1)}
      style={gridArea ? { gridArea } : undefined}
    >
      {label ? (
        <div className="pamphlet_zone_label pamphlet-no-print">
          {label}
          <span className="pamphlet_zone_occupation">{percent.toFixed(0)}%</span>
        </div>
      ) : null}
      {content.length === 0 ? (
        <button
          type="button"
          className="pamphlet_zone_empty pamphlet-no-print"
          onClick={onEmptyActivate}
        >
          Click to add content
        </button>
      ) : (
        content.map((item) => (
          <PamphletContentItem
            key={item.id}
            item={item}
            editing={editingItemId === item.id}
            editDisabled={editingItemId !== null && editingItemId !== item.id}
            handlers={handlers}
          />
        ))
      )}
    </section>
  );
}
