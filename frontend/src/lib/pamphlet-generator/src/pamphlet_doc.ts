import {
    COLUMN_KEYS,
    FOOTER_COLUMN,
    HEADER_COLUMN,
    columnKey,
    createItemByType,
    createParagraphItem,
    type LastEditedElement,
    type PamphletItem,
    type PamphletItemType,
    type PamphletStructure,
    type StyleIndexes,
} from "./pamphlet_schema";

export interface FlatRef {
    column: number;
    index: number;
}

export function clonePamphlet(data: PamphletStructure): PamphletStructure {
    return structuredClone(data);
}

export function getRegionItems(data: PamphletStructure, column: number): PamphletItem[] {
    if (column === FOOTER_COLUMN) return data.footer.items;
    if (column >= 1 && column <= 8) return data[columnKey(column)];
    return [];
}

export function totalItemCount(data: PamphletStructure): number {
    return COLUMN_KEYS.reduce((sum, key) => sum + data[key].length, 0);
}

export function resolveLocation(data: PamphletStructure, loc: LastEditedElement): FlatRef | null {
    if (loc.column === HEADER_COLUMN) {
        if (loc.index < 0 || loc.index > 5) return null;
        return { column: HEADER_COLUMN, index: loc.index };
    }

    const items = getRegionItems(data, loc.column);
    if (!items || loc.index < 0 || loc.index >= items.length) {
        return null;
    }
    return { column: loc.column, index: loc.index };
}

export function previousLocation(data: PamphletStructure, loc: FlatRef): LastEditedElement | null {
    if (loc.column === FOOTER_COLUMN) {
        if (loc.index > 0) return { column: FOOTER_COLUMN, index: loc.index - 1 };
        return null;
    }

    if (loc.index > 0) {
        return { column: loc.column, index: loc.index - 1 };
    }
    for (let c = loc.column - 1; c >= 1; c--) {
        const len = data[columnKey(c)].length;
        if (len > 0) {
            return { column: c, index: len - 1 };
        }
    }
    return null;
}

export function nextLocation(data: PamphletStructure, loc: FlatRef): LastEditedElement | null {
    if (loc.column === FOOTER_COLUMN) {
        const len = data.footer.items.length;
        if (loc.index < len - 1) return { column: FOOTER_COLUMN, index: loc.index + 1 };
        return null;
    }

    const len = data[columnKey(loc.column)].length;
    if (loc.index < len - 1) {
        return { column: loc.column, index: loc.index + 1 };
    }
    for (let c = loc.column + 1; c <= 8; c++) {
        if (data[columnKey(c)].length > 0) {
            return { column: c, index: 0 };
        }
    }
    return null;
}

function swapItems(data: PamphletStructure, a: FlatRef, b: FlatRef): void {
    const itemsA = getRegionItems(data, a.column);
    const itemsB = getRegionItems(data, b.column);
    const itemA = itemsA[a.index];
    itemsA[a.index] = itemsB[b.index];
    itemsB[b.index] = itemA;
}

export function moveItemUp(data: PamphletStructure, loc: FlatRef): LastEditedElement | null {
    const prev = previousLocation(data, loc);
    if (!prev) return null;
    if (loc.column === FOOTER_COLUMN && prev.column !== FOOTER_COLUMN) return null;
    if (loc.column !== FOOTER_COLUMN && prev.column === FOOTER_COLUMN) return null;
    swapItems(data, loc, prev);
    return prev;
}

export function moveItemDown(data: PamphletStructure, loc: FlatRef): LastEditedElement | null {
    const next = nextLocation(data, loc);
    if (!next) return null;
    if (loc.column === FOOTER_COLUMN && next.column !== FOOTER_COLUMN) return null;
    if (loc.column !== FOOTER_COLUMN && next.column === FOOTER_COLUMN) return null;
    swapItems(data, loc, next);
    return next;
}

export function insertItem(
    data: PamphletStructure,
    loc: FlatRef,
    item: PamphletItem,
    where: "above" | "below",
): LastEditedElement {
    const items = getRegionItems(data, loc.column);
    const insertAt = where === "above" ? loc.index : loc.index + 1;
    items.splice(insertAt, 0, item);
    return { column: loc.column, index: insertAt };
}

export function appendItem(
    data: PamphletStructure,
    column: number,
    item: PamphletItem,
): LastEditedElement {
    const items = getRegionItems(data, column);
    items.push(item);
    return { column, index: items.length - 1 };
}

export function deleteItem(
    data: PamphletStructure,
    loc: FlatRef,
): { focus: LastEditedElement } {
    if (loc.column === FOOTER_COLUMN) {
        const prev = previousLocation(data, loc);
        const next = nextLocation(data, loc);
        data.footer.items.splice(loc.index, 1);
        if (prev) return { focus: prev };
        if (next) return { focus: { column: FOOTER_COLUMN, index: loc.index } };
        return { focus: { column: FOOTER_COLUMN, index: 0 } };
    }

    if (totalItemCount(data) <= 1) {
        data.column_1 = [];
        data.column_2 = [];
        data.column_3 = [];
        data.column_4 = [];
        data.column_5 = [];
        data.column_6 = [];
        data.column_7 = [];
        data.column_8 = [];
        return { focus: { column: 1, index: 0 } };
    }

    const prev = previousLocation(data, loc);
    const next = nextLocation(data, loc);
    data[columnKey(loc.column)].splice(loc.index, 1);

    if (prev) {
        return { focus: prev };
    }
    if (next) {
        if (next.column === loc.column) {
            return { focus: { column: next.column, index: loc.index } };
        }
        return { focus: next };
    }
    return { focus: { column: 1, index: 0 } };
}

export function applyBoldRange(
    data: PamphletStructure,
    loc: FlatRef,
    start: number,
    end: number,
): void {
    const items = getRegionItems(data, loc.column);
    const item = items[loc.index];
    if (item.type === "image") return;
    const a = Math.max(0, Math.min(start, end));
    const b = Math.min(item.content.length, Math.max(start, end));
    const styles = structuredClone(item.style_indexes) as StyleIndexes;
    styles[0] = [a, b];
    item.style_indexes = styles;
}

export function updateItemContent(
    data: PamphletStructure,
    loc: FlatRef,
    content: string,
): void {
    const items = getRegionItems(data, loc.column);
    const item = items[loc.index];
    item.content = content;
    if (item.type === "image") return;
    const [start, end] = item.style_indexes[0];
    if (end > content.length || start > content.length || end < start) {
        item.style_indexes[0] = [0, 0];
    }
}

export function updateItemHeightMm(
    data: PamphletStructure,
    loc: FlatRef,
    heightMm: number,
): void {
    const items = getRegionItems(data, loc.column);
    const item = items[loc.index];
    if (item.type !== "image") return;
    item.height_mm = heightMm;
}

export function newSiblingItem(template: PamphletItem): PamphletItem {
    return createItemByType(template.type);
}

export function createTypedItem(type: PamphletItemType): PamphletItem {
    return createItemByType(type);
}

export { createParagraphItem };
