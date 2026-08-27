import CreateElement, { applyImageTransform, openItemEditTray } from "./create_element";
import {
    COLUMN_KEYS,
    FOOTER_COLUMN,
    FOOTER_FIELD_KEYS,
    HEADER_COLUMN,
    HEADER_FIELD_KEYS,
    DEFAULT_IMAGE_HEIGHT_MM,
    DEFAULT_STYLE_INDEXES,
    LEAD_IMAGE_HEIGHT_MM,
    STRUCTURED_LEAD_COLUMNS,
    clampImageHeightMm,
    emptyFooter,
    itemTypeToTag,
    tagToItemType,
    type ColumnKey,
    type FooterFieldKey,
    type HeaderFieldKey,
    type LastEditedElement,
    type PamphletFooter,
    type PamphletHeader,
    type PamphletItem,
    type PamphletItemType,
    type PamphletStructure,
    type StyleIndexes,
} from "./pamphlet_schema";

export const STYLE_INDEXES_ATTR = "data-style-indexes";
export const ITEM_TYPE_ATTR = "data-item-type";
export const HEIGHT_MM_ATTR = "data-height-mm";

const HEADER_FIELD_CLASSES: Record<HeaderFieldKey, string> = {
    title: "pamphlet-header-title",
    subtitle: "pamphlet-header-subtitle",
    author: "pamphlet-header-author",
    series: "pamphlet-header-series",
    series_chapter: "pamphlet-header-series-chapter",
    date: "pamphlet-header-date",
};

const FOOTER_FIELD_CLASSES: Record<FooterFieldKey, string[]> = {
    action: ["pamphlet-footer-action"],
    message: ["pamphlet-footer-message"],
    label1: ["pamphlet-footer-label", "pamphlet-footer-label-1"],
    value1: ["pamphlet-footer-value", "pamphlet-footer-value-1"],
    label2: ["pamphlet-footer-label", "pamphlet-footer-label-2"],
    value2: ["pamphlet-footer-value", "pamphlet-footer-value-2"],
    label3: ["pamphlet-footer-label", "pamphlet-footer-label-3"],
    value3: ["pamphlet-footer-value", "pamphlet-footer-value-3"],
    label4: ["pamphlet-footer-label", "pamphlet-footer-label-4"],
    value4: ["pamphlet-footer-value", "pamphlet-footer-value-4"],
};

/** Visible meta-bar fields under the subtitle (title + subtitle are full-width above). */
const HEADER_META_FIELDS: { field: HeaderFieldKey; label: string }[] = [
    { field: "series", label: "Serie" },
    { field: "series_chapter", label: "Capítulo" },
    { field: "author", label: "Autor" },
    { field: "date", label: "Fecha" },
];

/**
 * Footer meta as 2 pair-rows × 2 columns (spec 034):
 *   pair1 inline: (label1|value1) | (label2|value2)
 *   pair2 wrap:   (label3|value3) | (label4|value4)
 */
const FOOTER_META_PAIRS: {
    kind: "pair1" | "pair2";
    layout: "inline" | "wrap";
    leftLabel: FooterFieldKey;
    leftValue: FooterFieldKey;
    rightLabel: FooterFieldKey;
    rightValue: FooterFieldKey;
}[] = [
    {
        kind: "pair1",
        layout: "inline",
        leftLabel: "label1",
        leftValue: "value1",
        rightLabel: "label2",
        rightValue: "value2",
    },
    {
        kind: "pair2",
        layout: "wrap",
        leftLabel: "label3",
        leftValue: "value3",
        rightLabel: "label4",
        rightValue: "value4",
    },
];

export function parseStyleIndexes(raw: string | null): StyleIndexes {
    if (!raw) return structuredClone(DEFAULT_STYLE_INDEXES);
    try {
        return JSON.parse(raw) as StyleIndexes;
    } catch {
        return structuredClone(DEFAULT_STYLE_INDEXES);
    }
}

export function applyStyledContent(
    el: HTMLElement,
    content: string,
    styleIndexes: StyleIndexes,
): void {
    const [start, end] = styleIndexes[0];
    el.replaceChildren();

    if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end > start &&
        start >= 0 &&
        end <= content.length
    ) {
        if (start > 0) {
            el.appendChild(document.createTextNode(content.slice(0, start)));
        }
        const bold = document.createElement("b");
        bold.textContent = content.slice(start, end);
        el.appendChild(bold);
        if (end < content.length) {
            el.appendChild(document.createTextNode(content.slice(end)));
        }
        return;
    }

    el.textContent = content;
}

function applyItemMeta(container: HTMLElement, item: PamphletItem): void {
    container.setAttribute(ITEM_TYPE_ATTR, item.type);
    container.setAttribute(STYLE_INDEXES_ATTR, JSON.stringify(item.style_indexes));
    container.setAttribute(HEIGHT_MM_ATTR, String(item.height_mm ?? 0));
}

function createImageItemElement(item: PamphletItem, lead = false): HTMLElement {
    const container = document.createElement("div");
    container.className = "pamphlet-item";
    container.setAttribute("data-tray-mode", "full");
    applyItemMeta(container, item);
    if (lead) {
        container.setAttribute("data-lead-image", "1");
    }

    const heightMm = lead
        ? LEAD_IMAGE_HEIGHT_MM
        : clampImageHeightMm(item.height_mm || DEFAULT_IMAGE_HEIGHT_MM);
    container.setAttribute(HEIGHT_MM_ATTR, String(heightMm));

    const frame = document.createElement("div");
    frame.className = "pamphlet-image-frame";
    if (lead) {
        frame.classList.add("pamphlet-image-frame--lead");
        // Aspect 10:9 driven by CSS; height mm kept for PDF / reflow math.
        frame.style.height = `${heightMm}mm`;
    } else {
        frame.style.height = `${heightMm}mm`;
    }

    const img = document.createElement("img");
    img.className = "pamphlet-image";
    img.alt = "";
    img.draggable = false;
    if (item.content) {
        img.src = item.content;
    }
    frame.appendChild(img);
    container.appendChild(frame);
    // Cover + pan/zoom from style_indexes (must run after img is in the frame).
    applyImageTransform(container);

    frame.addEventListener("click", () => {
        openItemEditTray(container);
    });

    return container;
}

export function createItemElement(item: PamphletItem, opts?: { lead?: boolean }): HTMLElement {
    if (item.type === "image") {
        return createImageItemElement(item, Boolean(opts?.lead));
    }

    const tag = itemTypeToTag(item.type);
    const container = CreateElement(tag, "", [], [], item.content, {
        itemType: item.type,
    });
    applyItemMeta(container, item);
    const inner = container.firstElementChild as HTMLElement;
    applyStyledContent(inner, item.content, item.style_indexes);
    return container;
}

/** Non-editable gap between items (not after the last); height counts toward column fill. */
export function createItemSpacer(): HTMLElement {
    const spacer = document.createElement("div");
    spacer.className = "pamphlet-item-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
}

/** Append item; add a spacer only when another item will follow in the same column. */
export function appendItemWithSpacer(
    parent: HTMLElement,
    item: HTMLElement,
    withTrailingSpacer = true,
): HTMLElement | null {
    parent.appendChild(item);
    if (!withTrailingSpacer) return null;
    const spacer = createItemSpacer();
    parent.appendChild(spacer);
    return spacer;
}

function createHeaderFieldElement(field: HeaderFieldKey, value: string): HTMLElement {
    const container = CreateElement(
        "p",
        "",
        [],
        [],
        value,
        {
            trayMode: "header",
            headerField: field,
            extraClasses: ["pamphlet-header-item", HEADER_FIELD_CLASSES[field]],
        },
    );
    return container;
}

function createFooterFieldElement(
    field: FooterFieldKey,
    value: string,
    tag: "h1" | "p" = "p",
): HTMLElement {
    const container = CreateElement(
        tag,
        "",
        [],
        [],
        value,
        {
            trayMode: "header",
            footerField: field,
            itemType: tag === "h1" ? "heading_1" : "paragraph",
            extraClasses: ["pamphlet-footer-item", ...FOOTER_FIELD_CLASSES[field]],
        },
    );
    return container;
}

/** One meta column: bold label + value (inline single-line or wrap two-line). */
function createFooterMetaCell(
    labelField: FooterFieldKey,
    valueField: FooterFieldKey,
    labelText: string,
    valueText: string,
    layout: "inline" | "wrap",
): HTMLElement {
    const cell = document.createElement("div");
    cell.className = `pamphlet-footer-meta-cell pamphlet-footer-meta-cell--${layout}`;
    cell.appendChild(createFooterFieldElement(labelField, labelText, "p"));
    cell.appendChild(createFooterFieldElement(valueField, valueText, "p"));
    return cell;
}

function createLabeledHeaderMetaField(
    field: HeaderFieldKey,
    label: string,
    value: string,
): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "pamphlet-header-meta-field";

    const labelEl = document.createElement("span");
    labelEl.className = "pamphlet-header-meta-label";
    labelEl.textContent = `${label}:`;
    wrap.appendChild(labelEl);
    wrap.appendChild(createHeaderFieldElement(field, value));
    return wrap;
}

export function createAddItemButton(column: number): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pamphlet-add-item-button";
    btn.setAttribute("aria-label", "Add element");
    btn.dataset.addColumn = String(column);
    return btn;
}

export function renderPageChrome(main: HTMLElement, data: PamphletStructure): void {
    main.querySelector(":scope > .pamphlet-page-header")?.remove();
    main.querySelector(":scope > .pamphlet-page-footer")?.remove();

    const headerEl = document.createElement("header");
    headerEl.className = "pamphlet-page-header";
    headerEl.appendChild(createHeaderFieldElement("title", data.header.title ?? ""));

    // Double rule under title — same chrome language as footer Acción→Mensaje divider.
    const headerDivider = document.createElement("div");
    headerDivider.className = "pamphlet-header-divider";
    headerDivider.setAttribute("aria-hidden", "true");
    headerEl.appendChild(headerDivider);

    // Subtitle / key metadata (footer Mensaje analogue) — persisted as header.subtitle.
    headerEl.appendChild(createHeaderFieldElement("subtitle", data.header.subtitle ?? ""));

    const metaBar = document.createElement("div");
    metaBar.className = "pamphlet-header-meta-bar";

    // Two rows so Serie/Capítulo/Autor/Fecha fit the header band (one row overflows).
    const metaRows: { field: HeaderFieldKey; label: string }[][] = [
        HEADER_META_FIELDS.slice(0, 2),
        HEADER_META_FIELDS.slice(2, 4),
    ];
    for (const rowFields of metaRows) {
        const row = document.createElement("div");
        row.className = "pamphlet-header-meta-row";
        for (const { field, label } of rowFields) {
            row.appendChild(
                createLabeledHeaderMetaField(field, label, data.header[field] ?? ""),
            );
        }
        metaBar.appendChild(row);
    }
    headerEl.appendChild(metaBar);

    const footer = data.footer;
    const footerEl = document.createElement("footer");
    footerEl.className = "pamphlet-page-footer pamphlet-footer-region";

    // Acción + Mensaje as full-width editable fields (input chrome in CSS).
    footerEl.appendChild(createFooterFieldElement("action", footer.action ?? "", "h1"));

    const divider = document.createElement("div");
    divider.className = "pamphlet-footer-divider";
    divider.setAttribute("aria-hidden", "true");
    footerEl.appendChild(divider);

    footerEl.appendChild(createFooterFieldElement("message", footer.message ?? "", "p"));

    const footerMeta = document.createElement("div");
    footerMeta.className = "pamphlet-footer-meta-bar";
    for (const pair of FOOTER_META_PAIRS) {
        const row = document.createElement("div");
        row.className = "pamphlet-footer-meta-row";
        row.dataset.metaKind = pair.kind;
        row.appendChild(
            createFooterMetaCell(
                pair.leftLabel,
                pair.leftValue,
                footer[pair.leftLabel] ?? "",
                footer[pair.leftValue] ?? "",
                pair.layout,
            ),
        );
        row.appendChild(
            createFooterMetaCell(
                pair.rightLabel,
                pair.rightValue,
                footer[pair.rightLabel] ?? "",
                footer[pair.rightValue] ?? "",
                pair.layout,
            ),
        );
        const leftEmpty = !(footer[pair.leftValue] ?? "").trim();
        const rightEmpty = !(footer[pair.rightValue] ?? "").trim();
        if (leftEmpty && rightEmpty) row.dataset.valuesEmpty = "1";
        footerMeta.appendChild(row);
    }
    footerEl.appendChild(footerMeta);

    main.appendChild(headerEl);
    main.appendChild(footerEl);
}

/** Lead slot above an odd body column (sibling of .dumb-column, not inside it). */
export function createLeadSlotElement(columnNum: number, item: PamphletItem): HTMLElement {
    const slot = document.createElement("div");
    slot.className = `pamphlet-lead-slot pamphlet-lead-${columnNum}`;
    slot.setAttribute("data-lead-for", String(columnNum));
    slot.appendChild(createItemElement(item, { lead: true }));
    return slot;
}

/** Re-attach structured lead slots after reflow (which clears main). */
export function renderStructuredLeadSlots(main: HTMLElement, data: PamphletStructure): void {
    main.querySelectorAll(":scope > .pamphlet-lead-slot").forEach((el) => el.remove());
    if (data.type !== "pamphlet_structured_images") return;
    for (const key of STRUCTURED_LEAD_COLUMNS) {
        const colNum = Number(key.replace("column_", ""));
        const first = data[key]?.[0];
        if (!first || first.type !== "image") continue;
        main.appendChild(createLeadSlotElement(colNum, first));
    }
}

export function renderFromPamphlet(main: HTMLElement, data: PamphletStructure): void {
    main.innerHTML = "";
    const structured = data.type === "pamphlet_structured_images";
    const leadCols = new Set<ColumnKey>(STRUCTURED_LEAD_COLUMNS);

    COLUMN_KEYS.forEach((key, index) => {
        const colNum = index + 1;
        const col = document.createElement("div");
        col.className = `dumb-column pamphlet-column-${colNum}`;
        main.appendChild(col);

        let colItems = data[key] ?? [];
        if (structured && leadCols.has(key) && colItems[0]?.type === "image") {
            main.appendChild(createLeadSlotElement(colNum, colItems[0]));
            colItems = colItems.slice(1);
        }
        colItems.forEach((item, itemIndex) => {
            appendItemWithSpacer(
                col,
                createItemElement(item),
                itemIndex < colItems.length - 1,
            );
        });
    });

    renderPageChrome(main, data);
}

function parseItemType(container: HTMLElement, fallbackTag: string): PamphletItemType {
    const typeAttr = container.getAttribute(ITEM_TYPE_ATTR);
    if (typeAttr === "heading_1" || typeAttr === "paragraph" || typeAttr === "image") {
        return typeAttr;
    }
    return tagToItemType(fallbackTag);
}

function serializeItem(container: HTMLElement): PamphletItem {
    const type = parseItemType(container, container.firstElementChild?.tagName ?? "P");
    const heightRaw = Number(container.getAttribute(HEIGHT_MM_ATTR) ?? 0);
    const height_mm = type === "image" ? clampImageHeightMm(heightRaw || DEFAULT_IMAGE_HEIGHT_MM) : 0;

    if (type === "image") {
        const img = container.querySelector<HTMLImageElement>(":scope > .pamphlet-image-frame > img");
        return {
            type,
            content: img?.getAttribute("src") ?? "",
            style_indexes: parseStyleIndexes(container.getAttribute(STYLE_INDEXES_ATTR)),
            height_mm,
        };
    }

    const inner = container.firstElementChild as HTMLElement | null;
    return {
        type,
        content: inner?.textContent ?? "",
        style_indexes: parseStyleIndexes(container.getAttribute(STYLE_INDEXES_ATTR)),
        height_mm: 0,
    };
}

export function serializeHeaderFromDom(main: HTMLElement): PamphletHeader {
    const header: PamphletHeader = {
        title: "",
        subtitle: "",
        author: "",
        series: "",
        series_chapter: "",
        date: "",
    };

    const items = main.querySelectorAll<HTMLElement>(
        ":scope > .pamphlet-page-header .pamphlet-item[data-header-field]",
    );
    items.forEach((item) => {
        const field = item.getAttribute("data-header-field") as HeaderFieldKey | null;
        if (!field || !(field in header)) return;
        const inner = item.firstElementChild as HTMLElement | null;
        header[field] = inner?.textContent ?? "";
    });

    return header;
}

export function serializeFooterFromDom(main: HTMLElement): PamphletFooter {
    const footer: PamphletFooter = emptyFooter();
    const root = main.querySelector<HTMLElement>(":scope > .pamphlet-page-footer");
    if (!root) return footer;

    const items = root.querySelectorAll<HTMLElement>(
        ".pamphlet-item[data-footer-field]",
    );
    items.forEach((item) => {
        const field = item.getAttribute("data-footer-field") as FooterFieldKey | null;
        if (!field || !(field in footer)) return;
        const inner = item.firstElementChild as HTMLElement | null;
        footer[field] = inner?.textContent ?? "";
    });

    syncFooterMetaEmptyFlags(root, footer);
    return footer;
}

/**
 * When both values in a pair-row are empty, mark valuesEmpty so CSS uses the
 * label-only row height (drops the +1.5mm value slice) without changing band height.
 */
export function syncFooterMetaEmptyFlags(root: HTMLElement, footer?: PamphletFooter): void {
    const data = footer ?? serializeFooterFieldsOnly(root);
    const pairs: { kind: string; left: FooterFieldKey; right: FooterFieldKey }[] = [
        { kind: "pair1", left: "value1", right: "value2" },
        { kind: "pair2", left: "value3", right: "value4" },
    ];
    for (const pair of pairs) {
        const row = root.querySelector<HTMLElement>(
            `.pamphlet-footer-meta-row[data-meta-kind='${pair.kind}']`,
        );
        if (!row) continue;
        const empty = !data[pair.left].trim() && !data[pair.right].trim();
        if (empty) row.dataset.valuesEmpty = "1";
        else delete row.dataset.valuesEmpty;
    }
}

function serializeFooterFieldsOnly(root: HTMLElement): PamphletFooter {
    const footer = emptyFooter();
    root.querySelectorAll<HTMLElement>(".pamphlet-item[data-footer-field]").forEach((item) => {
        const field = item.getAttribute("data-footer-field") as FooterFieldKey | null;
        if (!field || !(field in footer)) return;
        const inner = item.firstElementChild as HTMLElement | null;
        footer[field] = inner?.textContent ?? "";
    });
    return footer;
}

export function getItemLocation(container: HTMLElement): LastEditedElement | null {
    const header = container.closest<HTMLElement>(".pamphlet-page-header");
    if (header) {
        const field = container.getAttribute("data-header-field") as HeaderFieldKey | null;
        if (!field) return null;
        const index = HEADER_FIELD_KEYS.indexOf(field);
        if (index < 0) return null;
        return { column: HEADER_COLUMN, index };
    }

    const footer = container.closest<HTMLElement>(".pamphlet-page-footer");
    if (footer) {
        const field = container.getAttribute("data-footer-field") as FooterFieldKey | null;
        if (!field) return null;
        const index = FOOTER_FIELD_KEYS.indexOf(field);
        if (index < 0) return null;
        return { column: FOOTER_COLUMN, index };
    }

    const columnEl = container.closest<HTMLElement>(".dumb-column");
    if (!columnEl) {
        const leadSlot = container.closest<HTMLElement>(".pamphlet-lead-slot");
        if (!leadSlot) return null;
        const forCol = Number(leadSlot.getAttribute("data-lead-for") || "0");
        if (!forCol) return null;
        return { column: forCol, index: 0 };
    }

    const match = columnEl.className.match(/pamphlet-column-(\d+)/);
    if (!match) return null;

    const column = Number(match[1]);
    const items = Array.from(columnEl.querySelectorAll<HTMLElement>(":scope > .pamphlet-item"));
    let index = items.indexOf(container);
    if (index < 0) return null;

    // Lead lives outside the column; body items are shifted by +1 in JSON.
    const app = columnEl.closest(".pamphlet-app");
    const structured = app?.getAttribute("data-pamphlet-type") === "pamphlet_structured_images";
    const hasLead =
        structured &&
        (column === 1 || column === 3 || column === 5 || column === 7) &&
        Boolean(columnEl.parentElement?.querySelector(`:scope > .pamphlet-lead-${column}`));
    if (hasLead) index += 1;

    return { column, index };
}

export function getFlatIndex(data: PamphletStructure, loc: LastEditedElement): number {
    if (loc.column === HEADER_COLUMN || loc.column === FOOTER_COLUMN) {
        return loc.index;
    }
    let flat = 0;
    for (let c = 1; c < loc.column; c++) {
        flat += data[COLUMN_KEYS[c - 1]].length;
    }
    return flat + loc.index;
}

export function countItems(data: PamphletStructure): number {
    return COLUMN_KEYS.reduce((sum, key) => sum + data[key].length, 0);
}

export function serializePamphlet(
    main: HTMLElement,
    lastEdited: LastEditedElement,
    existing?: Pick<
        PamphletStructure,
        "id" | "ownerUserId" | "type" | "footer_profile_id" | "footer_bind"
    > | null,
): PamphletStructure {
    const appType = main.closest(".pamphlet-app")?.getAttribute("data-pamphlet-type");
    const type =
        existing?.type === "pamphlet_structured_images" ||
        appType === "pamphlet_structured_images"
            ? "pamphlet_structured_images"
            : "pamphlet_single_sheet";
    const pamphlet: PamphletStructure = {
        type,
        header: serializeHeaderFromDom(main),
        footer: serializeFooterFromDom(main),
        last_edited_element: { ...lastEdited },
        column_1: [],
        column_2: [],
        column_3: [],
        column_4: [],
        column_5: [],
        column_6: [],
        column_7: [],
        column_8: [],
    };
    if (existing?.id) pamphlet.id = existing.id;
    if (existing?.ownerUserId) pamphlet.ownerUserId = existing.ownerUserId;
    if (existing?.footer_profile_id) pamphlet.footer_profile_id = existing.footer_profile_id;
    if (existing?.footer_bind) pamphlet.footer_bind = existing.footer_bind;

    for (let i = 1; i <= 8; i++) {
        const key = COLUMN_KEYS[i - 1];
        const col = main.querySelector<HTMLElement>(`:scope > .pamphlet-column-${i}`);
        if (!col) {
            pamphlet[key] = [];
            continue;
        }
        const items = Array.from(col.querySelectorAll<HTMLElement>(":scope > .pamphlet-item"));
        const body = items.map(serializeItem);
        const leadEl = main.querySelector<HTMLElement>(
            `:scope > .pamphlet-lead-${i} > .pamphlet-item`,
        );
        if (leadEl) {
            const lead = serializeItem(leadEl);
            lead.height_mm = LEAD_IMAGE_HEIGHT_MM;
            pamphlet[key] = [lead, ...body];
        } else {
            pamphlet[key] = body;
        }
    }

    return pamphlet;
}

export function syncItemContentFromTextarea(container: HTMLElement): void {
    if (container.getAttribute(ITEM_TYPE_ATTR) === "image") return;

    const tray = container.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
    const inner = container.firstElementChild as HTMLElement | null;
    if (!tray || !inner) return;

    const content = tray.value;
    const styles = parseStyleIndexes(container.getAttribute(STYLE_INDEXES_ATTR));
    const [start, end] = styles[0];
    if (end > content.length || start > content.length || end < start) {
        styles[0] = [0, 0];
        container.setAttribute(STYLE_INDEXES_ATTR, JSON.stringify(styles));
    }
    applyStyledContent(inner, content, styles);
}

export function syncImageItemFromDom(
    container: HTMLElement,
): { content: string; heightMm: number; styleIndexes: StyleIndexes } | null {
    if (container.getAttribute(ITEM_TYPE_ATTR) !== "image") return null;
    const img = container.querySelector<HTMLImageElement>(":scope > .pamphlet-image-frame > img");
    const heightMm = clampImageHeightMm(
        Number(container.getAttribute(HEIGHT_MM_ATTR) || DEFAULT_IMAGE_HEIGHT_MM),
    );
    return {
        content: img?.getAttribute("src") ?? "",
        heightMm,
        styleIndexes: parseStyleIndexes(container.getAttribute(STYLE_INDEXES_ATTR)),
    };
}

export function isHeaderItem(container: HTMLElement): boolean {
    return container.hasAttribute("data-header-field");
}

export function isFooterItem(container: HTMLElement): boolean {
    return container.hasAttribute("data-footer-field");
}

/** Header or footer chrome field — simple tray, no column item ops. */
export function isChromeItem(container: HTMLElement): boolean {
    return isHeaderItem(container) || isFooterItem(container);
}

export function isImageItem(container: HTMLElement): boolean {
    return container.getAttribute(ITEM_TYPE_ATTR) === "image";
}
