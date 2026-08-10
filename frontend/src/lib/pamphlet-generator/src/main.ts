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
    clearOpenFile,
    getOpenFileName,
    hasOpenFile,
    isFileSystemAccessSupported,
    openPamphletFile,
    savePamphlet,
    setOpenFileName,
} from "./pamphlet_file";
import { fetchEpam, fetchEpams, saveEpamToCloud } from "../../epams";
import { getAuthToken, isAuthenticated } from "../../auth";
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
    createEmptyPamphlet,
    type CreatePamphletMeta,
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
    const saveCloudBtn = requireElement<HTMLButtonElement>("#btn-save-cloud");
    const printBtn = requireElement<HTMLButtonElement>("#btn-print");
    const viewDesktopBtn = requireElement<HTMLButtonElement>("#btn-view-desktop");
    const viewMobileBtn = requireElement<HTMLButtonElement>("#btn-view-mobile");
    const menuBtn = requireElement<HTMLButtonElement>("#btn-menu");
    const sidebar = requireElement<HTMLElement>("#app-sidebar");
    const sidebarBackdrop = requireElement<HTMLElement>("#sidebar-backdrop");
    const createModal = requireElement<HTMLDialogElement>("#create-modal");
    const createSaveModal = requireElement<HTMLDialogElement>("#create-save-modal");
    const createSaveLocalBtn = requireElement<HTMLButtonElement>("#create-save-local");
    const createSaveCloudBtn = requireElement<HTMLButtonElement>("#create-save-cloud");
    const createSaveCloudHint = requireElement<HTMLElement>("#create-save-cloud-hint");
    const createSaveCancelBtn = requireElement<HTMLButtonElement>("#create-save-cancel");
    const openSourceModal = requireElement<HTMLDialogElement>("#open-source-modal");
    const openSourceLocalBtn = requireElement<HTMLButtonElement>("#open-source-local");
    const openSourceCloudBtn = requireElement<HTMLButtonElement>("#open-source-cloud");
    const openSourceCancelBtn = requireElement<HTMLButtonElement>("#open-source-cancel");
    const openCloudModal = requireElement<HTMLDialogElement>("#open-cloud-modal");
    const openCloudList = requireElement<HTMLElement>("#open-cloud-list");
    const openCloudHint = requireElement<HTMLElement>("#open-cloud-hint");
    const openCloudCancelBtn = requireElement<HTMLButtonElement>("#open-cloud-cancel");
    const createForm = requireElement<HTMLFormElement>("#create-form");
    const modalCancelBtn = requireElement<HTMLButtonElement>("#modal-cancel");
    const modalTitle = requireElement<HTMLInputElement>("#modal-title");
    const modalSeries = requireElement<HTMLInputElement>("#modal-series");
    const modalChapter = requireElement<HTMLInputElement>("#modal-chapter");
    const modalAuthor = requireElement<HTMLInputElement>("#modal-author");
    const itemTypeModal = requireElement<HTMLDialogElement>("#item-type-modal");
    const itemTypeCancelBtn = requireElement<HTMLButtonElement>("#item-type-cancel");
    const fileToolbar = requireElement<HTMLElement>("#file-toolbar");

    // Escape .pamphlet-app { isolation: isolate } so fixed chrome can sit above the site header
    document.body.append(fileToolbar, sidebarBackdrop, sidebar);

    type ViewMode = "desktop" | "mobile";
    /** Narrow / phone viewports start in stacked mobile layout (letter sheet is desktop-only). */
    const mobileViewportMq = window.matchMedia("(max-width: 900px)");
    function preferredViewMode(): ViewMode {
        return mobileViewportMq.matches ? "mobile" : "desktop";
    }
    let viewMode: ViewMode = preferredViewMode();
    appRoot.setAttribute("data-view-mode", viewMode);
    appRoot.style.setProperty("--mobile-view-scale", "1");
    appRoot.style.setProperty("--mobile-inv-scale", "1");

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

/** Body column width in mm — never wider than print; scale down only if viewport is narrower. */
const mobileColumnWidthMm = 60.35;

function syncMobileViewScale(): void {
    if (viewMode !== "mobile") {
        appRoot.style.setProperty("--mobile-view-scale", "1");
        appRoot.style.setProperty("--mobile-inv-scale", "1");
        main.style.marginBottom = "";
        return;
    }
    const padPx = 16;
    const fallbackRefPx = mobileColumnWidthMm * (96 / 25.4);
    const refPx = Math.max(1, main.offsetWidth || fallbackRefPx);
    const viewportW = window.visualViewport?.width ?? window.innerWidth;
    const available = Math.max(120, viewportW - padPx * 2);
    // Cap at 1 so columns stay at pamphlet mm width and sit centered with side margins.
    const scale = Math.min(1, available / refPx);
    appRoot.style.setProperty("--mobile-view-scale", String(scale));
    appRoot.style.setProperty("--mobile-inv-scale", String(scale > 0 ? 1 / scale : 1));
    requestAnimationFrame(() => {
        const layoutHeight = main.offsetHeight;
        if (layoutHeight > 0 && scale !== 1) {
            const visualHeight = layoutHeight * scale;
            main.style.marginBottom = `${visualHeight - layoutHeight}px`;
        } else {
            main.style.marginBottom = "";
        }
    });
}

function applyViewMode(mode: ViewMode, options?: { closeSidebar?: boolean }): void {
    viewMode = mode;
    appRoot.setAttribute("data-view-mode", mode);
    viewDesktopBtn.classList.toggle("is-active", mode === "desktop");
    viewMobileBtn.classList.toggle("is-active", mode === "mobile");
    viewDesktopBtn.setAttribute("aria-pressed", mode === "desktop" ? "true" : "false");
    viewMobileBtn.setAttribute("aria-pressed", mode === "mobile" ? "true" : "false");
    syncMobileViewScale();
    if (options?.closeSidebar !== false) {
        closeSidebar();
    }
}

function setViewMode(mode: ViewMode): void {
    applyViewMode(mode, { closeSidebar: true });
}

/** While printing, force desktop letter layout even if the screen is in mobile view. */
let viewModeBeforePrint: ViewMode | null = null;

function beginPrintDesktopLayout(): void {
    if (viewModeBeforePrint !== null) return;
    viewModeBeforePrint = viewMode;
    if (viewMode === "mobile") {
        applyViewMode("desktop", { closeSidebar: false });
        void main.offsetHeight;
    }
}

function endPrintDesktopLayout(): void {
    if (viewModeBeforePrint === null) return;
    const restore = viewModeBeforePrint;
    viewModeBeforePrint = null;
    if (restore === "mobile") {
        applyViewMode("mobile", { closeSidebar: false });
    }
}

function waitForNextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });
}

async function printDocument(): Promise<void> {
    if (printBtn.disabled) return;
    closeSidebar();
    beginPrintDesktopLayout();
    await waitForNextPaint();
    window.print();
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
/** When set, edits can persist to DynamoDB/S3 without a local FileSystem handle. */
let cloudEpamId: string | null = null;

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
        duration: kind === "error" ? 20000 : 3200,
        gravity: "top",
        position: "left",
        stopOnFocus: true,
        close: true,
        className: `app-toast app-toast--${kind}`,
    }).showToast();
    if (kind === "error") {
        console.error("[pamphlet]", message);
    }
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
    syncMobileViewScale();
    if (openEdit) {
        activateEditAt(data, data.last_edited_element);
    }
}

function hasEditableSession(): boolean {
    return hasOpenFile() || cloudEpamId !== null;
}

function ensureDocumentId(data: PamphletStructure): PamphletStructure {
    if (data.id?.trim()) return data;
    return { ...data, id: crypto.randomUUID() };
}

async function persistCloud(data: PamphletStructure): Promise<PamphletStructure> {
    const withId = ensureDocumentId(data);
    const saved = await saveEpamToCloud({
        // Only pass epamId for updates of an already-linked cloud doc.
        // New creates POST to /api/epams with the document id in the body.
        epamId: cloudEpamId || undefined,
        fileName: getOpenFileName() || undefined,
        document: withId,
    });
    cloudEpamId = saved.meta.epamId;
    setOpenFileName(saved.meta.fileName);
    return saved.document;
}

async function commitDocument(data: PamphletStructure, openEdit: boolean): Promise<void> {
    if (!hasEditableSession()) {
        setError("No pamphlet file is open. Open or create a file first.");
        return;
    }

    try {
        let next = ensureDocumentId(data);
        if (hasOpenFile()) {
            await savePamphlet(next);
        }
        if (cloudEpamId || (!hasOpenFile() && isAuthenticated())) {
            // Cloud-only sessions always sync; local sessions sync when already linked to cloud.
            if (cloudEpamId || !hasOpenFile()) {
                next = await persistCloud(next);
            }
        }
        renderDocument(next, openEdit);
        const label = getOpenFileName() || cloudEpamId || "document";
        setStatus(`Saved: ${label}`, "success");
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
    return serializePamphlet(main, lastEdited, currentDoc);
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

    const base = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
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

on(openBtn, "click", () => {
    closeSidebar();
    clearError();
    openSourceModal.showModal();
});

function closeOpenSourceModal(): void {
    if (openSourceModal.open) openSourceModal.close();
}

function closeOpenCloudModal(): void {
    if (openCloudModal.open) openCloudModal.close();
}

on(openSourceCancelBtn, "click", () => {
    closeOpenSourceModal();
});

on(openSourceLocalBtn, "click", async () => {
    closeOpenSourceModal();
    clearError();
    try {
        const data = await openPamphletFile();
        cloudEpamId = data.id?.trim() || null;
        loadPamphlet(data);
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Open failed: ${message}`);
    }
});

on(openSourceCloudBtn, "click", async () => {
    closeOpenSourceModal();
    clearError();
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Inicia sesión para abrir desde la nube.");
        return;
    }
    openCloudHint.textContent = "Cargando…";
    openCloudList.replaceChildren();
    openCloudModal.showModal();
    try {
        const { epams } = await fetchEpams();
        openCloudList.replaceChildren();
        if (epams.length === 0) {
            openCloudHint.textContent = "No hay panfletos en la nube para esta cuenta.";
            const empty = document.createElement("p");
            empty.className = "open-cloud-list__empty";
            empty.textContent = "Guarda un panfleto con “Guardar en la nube”.";
            openCloudList.appendChild(empty);
            return;
        }
        openCloudHint.textContent = "Selecciona un .epam asociado a tu cuenta.";
        for (const item of epams) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "open-cloud-list__item";
            btn.setAttribute("role", "listitem");
            const title = document.createElement("span");
            title.className = "open-cloud-list__title";
            title.textContent = item.title || item.fileName;
            const meta = document.createElement("span");
            meta.className = "open-cloud-list__meta";
            meta.textContent = `${item.fileName} · ${item.series} ch.${item.seriesChapter} · ${item.updatedAt.slice(0, 10)}`;
            btn.append(title, meta);
            btn.addEventListener("click", () => {
                void (async () => {
                    try {
                        const loaded = await fetchEpam(item.epamId);
                        clearOpenFile();
                        cloudEpamId = loaded.meta.epamId;
                        setOpenFileName(loaded.meta.fileName);
                        loadPamphlet(loaded.document);
                        closeOpenCloudModal();
                        setStatus(`Opened from cloud: ${loaded.meta.fileName}`, "success");
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        setError(`Cloud open failed: ${message}`);
                    }
                })();
            });
            openCloudList.appendChild(btn);
        }
    } catch (err) {
        closeOpenCloudModal();
        const message = err instanceof Error ? err.message : String(err);
        setError(`Cloud list failed: ${message}`);
    }
});

on(openCloudCancelBtn, "click", () => {
    closeOpenCloudModal();
});

on(saveCloudBtn, "click", async () => {
    closeSidebar();
    clearError();
    if (!currentDoc) {
        setError("No hay panfleto abierto para guardar.");
        return;
    }
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Inicia sesión para guardar en la nube.");
        return;
    }
    try {
        const live = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
        const savedDoc = await persistCloud({ ...live });
        renderDocument(savedDoc, false);
        setStatus(`Saved to cloud: ${getOpenFileName() || cloudEpamId}`, "success");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Cloud save failed: ${message}`);
    }
});

/** Pending meta after create form validation, before local/cloud destination. */
let pendingCreateMeta: CreatePamphletMeta | null = null;

function openCreateModal(): void {
    clearError();
    createForm.reset();
    pendingCreateMeta = null;
    createModal.showModal();
    modalTitle.focus();
}

function closeCreateModal(): void {
    if (createModal.open) createModal.close();
}

function closeCreateSaveModal(): void {
    if (createSaveModal.open) createSaveModal.close();
}

function openCreateSaveModal(): void {
    const loggedIn = Boolean(getAuthToken() && isAuthenticated());
    createSaveCloudBtn.disabled = !loggedIn;
    createSaveCloudHint.hidden = loggedIn;
    createSaveModal.showModal();
}

on(createBtn, "click", () => {
    closeSidebar();
    openCreateModal();
});

on(modalCancelBtn, "click", () => {
    closeCreateModal();
});

on(createForm, "submit", (event) => {
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

    pendingCreateMeta = { title, series, series_chapter, author };
    closeCreateModal();
    openCreateSaveModal();
});

on(createSaveCancelBtn, "click", () => {
    pendingCreateMeta = null;
    closeCreateSaveModal();
});

on(createSaveLocalBtn, "click", async () => {
    const meta = pendingCreateMeta;
    if (!meta) return;
    clearError();
    try {
        const data = await createPamphletFile(meta);
        pendingCreateMeta = null;
        cloudEpamId = null;
        closeCreateSaveModal();
        loadPamphlet(data);
        openItemTypeModal({ mode: "end", column: 1 });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(`Create failed: ${message}`);
    }
});

on(createSaveCloudBtn, "click", async () => {
    const meta = pendingCreateMeta;
    if (!meta) return;
    clearError();
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Inicia sesión para guardar en la nube.");
        return;
    }
    try {
        clearOpenFile();
        cloudEpamId = null;
        const blank = createEmptyPamphlet(meta);
        setOpenFileName(
            `${meta.series.trim().replace(/[^\w.-]+/g, "_") || "pamphlet"}_ch${meta.series_chapter.trim().replace(/[^\w.-]+/g, "_") || "1"}.epam`,
        );
        const savedDoc = await persistCloud(blank);
        pendingCreateMeta = null;
        closeCreateSaveModal();
        loadPamphlet(savedDoc);
        openItemTypeModal({ mode: "end", column: 1 });
        setStatus(`Saved to cloud: ${getOpenFileName() || cloudEpamId}`, "success");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Cloud create failed: ${message}`);
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
    void printDocument();
});

on(window, "beforeprint", () => {
    beginPrintDesktopLayout();
});

on(window, "afterprint", () => {
    endPrintDesktopLayout();
});

const printMediaQuery = window.matchMedia("print");
function onPrintMediaChange(event: MediaQueryListEvent): void {
    if (event.matches) {
        beginPrintDesktopLayout();
    } else {
        endPrintDesktopLayout();
    }
}
if (typeof printMediaQuery.addEventListener === "function") {
    printMediaQuery.addEventListener("change", onPrintMediaChange);
    disposers.push(() => printMediaQuery.removeEventListener("change", onPrintMediaChange));
} else {
    // Safari < 14
    printMediaQuery.addListener(onPrintMediaChange);
    disposers.push(() => printMediaQuery.removeListener(onPrintMediaChange));
}

on(viewDesktopBtn, "click", () => {
    setViewMode("desktop");
});

on(viewMobileBtn, "click", () => {
    setViewMode("mobile");
});

updatePrintAvailability();
syncFixedChromeScale();
applyViewMode(viewMode, { closeSidebar: false });
on(window, "resize", () => {
    syncFixedChromeScale();
    syncMobileViewScale();
});
if (window.visualViewport) {
    on(window.visualViewport, "resize", () => {
        syncFixedChromeScale();
        syncMobileViewScale();
    });
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
            fileToolbar.remove();
            sidebarBackdrop.remove();
            sidebar.remove();
            host.replaceChildren();
        },
    };
}
