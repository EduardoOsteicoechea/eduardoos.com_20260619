export type StyleIndexes = [[number, number], [number, number], [number, number]];

export type PamphletItemType = "paragraph" | "heading_1" | "image";

export interface PamphletItem {
    type: PamphletItemType;
    content: string;
    style_indexes: StyleIndexes;
    /** Frame height in mm for images; 0 for text items. */
    height_mm: number;
}

export interface PamphletHeader {
    title: string;
    subtitle: string;
    author: string;
    series: string;
    series_chapter: string;
    date: string;
}

export interface PamphletFooter {
    items: PamphletItem[];
}

/**
 * column: 0 = header field, 1–8 = body columns, 9 = footer
 * index: item/field index within that region
 */
export interface LastEditedElement {
    column: number;
    index: number;
}

export const HEADER_COLUMN = 0;
export const FOOTER_COLUMN = 9;

export const HEADER_FIELD_KEYS = [
    "title",
    "subtitle",
    "author",
    "series",
    "series_chapter",
    "date",
] as const;

export type HeaderFieldKey = (typeof HEADER_FIELD_KEYS)[number];

export const COLUMN_KEYS = [
    "column_1",
    "column_2",
    "column_3",
    "column_4",
    "column_5",
    "column_6",
    "column_7",
    "column_8",
] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];

export type PamphletStructure = {
    type: "pamphlet_single_sheet";
    header: PamphletHeader;
    footer: PamphletFooter;
    last_edited_element: LastEditedElement;
} & Record<ColumnKey, PamphletItem[]>;

export const DEFAULT_STYLE_INDEXES: StyleIndexes = [[0, 0], [0, 0], [0, 0]];
export const DEFAULT_IMAGE_HEIGHT_MM = 30;
export const MIN_IMAGE_HEIGHT_MM = 10;
export const IMAGE_HEIGHT_STEP_MM = 2;

const ROOT_KEYS = ["type", "header", "footer", "last_edited_element", ...COLUMN_KEYS] as const;
const HEADER_KEYS = [
    "title",
    "subtitle",
    "author",
    "series",
    "series_chapter",
    "date",
] as const;
const FOOTER_KEYS = ["items"] as const;
const LAST_EDITED_KEYS = ["column", "index"] as const;
const ITEM_KEYS = ["type", "content", "style_indexes", "height_mm"] as const;
const ITEM_TYPES = new Set<string>(["paragraph", "heading_1", "image"]);

function assertExactKeys(obj: object, expected: readonly string[], label: string): void {
    const keys = Object.keys(obj).sort();
    const want = [...expected].sort();
    if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
        throw new Error(
            `${label}: expected keys [${want.join(", ")}], got [${keys.join(", ")}]`,
        );
    }
}

function assertString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string") {
        throw new Error(`${label} must be a string`);
    }
}

function assertNonNegativeInt(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative integer`);
    }
}

function assertStyleIndexes(value: unknown, label: string): asserts value is StyleIndexes {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`${label} must be an array of 3 [start, end] pairs`);
    }
    for (let i = 0; i < 3; i++) {
        const pair = value[i];
        if (
            !Array.isArray(pair) ||
            pair.length !== 2 ||
            typeof pair[0] !== "number" ||
            typeof pair[1] !== "number"
        ) {
            throw new Error(`${label}[${i}] must be [number, number]`);
        }
    }
}

function assertPamphletItem(value: unknown, label: string): asserts value is PamphletItem {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    assertExactKeys(value, ITEM_KEYS, label);
    const item = value as Record<string, unknown>;
    assertString(item.type, `${label}.type`);
    if (!ITEM_TYPES.has(item.type)) {
        throw new Error(`${label}.type must be "paragraph", "heading_1", or "image"`);
    }
    assertString(item.content, `${label}.content`);
    assertStyleIndexes(item.style_indexes, `${label}.style_indexes`);
    if (typeof item.height_mm !== "number" || !Number.isFinite(item.height_mm) || item.height_mm < 0) {
        throw new Error(`${label}.height_mm must be a non-negative number`);
    }
    if (item.type === "image" && item.height_mm < MIN_IMAGE_HEIGHT_MM) {
        throw new Error(`${label}.height_mm must be >= ${MIN_IMAGE_HEIGHT_MM} for images`);
    }
}

function assertLastEditedElement(
    value: unknown,
    label: string,
): asserts value is LastEditedElement {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    assertExactKeys(value, LAST_EDITED_KEYS, label);
    const loc = value as Record<string, unknown>;
    assertNonNegativeInt(loc.column, `${label}.column`);
    assertNonNegativeInt(loc.index, `${label}.index`);
    if (loc.column < 0 || loc.column > 9) {
        throw new Error(`${label}.column must be between 0 and 9`);
    }
}

/** Upgrade legacy items missing height_mm before strict validation. */
export function normalizePamphletData(data: unknown): unknown {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return data;
    const root = data as Record<string, unknown>;

    const normalizeItem = (item: unknown): unknown => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return item;
        const rec = item as Record<string, unknown>;
        if (typeof rec.height_mm === "number" && Number.isFinite(rec.height_mm)) {
            return rec;
        }
        const type = rec.type;
        return {
            ...rec,
            height_mm: type === "image" ? DEFAULT_IMAGE_HEIGHT_MM : 0,
        };
    };

    const normalizeList = (list: unknown): unknown => {
        if (!Array.isArray(list)) return list;
        return list.map(normalizeItem);
    };

    const footer = root.footer;
    if (typeof footer === "object" && footer !== null && !Array.isArray(footer)) {
        const f = footer as Record<string, unknown>;
        root.footer = { ...f, items: normalizeList(f.items) };
    }

    for (const col of COLUMN_KEYS) {
        root[col] = normalizeList(root[col]);
    }

    return root;
}

export function assertPamphletStructure(data: unknown): asserts data is PamphletStructure {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("Pamphlet JSON must be an object");
    }

    assertExactKeys(data, ROOT_KEYS, "Root");

    const root = data as Record<string, unknown>;
    if (root.type !== "pamphlet_single_sheet") {
        throw new Error('Root.type must be "pamphlet_single_sheet"');
    }

    if (typeof root.header !== "object" || root.header === null || Array.isArray(root.header)) {
        throw new Error("header must be an object");
    }
    assertExactKeys(root.header, HEADER_KEYS, "header");
    const header = root.header as Record<string, unknown>;
    for (const key of HEADER_KEYS) {
        assertString(header[key], `header.${key}`);
    }

    if (typeof root.footer !== "object" || root.footer === null || Array.isArray(root.footer)) {
        throw new Error("footer must be an object");
    }
    assertExactKeys(root.footer, FOOTER_KEYS, "footer");
    const footer = root.footer as Record<string, unknown>;
    if (!Array.isArray(footer.items)) {
        throw new Error("footer.items must be an array");
    }
    footer.items.forEach((item, index) => {
        assertPamphletItem(item, `footer.items[${index}]`);
    });

    assertLastEditedElement(root.last_edited_element, "last_edited_element");

    for (const col of COLUMN_KEYS) {
        const items = root[col];
        if (!Array.isArray(items)) {
            throw new Error(`${col} must be an array`);
        }
        items.forEach((item, index) => {
            assertPamphletItem(item, `${col}[${index}]`);
        });
    }
}

export interface CreatePamphletMeta {
    title: string;
    series: string;
    series_chapter: string;
    author: string;
}

export function createParagraphItem(content = "Escribe aquí"): PamphletItem {
    return {
        type: "paragraph",
        content,
        style_indexes: structuredClone(DEFAULT_STYLE_INDEXES),
        height_mm: 0,
    };
}

export function createHeadingItem(content = "Escribe aquí"): PamphletItem {
    return {
        type: "heading_1",
        content,
        style_indexes: structuredClone(DEFAULT_STYLE_INDEXES),
        height_mm: 0,
    };
}

export function createImageItem(
    content = "",
    heightMm = DEFAULT_IMAGE_HEIGHT_MM,
): PamphletItem {
    return {
        type: "image",
        content,
        style_indexes: structuredClone(DEFAULT_STYLE_INDEXES),
        height_mm: Math.max(MIN_IMAGE_HEIGHT_MM, heightMm),
    };
}

export function createItemByType(type: PamphletItemType): PamphletItem {
    if (type === "heading_1") return createHeadingItem();
    if (type === "image") return createImageItem();
    return createParagraphItem();
}

/** @deprecated Prefer createParagraphItem / createItemByType */
export function createStarterItem(): PamphletItem {
    return createParagraphItem();
}

export function createEmptyPamphlet(meta: CreatePamphletMeta): PamphletStructure {
    return {
        type: "pamphlet_single_sheet",
        header: {
            title: meta.title,
            subtitle: "",
            author: meta.author,
            series: meta.series,
            series_chapter: meta.series_chapter,
            date: new Date().toISOString().slice(0, 10),
        },
        footer: { items: [] },
        last_edited_element: { column: 1, index: 0 },
        column_1: [],
        column_2: [],
        column_3: [],
        column_4: [],
        column_5: [],
        column_6: [],
        column_7: [],
        column_8: [],
    };
}

export function itemTypeToTag(type: PamphletItemType): string {
    if (type === "heading_1") return "h1";
    if (type === "image") return "div";
    return "p";
}

export function tagToItemType(tag: string): PamphletItemType {
    const t = tag.toLowerCase();
    if (t === "h1") return "heading_1";
    return "paragraph";
}

export function columnKey(column: number): ColumnKey {
    return COLUMN_KEYS[column - 1];
}

export function clampImageHeightMm(heightMm: number): number {
    if (!Number.isFinite(heightMm)) return DEFAULT_IMAGE_HEIGHT_MM;
    return Math.max(MIN_IMAGE_HEIGHT_MM, Math.round(heightMm));
}
