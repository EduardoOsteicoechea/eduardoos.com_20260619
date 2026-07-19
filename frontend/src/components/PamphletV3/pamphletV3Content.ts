/**
 * pamphletV3Content.ts — Content item model and mm height estimates for Pamphlet V3.
 */
export type PamphletV3ItemType = "paragraph" | "key_idea" | "list" | "image";

export interface PamphletV3ListItem {
  id: string;
  text: string;
}

export interface PamphletV3ContentItem {
  id: string;
  type: PamphletV3ItemType;
  text: string;
  heightMm: number;
  listItems: PamphletV3ListItem[];
  imageUrl: string;
  description: string;
  imageHeightMm: number;
}

export type PamphletV3Stream = "header" | "body" | "footer";

export interface PamphletV3Document {
  headerItems: PamphletV3ContentItem[];
  bodyItems: PamphletV3ContentItem[];
  footerItems: PamphletV3ContentItem[];
  itemGapMm: number;
}

/** Column content width used for wrap estimates (half-page column). */
export const PAMPHLET_V3_COLUMN_WIDTH_MM = 55;
export const PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM = 118;

/** Vertical capacities for each zone (matches PamphletPages.css geometry). */
export const PAMPHLET_V3_ZONE_CAPACITY_MM = {
  header: 40,
  footer: 40,
  column: 150,
} as const;

const REGULAR_FONT_MM = 3.53;
const KEY_IDEA_FONT_MM = 4;
const LINE_HEIGHT = 1.2;
const CHAR_WIDTH_FACTOR = 0.55;

let itemSeq = 0;

function nextId(prefix: string): string {
  itemSeq += 1;
  return `${prefix}-${itemSeq}`;
}

function lineHeightMm(fontSizeMm: number): number {
  return fontSizeMm * LINE_HEIGHT;
}

function measureTextHeightMm(text: string, widthMm: number, fontSizeMm: number): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return lineHeightMm(fontSizeMm);
  }
  const charsPerLine = Math.max(1, Math.floor(widthMm / (fontSizeMm * CHAR_WIDTH_FACTOR)));
  const lines = Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  return lines * lineHeightMm(fontSizeMm);
}

/** Estimates item height in millimeters for packing into columns. */
export function measurePamphletV3ItemHeight(
  item: PamphletV3ContentItem,
  widthMm: number,
): number {
  switch (item.type) {
    case "key_idea":
      return measureTextHeightMm(item.text || " ", widthMm, KEY_IDEA_FONT_MM);
    case "list": {
      const header = item.text.trim()
        ? measureTextHeightMm(item.text, widthMm, KEY_IDEA_FONT_MM)
        : 0;
      const rows = item.listItems.length > 0 ? item.listItems : [{ id: "empty", text: " " }];
      const itemsHeight = rows.reduce(
        (sum, row) => sum + measureTextHeightMm(row.text || " ", widthMm, REGULAR_FONT_MM),
        0,
      );
      return header + itemsHeight;
    }
    case "image": {
      const imageH = item.imageHeightMm > 0 ? item.imageHeightMm : widthMm * 0.75;
      const legend = item.description.trim()
        ? measureTextHeightMm(item.description, widthMm, REGULAR_FONT_MM * 0.85)
        : 0;
      return imageH + legend;
    }
    default:
      return measureTextHeightMm(item.text || " ", widthMm, REGULAR_FONT_MM);
  }
}

export function createPamphletV3Item(
  type: PamphletV3ItemType = "paragraph",
  partial: Partial<PamphletV3ContentItem> = {},
): PamphletV3ContentItem {
  const base: PamphletV3ContentItem = {
    id: partial.id ?? nextId("item"),
    type,
    text: partial.text ?? "",
    heightMm: 0,
    listItems:
      partial.listItems ??
      (type === "list" ? [{ id: nextId("li"), text: "" }] : []),
    imageUrl: partial.imageUrl ?? "",
    description: partial.description ?? "",
    imageHeightMm: partial.imageHeightMm ?? (type === "image" ? PAMPHLET_V3_COLUMN_WIDTH_MM * 0.75 : 0),
  };
  return {
    ...base,
    heightMm: measurePamphletV3ItemHeight(base, PAMPHLET_V3_COLUMN_WIDTH_MM),
  };
}

export function recalculateItemHeights(
  items: PamphletV3ContentItem[],
  widthMm: number,
): PamphletV3ContentItem[] {
  return items.map((item) => ({
    ...item,
    heightMm: measurePamphletV3ItemHeight(item, widthMm),
  }));
}

export function buildEmptyPamphletV3Document(): PamphletV3Document {
  return {
    headerItems: [],
    bodyItems: [],
    footerItems: [],
    itemGapMm: 2,
  };
}

/** Packs a flat item list into sequential zones until each zone is full.
 * Uses each item's stored heightMm when set; otherwise estimates from content.
 */
export function packItemsIntoZones(
  items: PamphletV3ContentItem[],
  zoneIds: string[],
  capacityMm: number,
  gapMm: number,
  widthMm: number,
): Record<string, PamphletV3ContentItem[]> {
  const sized = items.map((item) => {
    if (item.heightMm > 0) {
      return item;
    }
    return {
      ...item,
      heightMm: measurePamphletV3ItemHeight(item, widthMm),
    };
  });
  const result: Record<string, PamphletV3ContentItem[]> = {};
  for (const zoneId of zoneIds) {
    result[zoneId] = [];
  }

  let zoneIndex = 0;
  let used = 0;

  for (const item of sized) {
    while (zoneIndex < zoneIds.length) {
      const zoneId = zoneIds[zoneIndex];
      const leading = result[zoneId].length > 0 ? gapMm : 0;
      const fits = used + leading + item.heightMm <= capacityMm;
      if (fits || result[zoneId].length === 0) {
        if (result[zoneId].length > 0) {
          used += gapMm;
        }
        result[zoneId].push(item);
        used += item.heightMm;
        if (!fits && result[zoneId].length === 1) {
          // Oversized first item still occupies the zone; continue packing in the next zone.
          zoneIndex += 1;
          used = 0;
        }
        break;
      }
      zoneIndex += 1;
      used = 0;
    }
  }

  return result;
}

/** Converts CSS pixels to millimeters (CSS reference: 96px = 1in). */
export function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

/** Zone fill ratio from used height vs capacity (0–100). */
export function zoneOccupationPercent(usedMm: number, capacityMm: number): number {
  if (capacityMm <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (usedMm / capacityMm) * 100));
}

/** Sums item heights plus gaps between them. */
export function zoneUsedHeightMm(items: PamphletV3ContentItem[], gapMm: number): number {
  if (items.length === 0) {
    return 0;
  }
  const content = items.reduce((sum, item) => sum + Math.max(0, item.heightMm), 0);
  return content + gapMm * Math.max(0, items.length - 1);
}

/** True when the item has user-visible content worth exporting. */
export function pamphletV3ItemHasContent(item: PamphletV3ContentItem): boolean {
  switch (item.type) {
    case "list":
      return item.text.trim().length > 0 || item.listItems.some((row) => row.text.trim().length > 0);
    case "image":
      return item.imageUrl.trim().length > 0 || item.description.trim().length > 0;
    default:
      return item.text.trim().length > 0;
  }
}

/** Public JSON shape for one exported content block. */
export interface PamphletV3JsonItem {
  id: string;
  type: PamphletV3ItemType;
  text: string;
  listItems?: Array<{ id: string; text: string }>;
  imageUrl?: string;
  description?: string;
  imageHeightMm?: number;
  heightMm: number;
}

export interface PamphletV3ContentJson {
  header: PamphletV3JsonItem[];
  body: {
    col_1: PamphletV3JsonItem[];
    col_2: PamphletV3JsonItem[];
    col_3: PamphletV3JsonItem[];
    col_4: PamphletV3JsonItem[];
    col_5: PamphletV3JsonItem[];
    col_6: PamphletV3JsonItem[];
    col_7: PamphletV3JsonItem[];
    col_8: PamphletV3JsonItem[];
  };
  footer: PamphletV3JsonItem[];
}

function toJsonItem(item: PamphletV3ContentItem): PamphletV3JsonItem {
  const base: PamphletV3JsonItem = {
    id: item.id,
    type: item.type,
    text: item.text,
    heightMm: item.heightMm,
  };
  if (item.type === "list") {
    base.listItems = item.listItems.filter((row) => row.text.trim().length > 0);
  }
  if (item.type === "image") {
    base.imageUrl = item.imageUrl;
    base.description = item.description;
    base.imageHeightMm = item.imageHeightMm;
  }
  return base;
}

export function exportItems(items: PamphletV3ContentItem[]): PamphletV3JsonItem[] {
  return items.filter(pamphletV3ItemHasContent).map(toJsonItem);
}
