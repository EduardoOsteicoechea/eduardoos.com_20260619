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

/** Top margin on every item — included in heightMm; packing gap is therefore 0. */
export const PAMPHLET_V3_ITEM_TOP_MARGIN_MM = 2;
/** Dashed selection border on each sheet item (top + bottom contribute to layout). */
export const PAMPHLET_V3_ITEM_BORDER_MM = 0.2;

/** Vertical capacities for each zone (fallback until DOM measures the stack).
 * Sheet 215.9mm − half padding 20mm − column chrome ≈ real content stack height.
 * Front/back columns share height with header/footer (`auto`), so they are shorter
 * than full-height inner columns — a single 150mm guess left a visible unused gap.
 */
export const PAMPHLET_V3_SHEET_HEIGHT_MM = 215.9;
export const PAMPHLET_V3_HALF_PADDING_MM = 10;
export const PAMPHLET_V3_COLUMN_ROW_GAP_MM = 4;
export const PAMPHLET_V3_ZONE_LABEL_RESERVE_MM = 4;
export const PAMPHLET_V3_ZONE_PADDING_MM = 2;

/** Default stack capacities by column role (used before ResizeObserver reports). */
export const PAMPHLET_V3_ZONE_CAPACITY_MM = {
  header: 36,
  footer: 36,
  /** Front page body columns (after a compact header band). */
  columnFront: 166,
  /** Inner page full-height columns. */
  columnInner: 190,
  /** Back page body columns (above a compact footer band). */
  columnBack: 166,
  /** Generic fallback when role is unknown. */
  column: 166,
} as const;

export type PamphletV3ColumnZoneId =
  | "first"
  | "second"
  | "third"
  | "fourth"
  | "fifth"
  | "sixth"
  | "seventh"
  | "eighth";

export const PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES: Record<PamphletV3ColumnZoneId, number> = {
  first: PAMPHLET_V3_ZONE_CAPACITY_MM.columnFront,
  second: PAMPHLET_V3_ZONE_CAPACITY_MM.columnFront,
  third: PAMPHLET_V3_ZONE_CAPACITY_MM.columnInner,
  fourth: PAMPHLET_V3_ZONE_CAPACITY_MM.columnInner,
  fifth: PAMPHLET_V3_ZONE_CAPACITY_MM.columnInner,
  sixth: PAMPHLET_V3_ZONE_CAPACITY_MM.columnInner,
  seventh: PAMPHLET_V3_ZONE_CAPACITY_MM.columnBack,
  eighth: PAMPHLET_V3_ZONE_CAPACITY_MM.columnBack,
};

export interface PamphletV3PackZone {
  id: string;
  capacityMm: number;
}

const REGULAR_FONT_MM = 3.53;
/** Header band copy is twice the body paragraph size. */
export const PAMPHLET_V3_PARAGRAPH_FONT_MM = REGULAR_FONT_MM;
export const PAMPHLET_V3_HEADER_FONT_MM = REGULAR_FONT_MM * 2;
/** Footer standard copy is three-quarters of body paragraph size. */
export const PAMPHLET_V3_FOOTER_FONT_MM = REGULAR_FONT_MM * 0.75;
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

function paragraphFontForZone(zone: PamphletV3Stream): number {
  if (zone === "header") {
    return PAMPHLET_V3_HEADER_FONT_MM;
  }
  if (zone === "footer") {
    return PAMPHLET_V3_FOOTER_FONT_MM;
  }
  return REGULAR_FONT_MM;
}

function emphasisFontForZone(zone: PamphletV3Stream): number {
  if (zone === "header") {
    return PAMPHLET_V3_HEADER_FONT_MM;
  }
  if (zone === "footer") {
    return PAMPHLET_V3_FOOTER_FONT_MM;
  }
  return KEY_IDEA_FONT_MM;
}

/** Estimates item height in millimeters for packing into columns.
 * Includes top margin + borders so estimates match measured heightMm.
 */
export function measurePamphletV3ItemHeight(
  item: PamphletV3ContentItem,
  widthMm: number,
  zone: PamphletV3Stream = "body",
): number {
  const paragraphFontMm = paragraphFontForZone(zone);
  const emphasisFontMm = emphasisFontForZone(zone);
  let contentMm = 0;
  switch (item.type) {
    case "key_idea":
      contentMm = measureTextHeightMm(item.text || " ", widthMm, emphasisFontMm);
      break;
    case "list": {
      const header = item.text.trim()
        ? measureTextHeightMm(item.text, widthMm, emphasisFontMm)
        : 0;
      const rows = item.listItems.length > 0 ? item.listItems : [{ id: "empty", text: " " }];
      const itemsHeight = rows.reduce(
        (sum, row) => sum + measureTextHeightMm(row.text || " ", widthMm, paragraphFontMm),
        0,
      );
      contentMm = header + itemsHeight;
      break;
    }
    case "image": {
      const imageH = item.imageHeightMm > 0 ? item.imageHeightMm : widthMm * 0.75;
      const legend = item.description.trim()
        ? measureTextHeightMm(item.description, widthMm, REGULAR_FONT_MM * 0.85)
        : 0;
      contentMm = imageH + legend;
      break;
    }
    default:
      contentMm = measureTextHeightMm(item.text || " ", widthMm, paragraphFontMm);
      break;
  }
  return contentMm + PAMPHLET_V3_ITEM_TOP_MARGIN_MM + PAMPHLET_V3_ITEM_BORDER_MM * 2;
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
  zone: PamphletV3Stream = "body",
): PamphletV3ContentItem[] {
  return items.map((item) => ({
    ...item,
    heightMm: measurePamphletV3ItemHeight(item, widthMm, zone),
  }));
}

/** Standard footer paragraphs shown on every new pamphlet. */
export const PAMPHLET_V3_STANDARD_FOOTER_TEXTS = [
  'Este contenido forma parte de la serie "Todo lo que necesitas saber sobre la Biblia".',
  "Si deseas conversar al respecto, contáctanos por whatsapp al +58 414 728 1033",
  "Si deseas recibir nuestra enseñanza en persona puedes asistir a nuestras reuniones semanales los domingos a las 10am en Mérida, Avenida las Américas, Sector el Campitos, en el salón de fiesta del Colegio de Licenciados en Educación.",
] as const;

export function buildEmptyPamphletV3Document(): PamphletV3Document {
  const footerItems = recalculateItemHeights(
    PAMPHLET_V3_STANDARD_FOOTER_TEXTS.map((text) => createPamphletV3Item("paragraph", { text })),
    PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM,
    "footer",
  );
  return {
    headerItems: [],
    bodyItems: [],
    footerItems,
    // Spacing lives in each item's top margin (included in heightMm).
    itemGapMm: 0,
  };
}

/** Packs a flat item list into sequential zones until each zone is full.
 * Uses each item's stored heightMm when set; otherwise estimates from content.
 * Each zone declares its own capacityMm (front/inner/back columns differ).
 */
export function packItemsIntoZones(
  items: PamphletV3ContentItem[],
  zones: ReadonlyArray<PamphletV3PackZone>,
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
  for (const zone of zones) {
    result[zone.id] = [];
  }

  let zoneIndex = 0;
  let used = 0;

  for (const item of sized) {
    while (zoneIndex < zones.length) {
      const zone = zones[zoneIndex];
      const capacityMm = Math.max(0, zone.capacityMm);
      const isFirstInZone = result[zone.id].length === 0;
      const leading = isFirstInZone ? 0 : gapMm;
      const layoutHeightMm = itemLayoutHeightMm(item, isFirstInZone);
      const fits = used + leading + layoutHeightMm <= capacityMm;
      if (fits || isFirstInZone) {
        if (!isFirstInZone) {
          used += gapMm;
        }
        result[zone.id].push(item);
        used += layoutHeightMm;
        if (!fits && result[zone.id].length === 1) {
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

/** Layout height in a zone: first item drops its top margin (CSS :first-child). */
export function itemLayoutHeightMm(item: PamphletV3ContentItem, isFirstInZone: boolean): number {
  const raw = Math.max(0, item.heightMm);
  if (!isFirstInZone) {
    return raw;
  }
  return Math.max(0, raw - PAMPHLET_V3_ITEM_TOP_MARGIN_MM);
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

/** Sums item layout heights in a zone (first item has no top margin). */
export function zoneUsedHeightMm(items: PamphletV3ContentItem[], gapMm: number = 0): number {
  if (items.length === 0) {
    return 0;
  }
  const content = items.reduce(
    (sum, item, index) => sum + itemLayoutHeightMm(item, index === 0),
    0,
  );
  return content + gapMm * Math.max(0, items.length - 1);
}

/** True when the leftover stack space can still host the add-content control. */
export function zoneHasRoomForAddControl(
  usedMm: number,
  capacityMm: number,
  minRoomMm: number = 8,
): boolean {
  if (capacityMm <= 0) {
    return true;
  }
  return capacityMm - usedMm >= minRoomMm;
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

export interface PamphletV3ZoneJson {
  occupationPercent: number;
  usedMm: number;
  capacityMm: number;
  items: PamphletV3JsonItem[];
}

export interface PamphletV3ContentJson {
  header: PamphletV3ZoneJson;
  body: {
    col_1: PamphletV3ZoneJson;
    col_2: PamphletV3ZoneJson;
    col_3: PamphletV3ZoneJson;
    col_4: PamphletV3ZoneJson;
    col_5: PamphletV3ZoneJson;
    col_6: PamphletV3ZoneJson;
    col_7: PamphletV3ZoneJson;
    col_8: PamphletV3ZoneJson;
  };
  footer: PamphletV3ZoneJson;
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

/** Zone payload for the live JSON panel: occupation stats + non-empty items. */
export function exportZone(
  items: PamphletV3ContentItem[],
  occupation: { percent: number; usedMm: number; capacityMm: number },
): PamphletV3ZoneJson {
  return {
    occupationPercent: Number(occupation.percent.toFixed(1)),
    usedMm: Number(occupation.usedMm.toFixed(2)),
    capacityMm: Number(occupation.capacityMm.toFixed(2)),
    items: exportItems(items),
  };
}
