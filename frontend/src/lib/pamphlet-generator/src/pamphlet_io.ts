import CreateElement, { openItemEditTray } from "./create_element";
import {
    COLUMN_KEYS,
    FOOTER_COLUMN,
    HEADER_COLUMN,
    HEADER_FIELD_KEYS,
    DEFAULT_IMAGE_HEIGHT_MM,
    DEFAULT_STYLE_INDEXES,
    clampImageHeightMm,
    itemTypeToTag,
    tagToItemType,
    type HeaderFieldKey,
    type LastEditedElement,
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

/** Visible meta-bar fields under the title (subtitle stays in DOM but hidden). */
const HEADER_META_FIELDS: { field: HeaderFieldKey; label: string }[] = [
    { field: "series", label: "Serie" },
    { field: "series_chapter", label: "Capítulo" },
    { field: "author", label: "Autor" },
    { field: "date", label: "Fecha" },
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

function createImageItemElement(item: PamphletItem): HTMLElement {
    const container = document.createElement("div");
    container.className = "pamphlet-item";
    container.setAttribute("data-tray-mode", "full");
    applyItemMeta(container, item);

    const heightMm = clampImageHeightMm(item.height_mm || DEFAULT_IMAGE_HEIGHT_MM);
    container.setAttribute(HEIGHT_MM_ATTR, String(heightMm));

    const frame = document.createElement("div");
    frame.className = "pamphlet-image-frame";
    frame.style.height = `${heightMm}mm`;

    const img = document.createElement("img");
    img.className = "pamphlet-image";
    img.alt = "";
    if (item.content) {
        img.src = item.content;
    }
    frame.appendChild(img);
    container.appendChild(frame);

    frame.addEventListener("click", () => {
        openItemEditTray(container);
    });

    return container;
}

export function createItemElement(item: PamphletItem): HTMLElement {
    if (item.type === "image") {
        return createImageItemElement(item);
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

/** Non-editable gap under each item; height counts toward column fill. */
export function createItemSpacer(): HTMLElement {
    const spacer = document.createElement("div");
    spacer.className = "pamphlet-item-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
}

export function appendItemWithSpacer(parent: HTMLElement, item: HTMLElement): HTMLElement {
    parent.appendChild(item);
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
    btn.setAttribute("aria-label", "Añadir elemento");
    btn.dataset.addColumn = String(column);
    return btn;
}

export function renderPageChrome(main: HTMLElement, data: PamphletStructure): void {
    main.querySelector(":scope > .pamphlet-page-header")?.remove();
    main.querySelector(":scope > .pamphlet-page-footer")?.remove();

    const headerEl = document.createElement("header");
    headerEl.className = "pamphlet-page-header";
    headerEl.appendChild(createHeaderFieldElement("title", data.header.title ?? ""));

    const metaBar = document.createElement("div");
    metaBar.className = "pamphlet-header-meta-bar";
    for (const { field, label } of HEADER_META_FIELDS) {
        metaBar.appendChild(
            createLabeledHeaderMetaField(field, label, data.header[field] ?? ""),
        );
    }
    headerEl.appendChild(metaBar);

    // Keep subtitle in DOM for persistence / last_edited indexes, but hide it
    const subtitle = createHeaderFieldElement("subtitle", data.header.subtitle ?? "");
    subtitle.classList.add("pamphlet-header-field-hidden");
    headerEl.appendChild(subtitle);

    const footerEl = document.createElement("footer");
    footerEl.className = "pamphlet-page-footer dumb-column pamphlet-footer-column";
    for (const item of data.footer.items) {
        appendItemWithSpacer(footerEl, createItemElement(item));
    }

    main.appendChild(headerEl);
    main.appendChild(footerEl);
}

export function renderFromPamphlet(main: HTMLElement, data: PamphletStructure): void {
    main.innerHTML = "";

    COLUMN_KEYS.forEach((key, index) => {
        const col = document.createElement("div");
        col.className = `dumb-column pamphlet-column-${index + 1}`;
        main.appendChild(col);

        for (const item of data[key]) {
            appendItemWithSpacer(col, createItemElement(item));
        }
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

export function serializeFooterFromDom(main: HTMLElement): PamphletItem[] {
    const footer = main.querySelector<HTMLElement>(":scope > .pamphlet-page-footer");
    if (!footer) return [];
    return Array.from(footer.querySelectorAll<HTMLElement>(":scope > .pamphlet-item")).map(
        serializeItem,
    );
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
        const items = Array.from(footer.querySelectorAll<HTMLElement>(":scope > .pamphlet-item"));
        const index = items.indexOf(container);
        if (index < 0) return null;
        return { column: FOOTER_COLUMN, index };
    }

    const columnEl = container.closest<HTMLElement>(".dumb-column");
    if (!columnEl) return null;

    const match = columnEl.className.match(/pamphlet-column-(\d+)/);
    if (!match) return null;

    const column = Number(match[1]);
    const items = Array.from(columnEl.querySelectorAll<HTMLElement>(":scope > .pamphlet-item"));
    const index = items.indexOf(container);
    if (index < 0) return null;

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
): PamphletStructure {
    const pamphlet: PamphletStructure = {
        type: "pamphlet_single_sheet",
        header: serializeHeaderFromDom(main),
        footer: { items: serializeFooterFromDom(main) },
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

    for (let i = 1; i <= 8; i++) {
        const key = COLUMN_KEYS[i - 1];
        const col = main.querySelector<HTMLElement>(`:scope > .pamphlet-column-${i}`);
        if (!col) {
            pamphlet[key] = [];
            continue;
        }
        const items = Array.from(col.querySelectorAll<HTMLElement>(":scope > .pamphlet-item"));
        pamphlet[key] = items.map(serializeItem);
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
): { content: string; heightMm: number } | null {
    if (container.getAttribute(ITEM_TYPE_ATTR) !== "image") return null;
    const img = container.querySelector<HTMLImageElement>(":scope > .pamphlet-image-frame > img");
    const heightMm = clampImageHeightMm(
        Number(container.getAttribute(HEIGHT_MM_ATTR) || DEFAULT_IMAGE_HEIGHT_MM),
    );
    return {
        content: img?.getAttribute("src") ?? "",
        heightMm,
    };
}

export function isHeaderItem(container: HTMLElement): boolean {
    return container.hasAttribute("data-header-field");
}

export function isImageItem(container: HTMLElement): boolean {
    return container.getAttribute(ITEM_TYPE_ATTR) === "image";
}
