/**
 * ContentDistribution.ts — Packs pamphlet streams into header, eight columns, and footer.
 */
import {
  PAMPHLET_V3_COLUMN_WIDTH_MM,
  PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES,
  PAMPHLET_V3_ZONE_CAPACITY_MM,
  exportZone,
  packItemsIntoZones,
  pamphletV3ItemHasContent,
  zoneOccupationPercent,
  zoneUsedHeightMm,
  type PamphletV3ColumnZoneId,
  type PamphletV3ContentItem,
  type PamphletV3ContentJson,
  type PamphletV3Document,
  type PamphletV3PackZone,
} from "./pamphletV3Content";

export interface PamphletZoneOccupation {
  usedMm: number;
  capacityMm: number;
  percent: number;
}

export interface PamphletContentDistribution {
  header: PamphletV3ContentItem[];
  footer: PamphletV3ContentItem[];
  columns: {
    first: PamphletV3ContentItem[];
    second: PamphletV3ContentItem[];
    third: PamphletV3ContentItem[];
    fourth: PamphletV3ContentItem[];
    fifth: PamphletV3ContentItem[];
    sixth: PamphletV3ContentItem[];
    seventh: PamphletV3ContentItem[];
    eighth: PamphletV3ContentItem[];
  };
  occupation: {
    header: PamphletZoneOccupation;
    footer: PamphletZoneOccupation;
    columns: Record<keyof PamphletContentDistribution["columns"], PamphletZoneOccupation>;
  };
}

const COLUMN_ZONE_IDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
] as const satisfies ReadonlyArray<PamphletV3ColumnZoneId>;

export type PamphletMeasuredCapacities = Partial<
  Record<"header" | "footer" | PamphletV3ColumnZoneId, number>
>;

function occupationFor(
  items: PamphletV3ContentItem[],
  capacityMm: number,
  gapMm: number,
): PamphletZoneOccupation {
  const usedMm = zoneUsedHeightMm(items, gapMm);
  return {
    usedMm,
    capacityMm,
    percent: zoneOccupationPercent(usedMm, capacityMm),
  };
}

function resolveCapacity(
  zoneId: PamphletV3ColumnZoneId | "header" | "footer",
  measured: PamphletMeasuredCapacities | undefined,
): number {
  const live = measured?.[zoneId];
  if (typeof live === "number" && live > 1) {
    return live;
  }
  if (zoneId === "header") {
    return PAMPHLET_V3_ZONE_CAPACITY_MM.header;
  }
  if (zoneId === "footer") {
    return PAMPHLET_V3_ZONE_CAPACITY_MM.footer;
  }
  return PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES[zoneId];
}

/**
 * Distributes document streams into printable zones using each item's heightMm.
 * Reading order: front col1 → front col2 → inner left → inner right → back cols.
 * Only items with real content are packed — empty drafts stay out of the sheet
 * (edited in the sidebar) so leftover column space never hosts a ghost item.
 */
export default function contentDistribution(
  document: PamphletV3Document,
  measuredCapacities?: PamphletMeasuredCapacities,
): PamphletContentDistribution {
  const gapMm = document.itemGapMm;
  const header = document.headerItems.filter(pamphletV3ItemHasContent);
  const footer = document.footerItems.filter(pamphletV3ItemHasContent);

  const packZones: PamphletV3PackZone[] = COLUMN_ZONE_IDS.map((id) => ({
    id,
    capacityMm: resolveCapacity(id, measuredCapacities),
  }));

  const packed = packItemsIntoZones(
    document.bodyItems.filter(pamphletV3ItemHasContent),
    packZones,
    gapMm,
    PAMPHLET_V3_COLUMN_WIDTH_MM,
  );

  const columns = {
    first: packed.first ?? [],
    second: packed.second ?? [],
    third: packed.third ?? [],
    fourth: packed.fourth ?? [],
    fifth: packed.fifth ?? [],
    sixth: packed.sixth ?? [],
    seventh: packed.seventh ?? [],
    eighth: packed.eighth ?? [],
  };

  return {
    header,
    footer,
    columns,
    occupation: {
      header: occupationFor(header, resolveCapacity("header", measuredCapacities), gapMm),
      footer: occupationFor(footer, resolveCapacity("footer", measuredCapacities), gapMm),
      columns: {
        first: occupationFor(columns.first, resolveCapacity("first", measuredCapacities), gapMm),
        second: occupationFor(columns.second, resolveCapacity("second", measuredCapacities), gapMm),
        third: occupationFor(columns.third, resolveCapacity("third", measuredCapacities), gapMm),
        fourth: occupationFor(columns.fourth, resolveCapacity("fourth", measuredCapacities), gapMm),
        fifth: occupationFor(columns.fifth, resolveCapacity("fifth", measuredCapacities), gapMm),
        sixth: occupationFor(columns.sixth, resolveCapacity("sixth", measuredCapacities), gapMm),
        seventh: occupationFor(columns.seventh, resolveCapacity("seventh", measuredCapacities), gapMm),
        eighth: occupationFor(columns.eighth, resolveCapacity("eighth", measuredCapacities), gapMm),
      },
    },
  };
}

/** Builds live export JSON from the current zone distribution (skips empty items). */
export function distributionToContentJson(
  distribution: PamphletContentDistribution,
): PamphletV3ContentJson {
  return {
    header: exportZone(distribution.header, distribution.occupation.header),
    body: {
      col_1: exportZone(distribution.columns.first, distribution.occupation.columns.first),
      col_2: exportZone(distribution.columns.second, distribution.occupation.columns.second),
      col_3: exportZone(distribution.columns.third, distribution.occupation.columns.third),
      col_4: exportZone(distribution.columns.fourth, distribution.occupation.columns.fourth),
      col_5: exportZone(distribution.columns.fifth, distribution.occupation.columns.fifth),
      col_6: exportZone(distribution.columns.sixth, distribution.occupation.columns.sixth),
      col_7: exportZone(distribution.columns.seventh, distribution.occupation.columns.seventh),
      col_8: exportZone(distribution.columns.eighth, distribution.occupation.columns.eighth),
    },
    footer: exportZone(distribution.footer, distribution.occupation.footer),
  };
}
