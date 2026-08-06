export type PamphletV3ItemType = "paragraph" | "heading" | "key_idea" | "list" | "image";
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
export const PAMPHLET_V3_COLUMN_WIDTH_MM = 55;
export const PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM = 118;
export const PAMPHLET_V3_ITEM_TOP_MARGIN_MM = 2;
export const PAMPHLET_V3_PARAGRAPH_TOP_MARGIN_MM = 2;
export const PAMPHLET_V3_HEADING_MARGIN_MM = 1;
export const PAMPHLET_V3_FOOTER_ITEM_TOP_MARGIN_EXTRA_MM = 1;
export const PAMPHLET_V3_ITEM_BORDER_MM = 0.2;
export function pamphletV3ItemTopMarginMm(item: Pick<PamphletV3ContentItem, "type">, zone: PamphletV3Stream = "body"): number {
    let base = PAMPHLET_V3_ITEM_TOP_MARGIN_MM;
    if (item.type === "heading") {
        base = PAMPHLET_V3_HEADING_MARGIN_MM;
    }
    else if (item.type === "paragraph") {
        base = PAMPHLET_V3_PARAGRAPH_TOP_MARGIN_MM;
    }
    return zone === "footer" ? base + PAMPHLET_V3_FOOTER_ITEM_TOP_MARGIN_EXTRA_MM : base;
}
export function pamphletV3ItemBottomMarginMm(item: Pick<PamphletV3ContentItem, "type">, zone: PamphletV3Stream = "body"): number {
    if (item.type !== "heading") {
        return 0;
    }
    return pamphletV3ItemTopMarginMm(item, zone);
}
export const PAMPHLET_V3_SHEET_HEIGHT_MM = 215.9;
export const PAMPHLET_V3_HALF_PADDING_MM = 10;
export const PAMPHLET_V3_COLUMN_ROW_GAP_MM = 2.5;
export const PAMPHLET_V3_ZONE_LABEL_RESERVE_MM = 4;
export const PAMPHLET_V3_ZONE_PADDING_MM = 2;
export const PAMPHLET_V3_ZONE_CAPACITY_MM = {
    header: 36,
    footer: 36,
    columnFront: 166,
    columnInner: 190,
    columnBack: 166,
    column: 166,
} as const;
export type PamphletV3ColumnZoneId = "first" | "second" | "third" | "fourth" | "fifth" | "sixth" | "seventh" | "eighth";
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
export const PAMPHLET_V3_PARAGRAPH_FONT_MM = REGULAR_FONT_MM;
export const PAMPHLET_V3_HEADER_FONT_MM = REGULAR_FONT_MM * 2;
export const PAMPHLET_V3_FOOTER_FONT_MM = REGULAR_FONT_MM * 0.75;
export const PAMPHLET_V3_HEADING_FONT_MM = REGULAR_FONT_MM * 1.35;
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
function headingFontForZone(zone: PamphletV3Stream): number {
    if (zone === "header") {
        return PAMPHLET_V3_HEADER_FONT_MM;
    }
    if (zone === "footer") {
        return PAMPHLET_V3_FOOTER_FONT_MM;
    }
    return PAMPHLET_V3_HEADING_FONT_MM;
}
export function measurePamphletV3ItemHeight(item: PamphletV3ContentItem, widthMm: number, zone: PamphletV3Stream = "body"): number {
    const paragraphFontMm = paragraphFontForZone(zone);
    const emphasisFontMm = emphasisFontForZone(zone);
    let contentMm = 0;
    switch (item.type) {
        case "heading":
            contentMm = measureTextHeightMm(item.text || " ", widthMm, headingFontForZone(zone));
            break;
        case "key_idea":
            contentMm = measureTextHeightMm(item.text || " ", widthMm, emphasisFontMm);
            break;
        case "list": {
            const header = item.text.trim()
                ? measureTextHeightMm(item.text, widthMm, emphasisFontMm)
                : 0;
            const rows = item.listItems.length > 0 ? item.listItems : [{ id: "empty", text: " " }];
            const itemsHeight = rows.reduce((sum, row) => sum + measureTextHeightMm(row.text || " ", widthMm, paragraphFontMm), 0);
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
    return (contentMm +
        pamphletV3ItemTopMarginMm(item, zone) +
        pamphletV3ItemBottomMarginMm(item, zone) +
        PAMPHLET_V3_ITEM_BORDER_MM * 2);
}
export function createPamphletV3Item(type: PamphletV3ItemType = "paragraph", partial: Partial<PamphletV3ContentItem> = {}): PamphletV3ContentItem {
    const base: PamphletV3ContentItem = {
        id: partial.id ?? nextId("item"),
        type,
        text: partial.text ?? "",
        heightMm: 0,
        listItems: partial.listItems ??
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
export function recalculateItemHeights(items: PamphletV3ContentItem[], widthMm: number, zone: PamphletV3Stream = "body"): PamphletV3ContentItem[] {
    return items.map((item) => ({
        ...item,
        heightMm: measurePamphletV3ItemHeight(item, widthMm, zone),
    }));
}
export const PAMPHLET_V3_STANDARD_FOOTER_TEXTS = [
    'Este contenido forma parte de la serie "Todo lo que necesitas saber sobre la Biblia".',
    "Si deseas conversar al respecto, contáctanos por whatsapp al +58 414 728 1033",
    "Si deseas recibir nuestra enseñanza en persona puedes asistir a nuestras reuniones semanales los domingos a las 10am en Mérida, Avenida las Américas, Sector el Campitos, en el salón de fiesta del Colegio de Licenciados en Educación.",
] as const;
export function buildEmptyPamphletV3Document(): PamphletV3Document {
    const footerItems = recalculateItemHeights(PAMPHLET_V3_STANDARD_FOOTER_TEXTS.map((text) => createPamphletV3Item("paragraph", { text })), PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM, "footer");
    return {
        headerItems: [],
        bodyItems: [],
        footerItems,
        itemGapMm: 0,
    };
}
export function packItemsIntoZones(items: PamphletV3ContentItem[], zones: ReadonlyArray<PamphletV3PackZone>, gapMm: number, widthMm: number): Record<string, PamphletV3ContentItem[]> {
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
export function itemLayoutHeightMm(item: PamphletV3ContentItem, isFirstInZone: boolean, zone: PamphletV3Stream = "body"): number {
    const raw = Math.max(0, item.heightMm);
    if (!isFirstInZone) {
        return raw;
    }
    const droppedMm = zone === "footer"
        ? item.type === "paragraph"
            ? PAMPHLET_V3_PARAGRAPH_TOP_MARGIN_MM
            : item.type === "heading"
                ? PAMPHLET_V3_HEADING_MARGIN_MM
                : PAMPHLET_V3_ITEM_TOP_MARGIN_MM
        : pamphletV3ItemTopMarginMm(item, zone);
    return Math.max(0, raw - droppedMm);
}
export function pxToMm(px: number): number {
    return (px * 25.4) / 96;
}
export function zoneOccupationPercent(usedMm: number, capacityMm: number): number {
    if (capacityMm <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, (usedMm / capacityMm) * 100));
}
export function zoneUsedHeightMm(items: PamphletV3ContentItem[], gapMm: number = 0, zone: PamphletV3Stream = "body"): number {
    if (items.length === 0) {
        return 0;
    }
    const content = items.reduce((sum, item, index) => sum + itemLayoutHeightMm(item, index === 0, zone), 0);
    return content + gapMm * Math.max(0, items.length - 1);
}
export function zoneHasRoomForAddControl(usedMm: number, capacityMm: number, minRoomMm: number = 8): boolean {
    if (capacityMm <= 0) {
        return true;
    }
    return capacityMm - usedMm >= minRoomMm;
}
export function resolveStreamForNewItem(requested: PamphletV3Stream, document: PamphletV3Document, options: {
    fromExistingHeaderItem?: boolean;
} = {}): PamphletV3Stream | null {
    if (requested === "footer") {
        return null;
    }
    if (requested === "header") {
        if (options.fromExistingHeaderItem || document.headerItems.length >= 1) {
            return "body";
        }
        return "header";
    }
    return "body";
}
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
export interface PamphletV3JsonItem {
    id: string;
    type: PamphletV3ItemType;
    text: string;
    listItems?: Array<{
        id: string;
        text: string;
    }>;
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
export function exportZone(items: PamphletV3ContentItem[], occupation: {
    percent: number;
    usedMm: number;
    capacityMm: number;
}): PamphletV3ZoneJson {
    return {
        occupationPercent: Number(occupation.percent.toFixed(1)),
        usedMm: Number(occupation.usedMm.toFixed(2)),
        capacityMm: Number(occupation.capacityMm.toFixed(2)),
        items: exportItems(items),
    };
}
