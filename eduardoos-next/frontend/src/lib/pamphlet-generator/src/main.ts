import "./style.css";
import "../../../components/HeaderDynamicMenu/HeaderDynamicMenu.css";
import { renderShell } from "./shell";

/** Must match HeaderDynamicMenu host id (Header always renders this empty slot). */
const HEADER_DYNAMIC_MENU_HOST_ID = "header-dynamic-menu-host";

declare global {
    interface Window {
        __eduardoosHeaderDynamicMenu?: HTMLElement | null;
    }
}
import type { PamphletTrayAction } from "./create_element";
import { normalizeImageDataUrlToJpeg } from "./create_element";
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
    updateItemStyleIndexes,
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
import { fetchEpam, fetchEpams, fetchEpamSeriesTree, saveEpamToCloud } from "../../epams";
import { getAuthToken, isAuthenticated } from "../../auth";
import { DOCUMENT_ROUTES } from "../../../config/routes";
import { createCorrelationId } from "../../telemetry";
import { openApiErrorModal } from "../../../components/ServerErrorModal/ServerErrorModal";
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
    appRoot.innerHTML = renderShell();
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
    const seriesBtn = requireElement<HTMLButtonElement>("#btn-series");
    const trayToggleBtn = requireElement<HTMLButtonElement>("#btn-activity-expand");
    const activityTray = requireElement<HTMLElement>("#pamphlet-header-menu-tray");
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
    const seriesModal = requireElement<HTMLDialogElement>("#series-modal");
    const seriesForm = requireElement<HTMLFormElement>("#series-form");
    const seriesModalSeries = requireElement<HTMLInputElement>("#series-modal-series");
    const seriesModalChapter = requireElement<HTMLInputElement>("#series-modal-chapter");
    const seriesTreeEl = requireElement<HTMLElement>("#series-tree");
    const seriesTreeHint = requireElement<HTMLElement>("#series-tree-hint");
    const seriesModalCancelBtn = requireElement<HTMLButtonElement>("#series-modal-cancel");
    const itemTypeModal = requireElement<HTMLDialogElement>("#item-type-modal");
    const itemTypeCancelBtn = requireElement<HTMLButtonElement>("#item-type-cancel");
    const headerMenu = requireElement<HTMLElement>("#pamphlet-header-menu");

    // Mount tools into Header Dynamic Menu host (inside Header rail / mobile bar).
    const menuHost = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    window.__eduardoosHeaderDynamicMenu = headerMenu;
    if (menuHost) {
        menuHost.replaceChildren(headerMenu);
    } else {
        document.body.append(headerMenu);
    }

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
    printBtn.disabled = !hasEditableSession() || !currentDoc;
    syncSeriesButtonVisibility();
}

function setActivityTrayOpen(open: boolean): void {
    headerMenu.classList.toggle("header-dynamic-menu--tray-open", open);
    activityTray.classList.toggle("header-dynamic-menu__tray--open", open);
    activityTray.hidden = !open;
    trayToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    trayToggleBtn.classList.toggle("header-dynamic-menu__tray-toggle--open", open);
}

function closeActivityTray(): void {
    setActivityTrayOpen(false);
}

function toggleActivityTray(): void {
    setActivityTrayOpen(activityTray.hidden);
}

function syncSeriesButtonVisibility(): void {
    const open = hasEditableSession() && currentDoc !== null;
    seriesBtn.hidden = !open;
}

/** Body column width in mm — never wider than print; scale down only if viewport is narrower. */
const mobileColumnWidthMm = 57.85;

function syncMobileViewScale(): void {
    if (viewMode !== "mobile") {
        appRoot.style.setProperty("--mobile-view-scale", "1");
        appRoot.style.setProperty("--mobile-inv-scale", "1");
        if (viewMode !== "desktop") {
            main.style.marginBottom = "";
        }
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
        const boostRaw = getComputedStyle(appRoot).getPropertyValue("--mm-visual-boost").trim();
        const boost = Number(boostRaw);
        const visualScale = scale * (Number.isFinite(boost) && boost > 0 ? boost : 1);
        // Scroll gap only (transform does not change layout box). Not used for column/item mm math.
        if (layoutHeight > 0 && visualScale !== 1) {
            const visualHeight = layoutHeight * visualScale;
            main.style.marginBottom = `${visualHeight - layoutHeight}px`;
        } else {
            main.style.marginBottom = "";
        }
    });
}

function syncDesktopViewScale(): void {
    if (viewMode !== "desktop") {
        appRoot.style.setProperty("--desktop-view-scale", "1");
        return;
    }
    const layoutW = main.offsetWidth;
    const layoutH = main.offsetHeight;
    const viewportW = window.visualViewport?.width ?? window.innerWidth;
    const pad = 32;
    const available = Math.max(280, viewportW - pad);
    const scale = layoutW > 0 ? available / layoutW : 1;
    appRoot.style.setProperty("--desktop-view-scale", String(scale));
    if (layoutH > 0 && scale !== 1) {
        main.style.marginBottom = `${layoutH * scale - layoutH}px`;
    } else {
        main.style.marginBottom = "";
    }
}

function syncSheetScale(): void {
    syncMobileViewScale();
    syncDesktopViewScale();
}

function applyViewMode(mode: ViewMode, options?: { closeTray?: boolean }): void {
    viewMode = mode;
    appRoot.setAttribute("data-view-mode", mode);
    viewDesktopBtn.classList.toggle("is-active", mode === "desktop");
    viewDesktopBtn.classList.toggle("header-dynamic-menu__btn--active", mode === "desktop");
    viewMobileBtn.classList.toggle("is-active", mode === "mobile");
    viewMobileBtn.classList.toggle("header-dynamic-menu__btn--active", mode === "mobile");
    viewDesktopBtn.setAttribute("aria-pressed", mode === "desktop" ? "true" : "false");
    viewMobileBtn.setAttribute("aria-pressed", mode === "mobile" ? "true" : "false");
    syncSheetScale();
    if (options?.closeTray !== false) {
        closeActivityTray();
    }
}

function setViewMode(mode: ViewMode): void {
    applyViewMode(mode, { closeTray: true });
}

/** While printing, force desktop letter layout even if the screen is in mobile view. */
let viewModeBeforePrint: ViewMode | null = null;

function beginPrintDesktopLayout(): void {
    if (viewModeBeforePrint !== null) return;
    viewModeBeforePrint = viewMode;
    if (viewMode === "mobile") {
        applyViewMode("desktop", { closeTray: false });
        void main.offsetHeight;
    }
}

function endPrintDesktopLayout(): void {
    if (viewModeBeforePrint === null) return;
    const restore = viewModeBeforePrint;
    viewModeBeforePrint = null;
    if (restore === "mobile") {
        applyViewMode("mobile", { closeTray: false });
    }
}

function waitForNextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });
}

/** Prefer RFC 5987 filename*=UTF-8''… so accents/ñ survive the download name. */
function filenameFromContentDisposition(header: string): string {
    const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].trim().replace(/^"+|"+$/g, ""));
        } catch {
            /* fall through */
        }
    }
    // Legacy filename= is ASCII-only in our backend; skip mojibake UTF-8 blobs.
    const plain = /filename\s*=\s*"((?:\\.|[^"\\])*)"|filename\s*=\s*([^;]+)/i.exec(header);
    const raw = (plain?.[1] ?? plain?.[2] ?? "").trim();
    if (!raw) return "";
    // If it already looks like mojibake (Â¿ / Ã³), ignore and use the title instead.
    if (/Â.|Ã./.test(raw)) return "";
    return raw.replace(/^UTF-8''/i, "");
}

function sanitizeDownloadFilename(name: string): string {
    const cleaned = name
        .trim()
        .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
        .replace(/^\.+/, "")
        .trim();
    if (!cleaned) return "";
    return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

/** Re-encode every image data URL to JPEG so the Go PDF embedder never sees WebP/AVIF. */
async function ensurePamphletImagesAreJpeg(doc: PamphletStructure): Promise<void> {
    const cols = [
        doc.column_1,
        doc.column_2,
        doc.column_3,
        doc.column_4,
        doc.column_5,
        doc.column_6,
        doc.column_7,
        doc.column_8,
        doc.footer.items,
    ];
    for (const items of cols) {
        for (const item of items) {
            if (item.type !== "image") continue;
            const src = (item.content || "").trim();
            if (!src || !src.startsWith("data:")) continue;
            if (/^data:image\/jpeg/i.test(src) || /^data:image\/jpg/i.test(src)) continue;
            item.content = await normalizeImageDataUrlToJpeg(src);
        }
    }
}

async function printDocument(): Promise<void> {
    if (printBtn.disabled) return;
    if (!currentDoc) {
        setStatus("Abre o crea un panfleto antes de imprimir.", "error");
        return;
    }
    const token = getAuthToken();
    if (!token || !isAuthenticated()) {
        setStatus("Sign in to generate the PDF.", "error");
        return;
    }

    closeActivityTray();

    // Capture pan/zoom/height from the live DOM BEFORE any desktop remount can wipe them.
    const live = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
    await ensurePamphletImagesAreJpeg(live);
    currentDoc = live;
    currentHeader = { ...live.header };

    beginPrintDesktopLayout();
    await waitForNextPaint();

    // Previous browser print path (kept for fallback / local preview):
    // window.print();

    setStatus("Generando PDF…", "info");
    try {
        const res = await fetch(DOCUMENT_ROUTES.pamphletPdf, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Correlation-ID": createCorrelationId(),
            },
            body: JSON.stringify(live),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") || "";
        const fromHeader = filenameFromContentDisposition(cd);
        const fromTitle = sanitizeDownloadFilename(currentDoc.header.title || "");
        const filename = fromHeader || (fromTitle ? `${fromTitle}.pdf` : "panfleto.pdf");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus("PDF descargado.", "success");
    } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo generar el PDF";
        setStatus(message, "error");
    } finally {
        endPrintDesktopLayout();
    }
}

const usLetterHeightInMillimeters = 215.9;
const pageMarginMm = 10;
const pageHeaderHeightMm = 23; // matches --page-header-height / PamphletHeaderHMm
const pageFooterHeightMm = 37.5; // 15mm × 2.5
const colGutterNarrowMm = 4;
/** Gap between page header and cols 1–2 (matches --header-body-gutter). */
const headerBodyGutterMm = 5;
/** Page 2 band / full page-1 chrome band: letter − 2×margin */
const columnContentHeightMm = usLetterHeightInMillimeters - pageMarginMm * 2;
/** Cols 1–2: under page header → discount header + header→body gutter */
const page1RightColHeightMm =
    columnContentHeightMm - pageHeaderHeightMm - headerBodyGutterMm; // 167.9
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
/** In-browser session with no File System Access handle (HTTP staging, unsupported browsers). */
let memorySession = false;

const FSA_HTTPS_HINT =
    "Local device files need HTTPS (or localhost) in Chrome or Edge. You can still create in this browser or use the cloud.";

const LAST_EPAM_STORAGE_KEY = "eduardoos-pamphlet-last-epam-id";

function rememberLastEpamId(epamId: string | null | undefined): void {
    try {
        const id = epamId?.trim() ?? "";
        if (!id) {
            localStorage.removeItem(LAST_EPAM_STORAGE_KEY);
            return;
        }
        localStorage.setItem(LAST_EPAM_STORAGE_KEY, id);
    } catch {
        // Quota / private mode — ignore.
    }
}

function readLastEpamId(): string | null {
    try {
        return localStorage.getItem(LAST_EPAM_STORAGE_KEY)?.trim() || null;
    } catch {
        return null;
    }
}

async function openCloudDocumentById(epamId: string): Promise<void> {
    const loaded = await fetchEpam(epamId);
    const doc = loaded.document as PamphletStructure | undefined;
    if (!doc || typeof doc !== "object" || !(doc as { type?: string }).type) {
        throw new Error(
            "El servidor devolvió un panfleto vacío (sin documento). Suele ser un .epam sin cuerpo en S3.",
        );
    }
    clearOpenFile();
    memorySession = false;
    cloudEpamId = loaded.meta.epamId;
    setOpenFileName(loaded.meta.fileName);
    loadPamphlet(doc);
    rememberLastEpamId(loaded.meta.epamId);
}

/**
 * On first visit: reopen the last cloud .epam from localStorage, or the only
 * document available to this account when there is exactly one.
 */
async function tryAutoloadCloudPamphlet(): Promise<void> {
    if (!getAuthToken() || !isAuthenticated()) {
        return;
    }
    try {
        const { epams } = await fetchEpams();
        if (epams.length === 0) {
            return;
        }
        const lastId = readLastEpamId();
        const preferred = lastId
            ? epams.find((item) => item.epamId === lastId)
            : undefined;
        const target = preferred ?? (epams.length === 1 ? epams[0] : undefined);
        if (!target) {
            return;
        }
        await openCloudDocumentById(target.epamId);
        setStatus(`Opened from cloud: ${target.fileName}`, "success");
    } catch {
        // Stay on empty canvas if list/fetch fails; user can open manually.
    }
}

function convertPixelsToMillimeters(px: number): number {
    return px * (25.4 / 96);
}

/**
 * Off-screen column at real pamphlet mm width, outside the scaled sheet.
 * Reflow measures here so phone viewport / text inflation / transform cannot skew mm math.
 */
function ensureMeasureRoot(): { root: HTMLElement; column: HTMLElement } {
    let root = appRoot.querySelector<HTMLElement>(":scope > .pamphlet-measure-root");
    if (!root) {
        root = document.createElement("div");
        root.className = "pamphlet-measure-root";
        root.setAttribute("aria-hidden", "true");
        const column = document.createElement("div");
        column.className = "dumb-column pamphlet-measure-column";
        root.appendChild(column);
        appRoot.appendChild(root);
        return { root, column };
    }
    const column =
        root.querySelector<HTMLElement>(":scope > .pamphlet-measure-column") ??
        (() => {
            const col = document.createElement("div");
            col.className = "dumb-column pamphlet-measure-column";
            root!.appendChild(col);
            return col;
        })();
    return { root, column };
}

/**
 * Layout height in CSS mm from offsetHeight (pre-transform), measured in the
 * dedicated 57.85mm sandbox when possible.
 */
function measureLayoutHeightMm(el: HTMLElement): number {
    return convertPixelsToMillimeters(el.offsetHeight);
}

/** Park item (+ optional spacer) in the measure sandbox and return block mm. */
function measureBlockInSandbox(
    item: HTMLElement,
    spacer: HTMLElement | null,
): { itemPx: number; spacerPx: number; itemMm: number; spacerMm: number; blockMm: number } {
    const { column } = ensureMeasureRoot();
    column.appendChild(item);
    if (spacer) {
        column.appendChild(spacer);
    }
    // Force layout against fixed column width before reading offsetHeight.
    void column.offsetWidth;
    const itemPx = item.offsetHeight;
    const spacerPx = spacer ? spacer.offsetHeight : 0;
    const itemMm = convertPixelsToMillimeters(itemPx);
    const spacerMm = convertPixelsToMillimeters(spacerPx);
    return {
        itemPx,
        spacerPx,
        itemMm,
        spacerMm,
        blockMm: itemMm + spacerMm,
    };
}

/** Last item in a column/footer must not keep a trailing spacer; return stripped mm. */
function stripTrailingItemSpacer(parent: HTMLElement): number {
    const last = parent.lastElementChild;
    if (!last || !last.classList.contains("pamphlet-item-spacer")) return 0;
    const mm = convertPixelsToMillimeters((last as HTMLElement).offsetHeight);
    last.remove();
    return mm;
}

function measureBlockMm(item: HTMLElement, spacer: HTMLElement | null): number {
    const prevParent = item.parentElement;
    // Anchor must be the node AFTER the whole (item + optional spacer) block.
    // Using item.nextSibling when a spacer follows is wrong: measureBlockInSandbox
    // moves both nodes into the sandbox, so that "nextSibling" is no longer a
    // child of prevParent and insertBefore fails — leaving the first footer
    // item stranded in the measure root (looks like it was deleted).
    const anchor = spacer ? spacer.nextSibling : item.nextSibling;

    const { blockMm } = measureBlockInSandbox(item, spacer);

    if (prevParent) {
        prevParent.insertBefore(item, anchor);
        if (spacer) {
            prevParent.insertBefore(spacer, anchor);
        }
    }
    return blockMm;
}

/** Probe how much vertical space a new starter item (+ spacer) and the + button need. */
function measureAddControlsMm(_host: HTMLElement): { newItemMm: number; buttonMm: number } {
    const { column } = ensureMeasureRoot();
    const probeItem = createItemElement(createParagraphItem());
    const probeSpacer = createItemSpacer();
    const probeBtn = createAddItemButton(0);
    column.appendChild(probeItem);
    column.appendChild(probeSpacer);
    column.appendChild(probeBtn);
    void column.offsetWidth;
    const newItemMm = measureLayoutHeightMm(probeItem) + measureLayoutHeightMm(probeSpacer);
    const buttonMm = measureLayoutHeightMm(probeBtn);
    probeItem.remove();
    probeSpacer.remove();
    probeBtn.remove();
    return { newItemMm, buttonMm };
}

/** Keep header-menu chrome tokens stable when the user zooms the page. */
function syncFixedChromeScale(): void {
    const dpr = window.devicePixelRatio || 1;
    const zoom = dpr / uiChromeBaselineDpr;
    const inv = zoom > 0 ? 1 / zoom : 1;
    appRoot.style.setProperty("--ui-zoom", String(zoom));
    appRoot.style.setProperty("--ui-inv-zoom", String(inv));
}

type ToastKind = "info" | "success" | "error";

function showToast(message: string, kind: ToastKind = "info"): void {
    // Toasts disabled — keep console for errors only.
    if (kind === "error") {
        console.error("[pamphlet]", message);
    }
}

function setError(message: string): void {
    showToast(message, "error");
}

function clearError(): void {
    // Status UI removed with toasts.
}

function setStatus(_message: string, _kind: ToastKind = "info"): void {
    // Status toasts removed.
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
            columnWidth: "57.85mm",
            pxToMmFactor: 25.4 / 96,
            heightSource: "pamphlet-measure-root sandbox (57.85mm, pre-transform)",
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
        // Measure in dedicated mm sandbox (not the on-screen scaled sheet).
        const measured = measureBlockInSandbox(item, spacer);
        const { itemPx, spacerPx, itemMm, spacerMm, blockMm } = measured;
        const filledBeforeMm = currentColumnFilledMm;
        const currentMaxMm = maxHeightForColumn(columnIndex);
        // Overflow uses item height only: the last item in a column has no trailing spacer.
        const wouldOverflow =
            currentColumnItemsCount > 0 && currentColumnFilledMm + itemMm > currentMaxMm;
        const preview = (item.textContent ?? "").trim().slice(0, 48);

        if (wouldOverflow) {
            // Previous column's last item must not keep a spacer underneath.
            const strippedMm = stripTrailingItemSpacer(currentColumnDiv);
            currentColumnFilledMm -= strippedMm;
            const prevLast = report.itemTrace.at(-1);
            if (prevLast && prevLast.column === columnIndex && strippedMm > 0) {
                prevLast.filledAfterMm = Number(currentColumnFilledMm.toFixed(3));
                prevLast.spacerPx = 0;
                prevLast.spacerMm = 0;
                prevLast.blockMm = Number(prevLast.itemMm.toFixed(3));
            }
            pushColumnSummary(columnIndex, currentColumnItemsCount, currentColumnFilledMm);

            columnIndex++;
            currentColumnDiv = createAndAppendColumn();
            currentColumnDiv.appendChild(item);
            currentColumnDiv.appendChild(spacer);

            currentColumnFilledMm = blockMm;
            currentColumnItemsCount = 1;
        } else {
            currentColumnDiv.appendChild(item);
            currentColumnDiv.appendChild(spacer);
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

    // Clear sandbox so live sheet is the only owner of content nodes.
    ensureMeasureRoot().column.replaceChildren();

    if (currentColumnItemsCount > 0) {
        currentColumnFilledMm -= stripTrailingItemSpacer(currentColumnDiv);
        // Trace filledAfter for the final item should match column summary (no trailing spacer).
        const lastTrace = report.itemTrace.at(-1);
        if (lastTrace && lastTrace.column === columnIndex) {
            lastTrace.filledAfterMm = Number(currentColumnFilledMm.toFixed(3));
            lastTrace.spacerPx = 0;
            lastTrace.spacerMm = 0;
            lastTrace.blockMm = Number(lastTrace.itemMm.toFixed(3));
        }
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
            const layoutPx = col.offsetHeight;
            const layoutMm = convertPixelsToMillimeters(layoutPx);
            const visualPx = col.getBoundingClientRect().height;
            const visualMm = convertPixelsToMillimeters(visualPx);
            const summary = report.columns.find((c) => c.columnIndex === index);
            const reflowMaxMm = maxHeightForColumn(index);
            const filled = summary?.filledHeightMm ?? 0;
            const row = {
                columnIndex: index,
                layoutHeightPx: Number(layoutPx.toFixed(2)),
                layoutHeightMm: Number(layoutMm.toFixed(2)),
                visualHeightPx: Number(visualPx.toFixed(2)),
                visualHeightMm: Number(visualMm.toFixed(2)),
                filledHeightMm: filled,
                itemCount: summary?.itemCount ?? 0,
                reflowMaxMm,
                overflowVsLayoutMm: Number((filled - layoutMm).toFixed(2)),
                overflowVsReflowMaxMm: Number((filled - reflowMaxMm).toFixed(2)),
            };
            if (index === 1) {
                console.warn("[reflow] column 1 height check", row);
            } else {
                console.log("[reflow] column height check", row);
            }
        }

        // Transform does not change layout box; refresh scroll gap after reflow.
        syncSheetScale();
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
    updatePrintAvailability();
    syncSheetScale();
    if (openEdit) {
        activateEditAt(data, data.last_edited_element);
    }
}

function hasEditableSession(): boolean {
    return hasOpenFile() || cloudEpamId !== null || memorySession || currentDoc !== null;
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
    rememberLastEpamId(saved.meta.epamId);
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
            renderDocument(next, openEdit);
            setStatus(`Saved: ${getOpenFileName() || "document"}`, "success");
        } else if (cloudEpamId) {
            next = await persistCloud(next);
            renderDocument(next, openEdit);
            setStatus(`Saved to cloud: ${getOpenFileName() || cloudEpamId}`, "success");
        } else {
            // Memory-only: keep the sheet editable without a disk/cloud write.
            renderDocument(next, openEdit);
            setStatus("Updated in browser — use Save to cloud to keep a copy.", "info");
        }
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
        updateItemStyleIndexes(data, resolved, image.styleIndexes);
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
    if (!currentDoc || !hasEditableSession() || !pendingInsert) {
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
    if (!currentDoc || !hasEditableSession()) {
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
            if (hasOpenFile()) {
                await savePamphlet(next);
                setStatus(`Saved: ${getOpenFileName()}`, "success");
            } else if (cloudEpamId) {
                await persistCloud(next);
                setStatus(`Saved to cloud: ${getOpenFileName() || cloudEpamId}`, "success");
            } else if (memorySession || currentDoc) {
                setStatus("Updated in browser — use Save to cloud to keep a copy.", "info");
            } else {
                setError("No pamphlet file is open. Open or create a file first.");
                return;
            }
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

on(trayToggleBtn, "click", () => {
    toggleActivityTray();
});

on(document, "pointerdown", (event: Event) => {
    if (activityTray.hidden) return;
    const target = event.target as Node;
    if (headerMenu.contains(target)) return;
    closeActivityTray();
});

function syncOpenSourceModalForFsa(): void {
    const fsaOk = isFileSystemAccessSupported();
    openSourceLocalBtn.disabled = !fsaOk;
    openSourceLocalBtn.title = fsaOk
        ? ""
        : "Opening files from this device needs HTTPS (or localhost) in Chrome or Edge.";
    const hint = openSourceModal.querySelector<HTMLElement>(".create-modal-hint");
    if (hint) {
        hint.textContent = fsaOk
            ? "Choose where to load the .epam file from."
            : "Device files need HTTPS (or localhost). Open from the cloud if you are signed in.";
    }
}

on(openBtn, "click", () => {
    closeActivityTray();
    clearError();
    syncOpenSourceModalForFsa();
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
        memorySession = false;
        cloudEpamId = data.id?.trim() || null;
        rememberLastEpamId(cloudEpamId);
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
        setError("Sign in to open from the cloud.");
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
            empty.textContent = "Save a pamphlet with “Save to cloud”.";
            openCloudList.appendChild(empty);
            return;
        }
        openCloudHint.textContent = "Selecciona un .epam asociado a tu cuenta.";
        for (const item of epams) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "open-cloud-list__item open-cloud-list__card";
            btn.setAttribute("role", "listitem");
            btn.setAttribute(
                "aria-label",
                `Abrir panfleto ${item.title || item.fileName || item.epamId}`,
            );
            const title = document.createElement("span");
            title.className = "open-cloud-list__title";
            title.textContent = item.title || item.fileName;
            const meta = document.createElement("span");
            meta.className = "open-cloud-list__meta";
            const updated = (item.updatedAt ?? "").slice(0, 10) || "—";
            meta.textContent = `${item.fileName || "sin-nombre.epam"} · ${item.series || "—"} ch.${item.seriesChapter || "—"} · ${updated}`;
            const hint = document.createElement("span");
            hint.className = "open-cloud-list__action";
            hint.textContent = "Clic para abrir";
            btn.append(title, meta, hint);
            btn.addEventListener("click", () => {
                void (async () => {
                    if (btn.disabled) return;
                    btn.disabled = true;
                    btn.classList.add("is-loading");
                    hint.textContent = "Abriendo…";
                    try {
                        await openCloudDocumentById(item.epamId);
                        closeOpenCloudModal();
                        setStatus(`Opened from cloud: ${item.fileName}`, "success");
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        setError(`Cloud open failed: ${message}`);
                        openApiErrorModal(message, {
                            title: "Cloud pamphlet error",
                            summary: "Could not open this .epam from the server.",
                        });
                        hint.textContent = "Clic para abrir";
                    } finally {
                        btn.disabled = false;
                        btn.classList.remove("is-loading");
                    }
                })();
            });
            openCloudList.appendChild(btn);
        }
    } catch (err) {
        closeOpenCloudModal();
        const message = err instanceof Error ? err.message : String(err);
        setError(`Cloud list failed: ${message}`);
        openApiErrorModal(message, {
            title: "Cloud pamphlet error",
            summary: "Could not list pamphlets from the server.",
        });
    }
});

on(openCloudCancelBtn, "click", () => {
    closeOpenCloudModal();
});

function closeSeriesModal(): void {
    if (seriesModal.open) seriesModal.close();
}

async function refreshSeriesTree(activeEpamId: string | null): Promise<void> {
    seriesTreeEl.replaceChildren();
    seriesTreeHint.hidden = false;
    seriesTreeHint.textContent = "Loading tree…";
    if (!getAuthToken() || !isAuthenticated()) {
        seriesTreeHint.textContent = "Sign in to browse your series tree from the cloud.";
        return;
    }
    try {
        const tree = await fetchEpamSeriesTree();
        seriesTreeEl.replaceChildren();
        if (tree.count === 0) {
            seriesTreeHint.textContent = "No cloud pamphlets yet — save one to grow the tree.";
            return;
        }
        seriesTreeHint.hidden = true;
        for (const seriesNode of tree.series) {
            const seriesBlock = document.createElement("div");
            seriesBlock.className = "series-tree__series";
            seriesBlock.setAttribute("role", "treeitem");
            seriesBlock.setAttribute("aria-expanded", "true");
            const seriesTitle = document.createElement("h3");
            seriesTitle.className = "series-tree__series-title";
            seriesTitle.textContent = seriesNode.name;
            seriesBlock.appendChild(seriesTitle);
            for (const chapter of seriesNode.chapters) {
                const chapterBlock = document.createElement("div");
                chapterBlock.className = "series-tree__chapter";
                const chapterTitle = document.createElement("h4");
                chapterTitle.className = "series-tree__chapter-title";
                chapterTitle.textContent = `Capítulo ${chapter.name}`;
                chapterBlock.appendChild(chapterTitle);
                const list = document.createElement("ul");
                list.className = "series-tree__items";
                for (const item of chapter.items) {
                    const li = document.createElement("li");
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "series-tree__item";
                    if (activeEpamId && item.epamId === activeEpamId) {
                        btn.classList.add("is-current");
                    }
                    btn.textContent = item.title;
                    btn.title = item.fileName || item.epamId;
                    btn.addEventListener("click", () => {
                        void (async () => {
                            try {
                                await openCloudDocumentById(item.epamId);
                                closeSeriesModal();
                                setStatus(`Opened from series tree: ${item.title}`, "success");
                            } catch (err) {
                                const message = err instanceof Error ? err.message : String(err);
                                setError(`Cloud open failed: ${message}`);
                                openApiErrorModal(message, {
                                    title: "Series tree error",
                                    summary: "Could not open this pamphlet from the series tree.",
                                });
                            }
                        })();
                    });
                    li.appendChild(btn);
                    list.appendChild(li);
                }
                chapterBlock.appendChild(list);
                seriesBlock.appendChild(chapterBlock);
            }
            seriesTreeEl.appendChild(seriesBlock);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        seriesTreeHint.hidden = false;
        seriesTreeHint.textContent = `Could not load series tree: ${message}`;
        openApiErrorModal(message, {
            title: "Series tree error",
            summary: "Could not load series → chapters → pamphlet from the server.",
        });
    }
}

async function openSeriesModal(): Promise<void> {
    closeActivityTray();
    clearError();
    if (!currentDoc) {
        setError("Open a pamphlet before editing its series.");
        return;
    }
    seriesModalSeries.value = currentDoc.header.series || "";
    seriesModalChapter.value = currentDoc.header.series_chapter || "";
    seriesModal.showModal();
    seriesModalSeries.focus();
    await refreshSeriesTree(cloudEpamId);
}

on(seriesBtn, "click", () => {
    void openSeriesModal();
});

on(seriesModalCancelBtn, "click", () => {
    closeSeriesModal();
});

on(seriesForm, "submit", (event: Event) => {
    event.preventDefault();
    void (async () => {
        if (!currentDoc) return;
        const series = seriesModalSeries.value.trim();
        const series_chapter = seriesModalChapter.value.trim();
        if (!series || !series_chapter) {
            setError("Series and chapter are required.");
            return;
        }
        const nextHeader = {
            ...currentDoc.header,
            series,
            series_chapter,
        };
        currentHeader = nextHeader;
        const base = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
        const nextDoc: PamphletStructure = { ...base, header: nextHeader };
        currentDoc = nextDoc;
        renderPageChrome(main, nextDoc);
        try {
            if (getAuthToken() && isAuthenticated()) {
                const saved = await persistCloud(nextDoc);
                memorySession = false;
                renderDocument(saved, false);
            } else {
                renderDocument(nextDoc, false);
            }
            closeSeriesModal();
            setStatus("Series updated", "success");
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Series save failed: ${message}`);
            openApiErrorModal(message, {
                title: "Series save error",
                summary: "Could not save series metadata for this pamphlet.",
            });
        }
    })();
});

on(saveCloudBtn, "click", async () => {
    closeActivityTray();
    clearError();
    if (!currentDoc) {
        setError("No hay panfleto abierto para guardar.");
        return;
    }
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Sign in to save to the cloud.");
        return;
    }
    try {
        const live = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
        const savedDoc = await persistCloud({ ...live });
        memorySession = false;
        renderDocument(savedDoc, false);
        updatePrintAvailability();
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
    const fsaOk = isFileSystemAccessSupported();
    createSaveCloudBtn.disabled = !loggedIn;
    createSaveCloudHint.hidden = loggedIn;
    // Keep local create available: FSA picks a file; without FSA we start an in-browser session.
    createSaveLocalBtn.disabled = false;
    createSaveLocalBtn.textContent = fsaOk ? "On this device" : "In this browser";
    createSaveLocalBtn.title = fsaOk
        ? ""
        : "Starts an editable session in this tab. Device file pickers need HTTPS (or localhost).";
    const hint = createSaveModal.querySelector<HTMLElement>(".create-modal-hint:not([id])");
    if (hint) {
        hint.textContent = fsaOk
            ? "Choose where to save the new .epam file."
            : "Device file save needs HTTPS (or localhost). Use “In this browser” or “In the cloud”.";
    }
    createSaveModal.showModal();
}

on(createBtn, "click", () => {
    closeActivityTray();
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
        setError("Fill in title, series, chapter, and author.");
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
        if (isFileSystemAccessSupported()) {
            const data = await createPamphletFile(meta);
            pendingCreateMeta = null;
            memorySession = false;
            cloudEpamId = null;
            closeCreateSaveModal();
            loadPamphlet(data);
            openItemTypeModal({ mode: "end", column: 1 });
            return;
        }
        // No FSA (typical on http://host:port): editable blank sheet in this tab only.
        clearOpenFile();
        cloudEpamId = null;
        memorySession = true;
        const blank = createEmptyPamphlet(meta);
        setOpenFileName(
            `${meta.series.trim().replace(/[^\w.-]+/g, "_") || "pamphlet"}_ch${meta.series_chapter.trim().replace(/[^\w.-]+/g, "_") || "1"}.epam`,
        );
        pendingCreateMeta = null;
        closeCreateSaveModal();
        loadPamphlet(blank);
        openItemTypeModal({ mode: "end", column: 1 });
        setStatus("Editing in this browser — Save to cloud to keep a copy. Device files need HTTPS.", "info");
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
        setError("Sign in to save to the cloud.");
        return;
    }
    try {
        clearOpenFile();
        memorySession = false;
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
applyViewMode(viewMode, { closeTray: false });
on(window, "resize", () => {
    syncFixedChromeScale();
    syncSheetScale();
});
if (window.visualViewport) {
    on(window.visualViewport, "resize", () => {
        syncFixedChromeScale();
        syncSheetScale();
    });
    on(window.visualViewport, "scroll", syncFixedChromeScale);
}

syncOpenSourceModalForFsa();
    if (!isFileSystemAccessSupported()) {
        // Keep Open/New usable: cloud + in-browser create still work without FSA.
        setStatus(FSA_HTTPS_HINT, "info");
    } else {
        setStatus("No file open — open an existing .epam or create a new one.");
    }

    void tryAutoloadCloudPamphlet();

    return {
        destroy() {
            for (const dispose of disposers) dispose();
            disposers.length = 0;
            appRoot.querySelector(":scope > .pamphlet-measure-root")?.remove();
            if (window.__eduardoosHeaderDynamicMenu === headerMenu) {
                window.__eduardoosHeaderDynamicMenu = null;
            }
            headerMenu.remove();
            document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID)?.replaceChildren();
            host.replaceChildren();
        },
    };
}
