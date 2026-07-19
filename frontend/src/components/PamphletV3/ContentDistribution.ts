/**
 * ContentDistribution.ts — Packs pamphlet streams into header, eight columns, and footer.
 */
import {
  PAMPHLET_V3_COLUMN_WIDTH_MM,
  PAMPHLET_V3_ZONE_CAPACITY_MM,
  exportItems,
  packItemsIntoZones,
  zoneOccupationPercent,
  zoneUsedHeightMm,
  type PamphletV3ContentItem,
  type PamphletV3ContentJson,
  type PamphletV3Document,
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
] as const;

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

/**
 * Distributes document streams into printable zones using each item's heightMm.
 * Reading order: front col1 → front col2 → inner left → inner right → back cols.
 */
export default function contentDistribution(document: PamphletV3Document): PamphletContentDistribution {
  const gapMm = document.itemGapMm;
  const header = document.headerItems;
  const footer = document.footerItems;

  const packed = packItemsIntoZones(
    document.bodyItems,
    [...COLUMN_ZONE_IDS],
    PAMPHLET_V3_ZONE_CAPACITY_MM.column,
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
      header: occupationFor(header, PAMPHLET_V3_ZONE_CAPACITY_MM.header, gapMm),
      footer: occupationFor(footer, PAMPHLET_V3_ZONE_CAPACITY_MM.footer, gapMm),
      columns: {
        first: occupationFor(columns.first, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        second: occupationFor(columns.second, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        third: occupationFor(columns.third, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        fourth: occupationFor(columns.fourth, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        fifth: occupationFor(columns.fifth, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        sixth: occupationFor(columns.sixth, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        seventh: occupationFor(columns.seventh, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
        eighth: occupationFor(columns.eighth, PAMPHLET_V3_ZONE_CAPACITY_MM.column, gapMm),
      },
    },
  };
}

/** Builds live export JSON from the current zone distribution (skips empty items). */
export function distributionToContentJson(
  distribution: PamphletContentDistribution,
): PamphletV3ContentJson {
  return {
    header: exportItems(distribution.header),
    body: {
      col_1: exportItems(distribution.columns.first),
      col_2: exportItems(distribution.columns.second),
      col_3: exportItems(distribution.columns.third),
      col_4: exportItems(distribution.columns.fourth),
      col_5: exportItems(distribution.columns.fifth),
      col_6: exportItems(distribution.columns.sixth),
      col_7: exportItems(distribution.columns.seventh),
      col_8: exportItems(distribution.columns.eighth),
    },
    footer: exportItems(distribution.footer),
  };
}
