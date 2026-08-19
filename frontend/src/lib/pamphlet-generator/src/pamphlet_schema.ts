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

/**
 * Fixed footer chrome (mirrors header): action heading, message paragraph,
 * then a 4×2 meta grid painted as:
 *   label1|label2, value1|value2, label3|label4, value3|value4
 * so captions (WhatsApp / Teléfono / …) sit on their own row above values.
 */
export interface PamphletFooter {
    action: string;
    message: string;
    label1: string;
    value1: string;
    label2: string;
    value2: string;
    label3: string;
    value3: string;
    label4: string;
    value4: string;
}

/**
 * column: 0 = header field, 1–8 = body columns, 9 = footer field
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

export const FOOTER_FIELD_KEYS = [
    "action",
    "message",
    "label1",
    "value1",
    "label2",
    "value2",
    "label3",
    "value3",
    "label4",
    "value4",
] as const;

export type FooterFieldKey = (typeof FOOTER_FIELD_KEYS)[number];

/** Default captions for the four meta slots (user can rewrite each label). */
export const FOOTER_DEFAULT_LABELS = {
    label1: "WhatsApp",
    label2: "Teléfono",
    label3: "Dirección",
    label4: "Actividades",
} as const;

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
    /** Stable cloud/local document id (UUID). Optional on legacy files. */
    id?: string;
    /** JWT subject (email) when last saved to the cloud. Optional. */
    ownerUserId?: string;
    header: PamphletHeader;
    footer: PamphletFooter;
    /**
     * Header type/spacing sizes in mm — source of truth for PDF parity.
     * Sent on print; not required in saved .epam files.
     */
    header_layout?: PamphletHeaderLayoutMm;
    /**
     * Footer chrome sizes in mm — source of truth for PDF parity.
     * Sent on print; not required in saved .epam files.
     */
    footer_layout?: PamphletFooterLayoutMm;
    last_edited_element: LastEditedElement;
} & Record<ColumnKey, PamphletItem[]>;

/**
 * Exact CSS mm for `.pamphlet-page-header` — keep in sync with style.css.
 * Print POSTs this so the PDF builder does not invent its own sizes.
 */
export type PamphletHeaderLayoutMm = {
    /** Header band track height (--page-header-height). */
    height: number;
    /** Gap under the header before cols 1–2 (--header-body-gutter). */
    body_gutter: number;
    /** Vertical pad inside outer frame. */
    pad: number;
    /** Lateral pad inside outer frame (pad + 2mm vs original 1.2). */
    pad_x: number;
    radius: number;
    stroke: number;
    inner_inset: number;
    inner_stroke: number;
    inner_radius: number;
    title_size: number;
    title_lh: number;
    /**
     * Clear space from title double-divider bottom → meta bar
     * (was 0.6; +2mm → 2.6). Header flex gap is 0; this is divider margin-bottom.
     */
    title_meta_gap: number;
    /** Double rule under title — same language as footer Acción→Mensaje divider. */
    divider_outer_stroke: number;
    divider_gap: number;
    divider_inner_stroke: number;
    meta_size: number;
    meta_lh: number;
    /** Meta grid row-gap. */
    meta_row_gap: number;
    /** Meta grid column-gap. */
    meta_col_gap: number;
};

/** Exact mm from style.css `.pamphlet-page-header` — PDF must use these, not invent sizes. */
export const PAMPHLET_HEADER_LAYOUT_MM: PamphletHeaderLayoutMm = {
    // pad + title + divider (0.75) + title_meta_gap 2.6 + meta + frame
    height: 30,
    body_gutter: 1, // --header-body-gutter
    pad: 1.2,
    pad_x: 3.2, // 1.2 + 2mm lateral
    radius: 1,
    stroke: 0.2,
    inner_inset: 0.45,
    inner_stroke: 0.1,
    inner_radius: 0.6,
    title_size: 6.75, // .pamphlet-header-title p
    title_lh: 1.1,
    title_meta_gap: 2.6, // divider → meta (+2mm from prior 0.6)
    divider_outer_stroke: 0.2,
    divider_gap: 0.45,
    divider_inner_stroke: 0.1,
    meta_size: 2.5, // .pamphlet-header-meta-label / meta values
    meta_lh: 1.2,
    meta_row_gap: 0.8, // .pamphlet-header-meta-bar { row-gap }
    meta_col_gap: 2.5, // .pamphlet-header-meta-bar { column-gap }
};

/**
 * Exact CSS mm for `.pamphlet-page-footer` — keep in sync with style.css.
 * Print POSTs this so the PDF builder does not invent its own sizes.
 * Every paint dimension the footer needs must live here.
 */
export type PamphletFooterLayoutMm = {
    /** Full footer band height (--page-footer-height). */
    height: number;
    /** Band width: 2 cols + narrow gutter (same as header). */
    width: number;
    pad: number;
    radius: number;
    stroke: number;
    /** Clear gap inside outer border face → inner frame (CSS ::after inset). */
    inner_inset: number;
    inner_stroke: number;
    inner_radius: number;
    /** Gap between Mensaje and meta bar. */
    chrome_gap: number;
    /**
     * Double horizontal rule between Acción and Mensaje (footer double-chrome language).
     * Total block height = divider_outer_stroke + divider_gap + divider_inner_stroke.
     */
    divider_outer_stroke: number;
    divider_gap: number;
    divider_inner_stroke: number;
    action_size: number;
    action_lh: number;
    action_pad_x: number;
    action_pad_y: number;
    action_min_h: number;
    message_size: number;
    message_lh: number;
    message_pad_x: number;
    message_pad_y: number;
    message_min_h: number;
    meta_gap: number;
    meta_col_gap: number;
    meta_row_h: number;
    meta_value_row_h: number;
    meta_size: number;
    meta_lh: number;
    meta_pad_x: number;
    meta_pad_y: number;
    meta_value_pad_y: number;
    /** Editor hairline only; PDF and resting desktop use 0. */
    cell_stroke: number;
};

/** Exact mm from style.css `.pamphlet-page-footer` — PDF must use these, not invent sizes. */
export const PAMPHLET_FOOTER_LAYOUT_MM: PamphletFooterLayoutMm = {
    // 2×label 5.5 + 1×meta_gap 0.4 (value rows hidden when empty) + chrome + divider + pads
    height: 30,
    width: 119.7, // 57.85×2 + 4
    pad: 1.2,
    radius: 1,
    stroke: 0.2,
    inner_inset: 0.45,
    inner_stroke: 0.1,
    inner_radius: 0.6,
    chrome_gap: 0.6,
    divider_outer_stroke: 0.2,
    divider_gap: 0.45,
    divider_inner_stroke: 0.1,
    action_size: 3.175,
    action_lh: 1.25,
    action_pad_x: 1.4,
    action_pad_y: 0.7,
    action_min_h: 4.5,
    message_size: 2.469,
    message_lh: 1.25,
    message_pad_x: 1.4,
    message_pad_y: 0.7,
    message_min_h: 4.5,
    meta_gap: 0.4,
    meta_col_gap: 2,
    meta_row_h: 5.5,
    meta_value_row_h: 1.5,
    meta_size: 2.8,
    meta_lh: 1.25,
    meta_pad_x: 1,
    meta_pad_y: 0.7,
    meta_value_pad_y: 0.2,
    cell_stroke: 0.15,
};

export const DEFAULT_STYLE_INDEXES: StyleIndexes = [[0, 0], [0, 0], [0, 0]];
export const DEFAULT_IMAGE_HEIGHT_MM = 30;
export const MIN_IMAGE_HEIGHT_MM = 10;
export const IMAGE_HEIGHT_STEP_MM = 2;
/** Horizontal pan step inside the image frame. */
export const IMAGE_OFFSET_STEP_MM = 2;
/** Zoom step as a multiplier delta (0.1 = 10%). */
export const IMAGE_SCALE_STEP = 0.1;
export const MIN_IMAGE_SCALE = 0.5;
export const MAX_IMAGE_SCALE = 3;
export const DEFAULT_IMAGE_SCALE = 1;

export function emptyFooter(): PamphletFooter {
    return {
        action: "",
        message: "",
        label1: FOOTER_DEFAULT_LABELS.label1,
        value1: "",
        label2: FOOTER_DEFAULT_LABELS.label2,
        value2: "",
        label3: FOOTER_DEFAULT_LABELS.label3,
        value3: "",
        label4: FOOTER_DEFAULT_LABELS.label4,
        value4: "",
    };
}

/**
 * Image pan/zoom reuse unused style_indexes slots (text bold uses [0]):
 *   [1][0] = offset_x_mm * 100 (signed centi-mm; + = right)
 *   [1][1] = offset_y_mm * 100 (signed centi-mm; + = down)
 *   [2][0] = scale * 100 (100 = 1.0×)
 */
export function imageOffsetXMmFromStyles(styles: StyleIndexes): number {
    const raw = styles[1]?.[0];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
    return raw / 100;
}

export function imageOffsetYMmFromStyles(styles: StyleIndexes): number {
    const raw = styles[1]?.[1];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
    return raw / 100;
}

export function imageScaleFromStyles(styles: StyleIndexes): number {
    const raw = styles[2]?.[0];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
        return DEFAULT_IMAGE_SCALE;
    }
    return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, raw / 100));
}

export function writeImageTransformToStyles(
    styles: StyleIndexes,
    offsetXMm: number,
    offsetYMm: number,
    scale: number,
): StyleIndexes {
    const next = structuredClone(styles) as StyleIndexes;
    const clampedScale = Math.min(
        MAX_IMAGE_SCALE,
        Math.max(MIN_IMAGE_SCALE, Number.isFinite(scale) ? scale : DEFAULT_IMAGE_SCALE),
    );
    const clampedOffsetX = Number.isFinite(offsetXMm) ? offsetXMm : 0;
    const clampedOffsetY = Number.isFinite(offsetYMm) ? offsetYMm : 0;
    next[1] = [Math.round(clampedOffsetX * 100), Math.round(clampedOffsetY * 100)];
    next[2] = [Math.round(clampedScale * 100), 0];
    return next;
}

const ROOT_REQUIRED_KEYS = ["type", "header", "footer", "last_edited_element", ...COLUMN_KEYS] as const;
const ROOT_OPTIONAL_KEYS = ["id", "ownerUserId"] as const;
const HEADER_KEYS = [
    "title",
    "subtitle",
    "author",
    "series",
    "series_chapter",
    "date",
] as const;
const FOOTER_KEYS = [
    "action",
    "message",
    "label1",
    "value1",
    "label2",
    "value2",
    "label3",
    "value3",
    "label4",
    "value4",
] as const;
const LAST_EDITED_KEYS = ["column", "index"] as const;
const ITEM_KEYS = ["type", "content", "style_indexes", "height_mm"] as const;
const ITEM_TYPES = new Set<string>(["paragraph", "heading_1", "image"]);

/** Pull text out of a legacy footer.items[] entry. */
function legacyFooterItemText(item: unknown): string {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return "";
    const content = (item as Record<string, unknown>).content;
    return typeof content === "string" ? content : "";
}

/**
 * Upgrade legacy footers into fixed chrome fields.
 * Supports: items[], whatsapp/phone/… keys, and the current labelN/valueN shape.
 */
export function normalizeFooter(raw: unknown): PamphletFooter {
    const base = emptyFooter();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
    const f = raw as Record<string, unknown>;

    const hasNewShape = FOOTER_KEYS.some(
        (k) => typeof f[k] === "string" && (k.startsWith("label") || k.startsWith("value") || k === "action" || k === "message") && String(f[k]).length > 0,
    ) || ("label1" in f && "value1" in f);

    if (hasNewShape || FOOTER_KEYS.every((k) => k in f)) {
        for (const key of FOOTER_KEYS) {
            const v = f[key];
            if (typeof v === "string") {
                base[key] = v;
            }
        }
        // Keep default labels when an empty string was stored for a label slot.
        if (!base.label1.trim()) base.label1 = FOOTER_DEFAULT_LABELS.label1;
        if (!base.label2.trim()) base.label2 = FOOTER_DEFAULT_LABELS.label2;
        if (!base.label3.trim()) base.label3 = FOOTER_DEFAULT_LABELS.label3;
        if (!base.label4.trim()) base.label4 = FOOTER_DEFAULT_LABELS.label4;
        return base;
    }

    // Prior fixed chrome (whatsapp/phone/address/activities as values only).
    if ("whatsapp" in f || "phone" in f || "address" in f || "activities" in f) {
        base.action = typeof f.action === "string" ? f.action : "";
        base.message = typeof f.message === "string" ? f.message : "";
        base.value1 = typeof f.whatsapp === "string" ? f.whatsapp : "";
        base.value2 = typeof f.phone === "string" ? f.phone : "";
        base.value3 = typeof f.address === "string" ? f.address : "";
        base.value4 = typeof f.activities === "string" ? f.activities : "";
        return base;
    }

    if (Array.isArray(f.items)) {
        const texts = f.items.map(legacyFooterItemText);
        base.action = texts[0] ?? "";
        base.message = texts[1] ?? "";
        base.value1 = texts[2] ?? "";
        base.value2 = texts[3] ?? "";
        base.value3 = texts[4] ?? "";
        base.value4 = texts[5] ?? "";
    }
    return base;
}

function assertExactKeys(obj: object, expected: readonly string[], label: string): void {
    const keys = Object.keys(obj).sort();
    const want = [...expected].sort();
    if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
        throw new Error(
            `${label}: expected keys [${want.join(", ")}], got [${keys.join(", ")}]`,
        );
    }
}

function assertRootKeys(obj: object): void {
    const keys = Object.keys(obj);
    const allowed = new Set<string>([...ROOT_REQUIRED_KEYS, ...ROOT_OPTIONAL_KEYS]);
    for (const key of keys) {
        if (!allowed.has(key)) {
            throw new Error(`Root: unexpected key "${key}"`);
        }
    }
    for (const key of ROOT_REQUIRED_KEYS) {
        if (!(key in obj)) {
            throw new Error(`Root: missing required key "${key}"`);
        }
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
        root.footer = normalizeFooter(footer);
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

    assertRootKeys(data);

    const root = data as Record<string, unknown>;
    if (root.type !== "pamphlet_single_sheet") {
        throw new Error('Root.type must be "pamphlet_single_sheet"');
    }
    if (root.id !== undefined && typeof root.id !== "string") {
        throw new Error("Root.id must be a string when present");
    }
    if (root.ownerUserId !== undefined && typeof root.ownerUserId !== "string") {
        throw new Error("Root.ownerUserId must be a string when present");
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
    // Allow legacy keys during assert only after normalize; strict shape is FOOTER_KEYS.
    root.footer = normalizeFooter(root.footer);
    assertExactKeys(root.footer as object, FOOTER_KEYS, "footer");
    const footer = root.footer as Record<string, unknown>;
    for (const key of FOOTER_KEYS) {
        assertString(footer[key], `footer.${key}`);
    }

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

export function createParagraphItem(content = "Write here"): PamphletItem {
    return {
        type: "paragraph",
        content,
        style_indexes: structuredClone(DEFAULT_STYLE_INDEXES),
        height_mm: 0,
    };
}

export function createHeadingItem(content = "Write here"): PamphletItem {
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
        id: crypto.randomUUID(),
        header: {
            title: meta.title,
            subtitle: "",
            author: meta.author,
            series: meta.series,
            series_chapter: meta.series_chapter,
            date: new Date().toISOString().slice(0, 10),
        },
        footer: emptyFooter(),
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
