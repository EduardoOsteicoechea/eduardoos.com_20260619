import "./style.css";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";
import { MENU_ICON } from "./icons";
import { renderShell } from "./shell";
import type { PamphletTrayAction } from "./create_element";
import {
    appendItem,
    applyBoldRange,
    clonePamphlet,
    createTypedItem,
    deleteItem,
    getRegionItems,
    insertItem,
    moveItemDown,
    moveItemUp,
    resolveLocation,
    updateItemContent,
    updateItemHeightMm,
} from "./pamphlet_doc";
import {
    createPamphletFile,
    getOpenFileName,
    hasOpenFile,
    isFileSystemAccessSupported,
    openPamphletFile,
    savePamphlet,
} from "./pamphlet_file";
import {
    createAddItemButton,
    createItemElement,
    createItemSpacer,
    getFlatIndex,
    getItemLocation,
    isHeaderItem,
    isImageItem,
    renderFromPamphlet,
    renderPageChrome,
    serializePamphlet,
    syncImageItemFromDom,
    syncItemContentFromTextarea,
} from "./pamphlet_io";
import {
    FOOTER_COLUMN,
    HEADER_COLUMN,
    HEADER_FIELD_KEYS,
    createParagraphItem,
    type HeaderFieldKey,
    type LastEditedElement,
    type PamphletHeader,
    type PamphletItemType,
    type PamphletStructure,
} from "./pamphlet_schema";

type PendingInsert =
    | { mode: "end"; column: number }
    | { mode: "relative"; column: number; index: number; where: "above" | "below" };

export interface PamphletMountHandle {
    destroy(): void;
}

export function mountPamphletGenerator(host: HTMLElement): PamphletMountHandle {
    const appRoot = document.createElement("div");
    appRoot.className = "pamphlet-app";
    appRoot.innerHTML = renderShell(MENU_ICON);
    host.replaceChildren(appRoot);

    function requireElement<T extends HTMLElement>(selector: string): T {
        const el = appRoot.querySelector<T>(selector);
        if (!el) throw new Error(`Missing element: ${selector}`);
        return el;
    }

    const main = requireElement<HTMLElement>("main.pamphlet-sheet");
    const openBtn = requireElement<HTMLButtonElement>("#btn-open");
    const createBtn = requireElement<HTMLButtonElement>("#btn-create");
    const printBtn = requireElement<HTMLButtonElement>("#btn-print");
    const menuBtn = requireElement<HTMLButtonElement>("#btn-menu");
    const sidebar = requireElement<HTMLElement>("#app-sidebar");
    const sidebarBackdrop = requireElement<HTMLElement>("#sidebar-backdrop");
    const createModal = requireElement<HTMLDialogElement>("#create-modal");
    const createForm = requireElement<HTMLFormElement>("#create-form");
    const modalCancelBtn = requireElement<HTMLButtonElement>("#modal-cancel");
    const modalTitle = requireElement<HTMLInputElement>("#modal-title");
    const modalSeries = requireElement<HTMLInputElement>("#modal-series");
    const modalChapter = requireElement<HTMLInputElement>("#modal-chapter");
    const modalAuthor = requireElement<HTMLInputElement>("#modal-author");
    const itemTypeModal = requireElement<HTMLDialogElement>("#item-type-modal");
    const itemTypeCancelBtn = requireElement<HTMLButtonElement>("#item-type-cancel");

    const disposers: Array<() => void> = [];
    function on(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        target.addEventListener(type, listener, options);
        disposers.push(() => target.removeEventListener(type, listener, options));
    }

function updatePrintAvailability(): void {
    printBtn.disabled = !hasOpenFile() || !currentDoc;
}

function setSidebarOpen(open: boolean): void {
    sidebar.classList.toggle("is-open", open);
    sidebar.setAttribute("aria-hidden", open ? "false" : "true");
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    sidebarBackdrop.hidden = !open;
}

function closeSidebar(): void {
    setSidebarOpen(false);
}

function toggleSidebar(): void {
    setSidebarOpen(!sidebar.classList.contains("is-open"));
}

const usLetterHeightInMillimeters = 215.9;
const pageMarginMm = 10;
const pageHeaderHeightMm = 14;
const pageFooterHeightMm = 37.5; // 15mm × 2.5
const colGutterNarrowMm = 4;
/** Page 2 band / full page-1 chrome band: letter − 2×margin */
const columnContentHeightMm = usLetterHeightInMillimeters - pageMarginMm * 2;
/** Cols 1–2: under page header → discount header + gutter beneath it */
const page1RightColHeightMm =
    columnContentHeightMm - pageHeaderHeightMm - colGutterNarrowMm; // 177.9
/** Cols 7–8: above page footer → discount gutter above footer + footer */
const page1LeftColHeightMm =
    columnContentHeightMm - colGutterNarrowMm - pageFooterHeightMm; // 154.4

function maxHeightForColumn(columnIndex: number): number {
    if (columnIndex === 1 || columnIndex === 2) return page1RightColHeightMm;
    if (columnIndex === 7 || columnIndex === 8) return page1LeftColHeightMm;
    return columnContentHeightMm; // 3–6 (page 2)
}

/** Captured at load; used to keep app chrome size stable across browser zoom. */
const uiChromeBaselineDpr = window.devicePixelRatio || 1;

let currentHeader: PamphletHeader | null = null;
let currentDoc: PamphletStructure | null = null;
let undoSnapshot: PamphletStructure | null = null;
let suppressEditOpenSave = false;
let pendingInsert: PendingInsert | null = null;

function convertPixelsToMillimeters(px: number): number {
    return px * (25.4 / 96);
}

/** Keep #file-toolbar at a constant visual size when the user zooms the page. */
function syncFixedChromeScale(): void {
    const dpr = window.devicePixelRatio || 1;
    const zoom = dpr / uiChromeBaselineDpr;
    const inv = zoom > 0 ? 1 / zoom : 1;
    appRoot.style.setProperty("--ui-zoom", String(zoom));
    appRoot.style.setProperty("--ui-inv-zoom", String(inv));
}

type ToastKind = "info" | "success" | "error";

function showToast(message: string, kind: ToastKind = "info"): void {
    Toastify({
        text: message,
        duration: kind === "error" ? 5000 : 3200,
        gravity: "top",
        position: "left",
        stopOnFocus: true,
        close: true,
        className: `app-toast app-toast--${kind}`,
    }).showToast();
}

function setError(message: string): void {
    showToast(message, "error");
}

function clearError(): void {
    // Errors are ephemeral toasts; nothing persistent to clear.
}

function setStatus(message: string, kind: ToastKind = "info"): void {
    showToast(message, kind);
}

function measureBlockMm(item: HTMLElement, spacer: HTMLElement | null): number {
    const itemMm = convertPixelsToMillimeters(item.getBoundingClientRect().height);
    const spacerMm = spacer
        ? convertPixelsToMillimeters(spacer.getBoundingClientRect().height)
        : 0;
    return itemMm + spacerMm;
}

/** Probe how much vertical space a new starter item (+ spacer) and the + button need. */
function measureAddControlsMm(host: HTMLElement): { newItemMm: number; buttonMm: number } {
    const probeItem = createItemElement(createParagraphItem());
    const probeSpacer = createItemSpacer();
    const probeBtn = createAddItemButton(0);
    host.appendChild(probeItem);
    host.appendChild(probeSpacer);
    host.appendChild(probeBtn);
    const newItemMm = measureBlockMm(probeItem, probeSpacer);
    const buttonMm = convertPixelsToMillimeters(probeBtn.getBoundingClientRect().height);
    probeItem.remove();
    probeSpacer.remove();
    probeBtn.remove();
    return { newItemMm, buttonMm };
}

function placeColumnAddButton(
    container: HTMLElement,
    filledByColumn: Map<number, number>,
    lastFilledColumn: number,
): void {
    const host =
        container.querySelector<HTMLElement>(`:scope > .pamphlet-column-${lastFilledColumn}`) ??
        container.querySelector<HTMLElement>(":scope > .dumb-column");
    if (!host) return;

    const { newItemMm, buttonMm } = measureAddControlsMm(host);
    let colIdx = lastFilledColumn;
    let filled = filledByColumn.get(colIdx) ?? 0;

    while (colIdx <= 8) {
        const max = maxHeightForColumn(colIdx);
        // Only place + if a new item AND the button both fit
        if (filled + newItemMm + buttonMm <= max) {
            const col = container.querySelector<HTMLElement>(`:scope > .pamphlet-column-${colIdx}`);
            if (col) {
                col.querySelector(":scope > .pamphlet-add-item-button")?.remove();
                col.appendChild(createAddItemButton(colIdx));
            }
            return;
        }
        colIdx++;
        filled = 0;
    }
}

function placeFooterAddButton(footer: HTMLElement): void {
    footer.querySelector(":scope > .pamphlet-add-item-button")?.remove();

    let filledMm = 0;
    const items = footer.querySelectorAll<HTMLElement>(":scope > .pamphlet-item");
    items.forEach((item) => {
        const spacer = item.nextElementSibling?.classList.contains("pamphlet-item-spacer")
            ? (item.nextElementSibling as HTMLElement)
            : null;
        filledMm += measureBlockMm(item, spacer);
    });

    const { newItemMm, buttonMm } = measureAddControlsMm(footer);
    // Empty footer: only the + needs to fit; otherwise require room for item + button
    const fits =
        filledMm === 0
            ? buttonMm <= pageFooterHeightMm
            : filledMm + newItemMm + buttonMm <= pageFooterHeightMm;
    if (fits) {
        footer.appendChild(createAddItemButton(FOOTER_COLUMN));
    }
}

function reflowAndReport(container: HTMLElement) {
    const items = Array.from(
        container.querySelectorAll<HTMLElement>(
            ":scope > .dumb-column[class*='pamphlet-column-'] > .pamphlet-item",
        ),
    );
    container.innerHTML = "";

    const report = {
        config: {
            page2ColHeightMm: columnContentHeightMm,
            page1RightColHeightMm, // cols 1–2: −header −gutter
            page1LeftColHeightMm, // cols 7–8: −footer gutter −footer
            columnWidth: "60.35mm",
            pxToMmFactor: 25.4 / 96,
        },
        columns: [] as {
            columnIndex: number;
            itemCount: number;
            filledHeightMm: number;
            maxHeightMm: number;
            remainingSpaceMm: number;
        }[],
        itemTrace: [] as {
            globalIndex: number;
            column: number;
            itemPx: number;
            itemMm: number;
            spacerPx: number;
            spacerMm: number;
            blockMm: number;
            filledBeforeMm: number;
            filledAfterMm: number;
            maxColHeightMm: number;
            overflowed: boolean;
            preview: string;
        }[],
        totalItemsProcessed: items.length,
    };

    function createAndAppendColumn() {
        const index = container.querySelectorAll(
            ":scope > .dumb-column[class*='pamphlet-column-']",
        ).length + 1;
        const col = document.createElement("div");
        col.className = `dumb-column pamphlet-column-${index}`;
        container.appendChild(col);
        return col;
    }

    function pushColumnSummary(index: number, itemCount: number, filledMm: number): void {
        const maxHeightMm = maxHeightForColumn(index);
        report.columns.push({
            columnIndex: index,
            itemCount,
            filledHeightMm: Number(filledMm.toFixed(2)),
            maxHeightMm,
            remainingSpaceMm: Number((maxHeightMm - filledMm).toFixed(2)),
        });
    }

    let currentColumnDiv = createAndAppendColumn();
    let currentColumnFilledMm = 0;
    let currentColumnItemsCount = 0;
    let columnIndex = 1;

    items.forEach((item, globalIndex) => {
        // Drop a stale spacer if this item was still paired in the previous layout
        const staleSpacer = item.nextElementSibling;
        if (staleSpacer?.classList.contains("pamphlet-item-spacer")) {
            staleSpacer.remove();
        }

        const spacer = createItemSpacer();
        currentColumnDiv.appendChild(item);
        currentColumnDiv.appendChild(spacer);

        const itemPx = item.getBoundingClientRect().height;
        const spacerPx = spacer.getBoundingClientRect().height;
        const itemMm = convertPixelsToMillimeters(itemPx);
        const spacerMm = convertPixelsToMillimeters(spacerPx);
        const blockMm = itemMm + spacerMm;
        const filledBeforeMm = currentColumnFilledMm;
        const currentMaxMm = maxHeightForColumn(columnIndex);
        const wouldOverflow =
            currentColumnFilledMm + blockMm > currentMaxMm && currentColumnItemsCount > 0;
        const preview = (item.textContent ?? "").trim().slice(0, 48);

        if (wouldOverflow) {
            pushColumnSummary(columnIndex, currentColumnItemsCount, currentColumnFilledMm);

            columnIndex++;
            currentColumnDiv = createAndAppendColumn();
            currentColumnDiv.appendChild(item);
            currentColumnDiv.appendChild(spacer);

            currentColumnFilledMm = blockMm;
            currentColumnItemsCount = 1;
        } else {
            currentColumnFilledMm += blockMm;
            currentColumnItemsCount++;
        }

        const appliedMaxMm = maxHeightForColumn(columnIndex);
        const entry = {
            globalIndex,
            column: columnIndex,
            itemPx: Number(itemPx.toFixed(2)),
            itemMm: Number(itemMm.toFixed(3)),
            spacerPx: Number(spacerPx.toFixed(2)),
            spacerMm: Number(spacerMm.toFixed(3)),
            blockMm: Number(blockMm.toFixed(3)),
            filledBeforeMm: Number(filledBeforeMm.toFixed(3)),
            filledAfterMm: Number(currentColumnFilledMm.toFixed(3)),
            maxColHeightMm: appliedMaxMm,
            overflowed: wouldOverflow,
            preview,
        };
        report.itemTrace.push(entry);

        if (columnIndex === 1 || wouldOverflow) {
            console.log(`[reflow] col ${columnIndex} item#${globalIndex}`, {
                ...entry,
                sumCheck: `${filledBeforeMm.toFixed(2)} + ${blockMm.toFixed(2)} = ${(filledBeforeMm + blockMm).toFixed(2)} vs max ${wouldOverflow ? currentMaxMm : appliedMaxMm}`,
            });
        }
    });

    if (currentColumnItemsCount > 0) {
        pushColumnSummary(columnIndex, currentColumnItemsCount, currentColumnFilledMm);
    }

    while (
        container.querySelectorAll(":scope > .dumb-column[class*='pamphlet-column-']").length < 8
    ) {
        createAndAppendColumn();
    }

    const filledByColumn = new Map<number, number>();
    for (const col of report.columns) {
        filledByColumn.set(col.columnIndex, col.filledHeightMm);
    }
    const lastFilledColumn =
        report.columns.filter((c) => c.itemCount > 0).at(-1)?.columnIndex ?? 1;
    placeColumnAddButton(container, filledByColumn, lastFilledColumn);

    if (currentDoc) {
        renderPageChrome(container, currentDoc);
        const footer = container.querySelector<HTMLElement>(":scope > .pamphlet-page-footer");
        if (footer) {
            placeFooterAddButton(footer);
        }
    }

    console.log("--- Auto-Reflow Layout Report ---");
    console.log(report);

    // After chrome/grid resolve, compare accumulated fill vs real column box (esp. col 1)
    requestAnimationFrame(() => {
        const cols = Array.from(
            container.querySelectorAll<HTMLElement>(
                ":scope > .dumb-column[class*='pamphlet-column-']",
            ),
        );

        console.log("[reflow] per-column max heights", {
            cols1_2: page1RightColHeightMm,
            cols3_6: columnContentHeightMm,
            cols7_8: page1LeftColHeightMm,
        });

        for (const col of cols) {
            const match = /pamphlet-column-(\d+)/.exec(col.className);
            const index = match ? Number(match[1]) : -1;
            const boxPx = col.getBoundingClientRect().height;
            const boxMm = convertPixelsToMillimeters(boxPx);
            const summary = report.columns.find((c) => c.columnIndex === index);
            const reflowMaxMm = maxHeightForColumn(index);
            const row = {
                columnIndex: index,
                domHeightPx: Number(boxPx.toFixed(2)),
                domHeightMm: Number(boxMm.toFixed(2)),
                filledHeightMm: summary?.filledHeightMm ?? 0,
                itemCount: summary?.itemCount ?? 0,
                reflowMaxMm,
                overflowVsDomMm: Number(((summary?.filledHeightMm ?? 0) - boxMm).toFixed(2)),
                overflowVsReflowMaxMm: Number(
                    ((summary?.filledHeightMm ?? 0) - reflowMaxMm).toFixed(2),
                ),
            };
            if (index === 1) {
                console.warn("[reflow] column 1 height check", row);
            } else {
                console.log("[reflow] column height check", row);
            }
        }
    });
}

function clickInner(target: HTMLElement | undefined): void {
    if (!target) return;
    const inner = target.firstElementChild as HTMLElement | null;
    if (!inner) return;
    suppressEditOpenSave = true;
    requestAnimationFrame(() => {
        inner.click();
        suppressEditOpenSave = false;
    });
}

function activateEditAt(data: PamphletStructure, loc: LastEditedElement): void {
    if (loc.column === HEADER_COLUMN) {
        const field = HEADER_FIELD_KEYS[Math.min(Math.max(loc.index, 0), HEADER_FIELD_KEYS.length - 1)];
        const item = main.querySelector<HTMLElement>(
            `:scope > .pamphlet-page-header .pamphlet-item[data-header-field="${field}"]`,
        );
        if (item) clickInner(item);
        return;
    }

    if (loc.column === FOOTER_COLUMN) {
        const items = Array.from(
            main.querySelectorAll<HTMLElement>(":scope > .pamphlet-page-footer > .pamphlet-item"),
        );
        if (items.length === 0) return;
        clickInner(items[Math.min(Math.max(loc.index, 0), items.length - 1)]);
        return;
    }

    const region = getRegionItems(data, loc.column);
    if (region.length === 0) return;

    const flat = getFlatIndex(data, loc);
    const items = Array.from(
        main.querySelectorAll<HTMLElement>(
            ":scope > .dumb-column[class*='pamphlet-column-'] > .pamphlet-item",
        ),
    );
    if (items.length === 0) return;
    clickInner(items[Math.min(Math.max(flat, 0), items.length - 1)]);
}

function renderDocument(data: PamphletStructure, openEdit: boolean): void {
    currentDoc = data;
    currentHeader = { ...data.header };
    renderFromPamphlet(main, data);
    reflowAndReport(main);
    if (openEdit) {
        activateEditAt(data, data.last_edited_element);
    }
}

async function commitDocument(data: PamphletStructure, openEdit: boolean): Promise<void> {
    if (!hasOpenFile()) {
        setError("No pamphlet file is open. Open or create a file first.");
        return;
    }

    try {
        await savePamphlet(data);
        renderDocument(data, openEdit);
        setStatus(`Saved: ${getOpenFileName()}`, "success");
        clearError();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Save failed: ${message}`);
    }
}

function pushUndoSnapshot(): void {
    if (currentDoc) {
        undoSnapshot = clonePamphlet(currentDoc);
    }
}

function snapshotFromDom(lastEdited: LastEditedElement): PamphletStructure | null {
    if (!currentDoc) return null;
    return serializePamphlet(main, lastEdited);
}

function locationFromContainer(container: HTMLElement): LastEditedElement | null {
    return getItemLocation(container);
}

function syncContentIntoDoc(
    container: HTMLElement,
    data: PamphletStructure,
): LastEditedElement | null {
    const loc = locationFromContainer(container);
    if (!loc) return null;

    if (loc.column === HEADER_COLUMN) {
        syncItemContentFromTextarea(container);
        const tray = container.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
        const content = tray?.value ?? "";
        const field = container.getAttribute("data-header-field") as HeaderFieldKey | null;
        if (field && HEADER_FIELD_KEYS.includes(field)) {
            data.header[field] = content;
        }
        return loc;
    }

    const resolved = resolveLocation(data, loc);
    if (!resolved) return null;

    if (isImageItem(container)) {
        const image = syncImageItemFromDom(container);
        if (!image) return null;
        updateItemContent(data, resolved, image.content);
        updateItemHeightMm(data, resolved, image.heightMm);
        return resolved;
    }

    syncItemContentFromTextarea(container);
    const tray = container.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
    const content = tray?.value ?? "";
    updateItemContent(data, resolved, content);
    return resolved;
}

function openItemTypeModal(insert: PendingInsert): void {
    pendingInsert = insert;
    if (!itemTypeModal.open) {
        itemTypeModal.showModal();
    }
}

function closeItemTypeModal(): void {
    pendingInsert = null;
    if (itemTypeModal.open) {
        itemTypeModal.close();
    }
}

async function confirmItemType(type: PamphletItemType): Promise<void> {
    if (!currentDoc || !hasOpenFile() || !pendingInsert) {
        closeItemTypeModal();
        return;
    }

    const insert = pendingInsert;
    pendingInsert = null;
    if (itemTypeModal.open) itemTypeModal.close();

    const base = serializePamphlet(main, currentDoc.last_edited_element);
    const item = createTypedItem(type);
    let focus: LastEditedElement;

    if (insert.mode === "end") {
        focus = appendItem(base, insert.column, item);
    } else {
        focus = insertItem(
            base,
            { column: insert.column, index: insert.index },
            item,
            insert.where,
        );
    }

    base.last_edited_element = focus;
    pushUndoSnapshot();
    await commitDocument(base, true);
}

async function handleAddItemButton(column: number): Promise<void> {
    if (!currentDoc || !hasOpenFile()) {
        setError("No pamphlet file is open.");
        return;
    }
    if (column !== FOOTER_COLUMN && (column < 1 || column > 8)) return;
    openItemTypeModal({ mode: "end", column });
}

async function handleTrayAction(detail: PamphletTrayAction): Promise<void> {
    if (!currentDoc || !currentHeader) {
        setError("No pamphlet file is open.");
        return;
    }

    if (detail.action === "edit-open") {
        if (suppressEditOpenSave) return;
        const loc = locationFromContainer(detail.container);
        if (!loc) return;
        const next = snapshotFromDom(loc);
        if (!next) return;
        currentDoc = next;
        currentHeader = { ...next.header };
        try {
            await savePamphlet(next);
            setStatus(`Saved: ${getOpenFileName()}`, "success");
            clearError();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Save failed: ${message}`);
        }
        return;
    }

    if (detail.action === "undo") {
        if (isHeaderItem(detail.container)) return;
        if (!undoSnapshot) {
            setError("Nothing to undo.");
            return;
        }
        const restored = clonePamphlet(undoSnapshot);
        undoSnapshot = currentDoc ? clonePamphlet(currentDoc) : null;
        await commitDocument(restored, true);
        return;
    }

    const base = snapshotFromDom(currentDoc.last_edited_element);
    if (!base) return;

    const loc = syncContentIntoDoc(detail.container, base);
    if (!loc) return;

    // Header: only close updates JSON (undo is local in the tray)
    if (loc.column === HEADER_COLUMN) {
        if (detail.action !== "close") return;
        base.last_edited_element = loc;
        currentHeader = { ...base.header };
        pushUndoSnapshot();
        await commitDocument(base, false);
        return;
    }

    let nextDoc: PamphletStructure | null = null;
    let openEdit = true;

    switch (detail.action) {
        case "close": {
            base.last_edited_element = loc;
            nextDoc = base;
            openEdit = false;
            break;
        }
        case "move-up": {
            const nextLoc = moveItemUp(base, loc);
            if (!nextLoc) return;
            base.last_edited_element = nextLoc;
            nextDoc = base;
            break;
        }
        case "move-down": {
            const nextLoc = moveItemDown(base, loc);
            if (!nextLoc) return;
            base.last_edited_element = nextLoc;
            nextDoc = base;
            break;
        }
        case "add-above": {
            // Keep current tray/DOM; insert after type is chosen (avoids reflow shifting indexes)
            base.last_edited_element = loc;
            currentDoc = base;
            currentHeader = { ...base.header };
            openItemTypeModal({
                mode: "relative",
                column: loc.column,
                index: loc.index,
                where: "above",
            });
            return;
        }
        case "add-below": {
            base.last_edited_element = loc;
            currentDoc = base;
            currentHeader = { ...base.header };
            openItemTypeModal({
                mode: "relative",
                column: loc.column,
                index: loc.index,
                where: "below",
            });
            return;
        }
        case "bold": {
            if (isImageItem(detail.container)) return;
            applyBoldRange(base, loc, detail.start, detail.end);
            base.last_edited_element = loc;
            nextDoc = base;
            break;
        }
        case "delete": {
            const confirmed = window.confirm("¿Seguro que quieres borrar este elemento?");
            if (!confirmed) return;
            const { focus } = deleteItem(base, loc);
            base.last_edited_element = focus;
            nextDoc = base;
            break;
        }
    }

    if (!nextDoc) return;
    pushUndoSnapshot();
    await commitDocument(nextDoc, openEdit);
}

function loadPamphlet(data: PamphletStructure): void {
    undoSnapshot = null;
    renderDocument(data, false);
    setStatus(`Open: ${getOpenFileName()}`, "success");
    clearError();
    updatePrintAvailability();
}

on(main, "click", (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const btn = target?.closest<HTMLButtonElement>(".pamphlet-add-item-button");
    if (!btn || !main.contains(btn)) return;
    const column = Number(btn.dataset.addColumn);
    if (!Number.isFinite(column)) return;
    event.preventDefault();
    void handleAddItemButton(column);
});

on(main, "pamphlet-tray-action", (event: Event) => {
    const custom = event as CustomEvent<PamphletTrayAction>;
    void handleTrayAction(custom.detail);
});

on(menuBtn, "click", () => {
    toggleSidebar();
});

on(sidebarBackdrop, "click", () => {
    closeSidebar();
});

on(openBtn, "click", async () => {
    closeSidebar();
    clearError();
    try {
        const data = await openPamphletFile();
        loadPamphlet(data);
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Open failed: ${message}`);
    }
});

function openCreateModal(): void {
    clearError();
    createForm.reset();
    createModal.showModal();
    modalTitle.focus();
}

function closeCreateModal(): void {
    if (createModal.open) createModal.close();
}

on(createBtn, "click", () => {
    closeSidebar();
    openCreateModal();
});

on(modalCancelBtn, "click", () => {
    closeCreateModal();
});

on(createForm, "submit", async (event) => {
    event.preventDefault();
    clearError();

    const title = modalTitle.value.trim();
    const series = modalSeries.value.trim();
    const series_chapter = modalChapter.value.trim();
    const author = modalAuthor.value.trim();

    if (!title || !series || !series_chapter || !author) {
        setError("Completa título, serie, capítulo y autor.");
        return;
    }

    try {
        const data = await createPamphletFile({
            title,
            series,
            series_chapter,
            author,
        });
        closeCreateModal();
        loadPamphlet(data);
        openItemTypeModal({ mode: "end", column: 1 });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Create failed: ${message}`);
    }
});

itemTypeModal.querySelectorAll<HTMLButtonElement>("[data-item-type]").forEach((btn) => {
    on(btn, "click", () => {
        const type = btn.dataset.itemType as PamphletItemType | undefined;
        if (type !== "paragraph" && type !== "heading_1" && type !== "image") return;
        void confirmItemType(type);
    });
});

on(itemTypeCancelBtn, "click", () => {
    closeItemTypeModal();
});

on(itemTypeModal, "cancel", () => {
    pendingInsert = null;
});

on(printBtn, "click", () => {
    if (printBtn.disabled) return;
    closeSidebar();
    window.print();
});

updatePrintAvailability();
syncFixedChromeScale();
on(window, "resize", syncFixedChromeScale);
if (window.visualViewport) {
    on(window.visualViewport, "resize", syncFixedChromeScale);
    on(window.visualViewport, "scroll", syncFixedChromeScale);
}

if (!isFileSystemAccessSupported()) {
        setError("File System Access API is not supported. Use Chrome or Edge.");
        openBtn.disabled = true;
        createBtn.disabled = true;
    } else {
        setStatus("No file open — open an existing .epam or create a new one.");
    }

    return {
        destroy() {
            for (const dispose of disposers) dispose();
            disposers.length = 0;
            host.replaceChildren();
        },
    };
}
