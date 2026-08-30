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
import { copyEpam, fetchEpam, fetchEpams, fetchEpamSeriesTree, recycleEpam, saveEpamToCloud } from "../../epams";
import type { EpamSeriesTreeItem, EpamSeriesTreeResponse } from "../../epams";
import {
    createFooterProfile,
    deleteFooterProfile,
    fetchFooterProfiles,
    footerFromForm,
    updateFooterProfile,
    type FooterProfile,
} from "../../pamphletFooters";
import { getAuthToken, isAuthenticated } from "../../auth";
import { DOCUMENT_ROUTES } from "../../../config/routes";
import { createCorrelationId } from "../../telemetry";
import { openApiErrorModal } from "../../../components/ServerErrorModal/ServerErrorModal";
import {
    createAddItemButton,
    createItemElement,
    createItemSpacer,
    getItemLocation,
    isChromeItem,
    isImageItem,
    renderFromPamphlet,
    renderPageChrome,
    serializePamphlet,
    syncFooterMetaEmptyFlags,
    syncImageItemFromDom,
    syncItemContentFromTextarea,
} from "./pamphlet_io";
import {
    FOOTER_COLUMN,
    FOOTER_FIELD_KEYS,
    HEADER_COLUMN,
    HEADER_FIELD_KEYS,
    PAMPHLET_FOOTER_LAYOUT_MM,
    PAMPHLET_HEADER_LAYOUT_MM,
    createParagraphItem,
    createEmptyPamphlet,
    emptyFooter,
    LEAD_IMAGE_GAP_MM,
    LEAD_IMAGE_HEIGHT_MM,
    ensureStructuredLeadImages,
    stripStructuredLeadImages,
    type CreatePamphletMeta,
    type FooterFieldKey,
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
    const copyBtn = requireElement<HTMLButtonElement>("#btn-copy");
    const saveCloudBtn = requireElement<HTMLButtonElement>("#btn-save-cloud");
    const printBtn = requireElement<HTMLButtonElement>("#btn-print");
    const viewDesktopBtn = requireElement<HTMLButtonElement>("#btn-view-desktop");
    const viewMobileBtn = requireElement<HTMLButtonElement>("#btn-view-mobile");
    const seriesBtn = requireElement<HTMLButtonElement>("#btn-series");
    const templateBtn = requireElement<HTMLButtonElement>("#btn-template");
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
    const openCloudHeading = openCloudModal.querySelector("h2");
    const openCloudList = requireElement<HTMLElement>("#open-cloud-list");
    const openCloudHint = requireElement<HTMLElement>("#open-cloud-hint");
    const openCloudCancelBtn = requireElement<HTMLButtonElement>("#open-cloud-cancel");
    const openCloudDeleteToggle = requireElement<HTMLButtonElement>("#open-cloud-delete-toggle");
    const openCloudDeleteConfirm = requireElement<HTMLButtonElement>("#open-cloud-delete-confirm");
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
    const footerBtn = requireElement<HTMLButtonElement>("#btn-footer");
    const footerModal = requireElement<HTMLDialogElement>("#footer-modal");
    const footerModalHint = requireElement<HTMLElement>("#footer-modal-hint");
    const footerProfileList = requireElement<HTMLElement>("#footer-profile-list");
    const footerProfileForm = requireElement<HTMLFormElement>("#footer-profile-form");
    const footerFormId = requireElement<HTMLInputElement>("#footer-form-id");
    const footerFormName = requireElement<HTMLInputElement>("#footer-form-name");
    const footerFormAction = requireElement<HTMLInputElement>("#footer-form-action");
    const footerFormMessage = requireElement<HTMLInputElement>("#footer-form-message");
    const footerFormValue1 = requireElement<HTMLInputElement>("#footer-form-value1");
    const footerFormValue2 = requireElement<HTMLInputElement>("#footer-form-value2");
    const footerFormValue3 = requireElement<HTMLInputElement>("#footer-form-value3");
    const footerFormValue4 = requireElement<HTMLInputElement>("#footer-form-value4");
    const footerFormReset = requireElement<HTMLButtonElement>("#footer-form-reset");
    const footerFormFromSheet = requireElement<HTMLButtonElement>("#footer-form-from-sheet");
    const footerModalCancelBtn = requireElement<HTMLButtonElement>("#footer-modal-cancel");
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
        // Header/footer mm sizes come from the frontend sheet CSS — backend must not invent them.
        const printPayload: PamphletStructure = {
            ...live,
            header_layout: PAMPHLET_HEADER_LAYOUT_MM,
            footer_layout: PAMPHLET_FOOTER_LAYOUT_MM,
        };
        const correlationId = createCorrelationId();
        const res = await fetch(DOCUMENT_ROUTES.pamphletPdf, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Correlation-ID": correlationId,
            },
            body: JSON.stringify(printPayload),
        });
        if (!res.ok) {
            const text = await res.text();
            let detail = text || `HTTP ${res.status}`;
            try {
                const parsed = JSON.parse(text) as { error?: string };
                if (parsed?.error) detail = parsed.error;
            } catch {
                /* keep raw text */
            }
            throw new Error(
                [
                    `PDF print failed (${res.status})`,
                    `correlation=${correlationId}`,
                    `type=${printPayload.type}`,
                    detail,
                ].join("\n"),
            );
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
        openApiErrorModal(message, {
            title: "Error al generar PDF",
            summary: "El servidor rechazó la impresión del panfleto. Copia el detalle si reportas el fallo.",
        });
    } finally {
        endPrintDesktopLayout();
    }
}

const usLetterHeightInMillimeters = 215.9;
const pageMarginMm = 10;
const pageHeaderHeightMm = PAMPHLET_HEADER_LAYOUT_MM.height;
const pageFooterHeightMm = PAMPHLET_FOOTER_LAYOUT_MM.height;
const colGutterNarrowMm = 4;
/** Gap only between cols 7–8 and the footer (--footer-body-gutter). */
const footerBodyGutterMm = 6;
/** Gap between page header and cols 1–2 (matches --header-body-gutter). */
const headerBodyGutterMm = PAMPHLET_HEADER_LAYOUT_MM.body_gutter;
/** Page 2 band / full page-1 chrome band: letter − 2×margin */
const columnContentHeightMm = usLetterHeightInMillimeters - pageMarginMm * 2;
/** Cols 1–2: under page header → discount header + header→body gutter */
const page1RightColHeightMm =
    columnContentHeightMm - pageHeaderHeightMm - headerBodyGutterMm; // 156.4
/** Cols 7–8: above page footer → discount footer↔body gutter + footer */
const page1LeftColHeightMm =
    columnContentHeightMm - footerBodyGutterMm - pageFooterHeightMm; // 160.1

function maxHeightForColumn(columnIndex: number): number {
    const structured = currentDoc?.type === "pamphlet_structured_images";
    const leadReserve = LEAD_IMAGE_HEIGHT_MM + LEAD_IMAGE_GAP_MM;
    if (columnIndex === 1 || columnIndex === 2) {
        if (structured && columnIndex === 1) {
            // Lead shares col2 top (after header-body-gutter); body is right band − lead − gap.
            return page1RightColHeightMm - leadReserve;
        }
        return page1RightColHeightMm;
    }
    if (columnIndex === 7 || columnIndex === 8) {
        if (structured && columnIndex === 7) {
            return page1LeftColHeightMm - leadReserve;
        }
        return page1LeftColHeightMm;
    }
    if (structured && (columnIndex === 3 || columnIndex === 5)) {
        return columnContentHeightMm - leadReserve;
    }
    return columnContentHeightMm; // 3–6 (page 2) or even cols
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

/** Content column width in mm — same as CSS --column-content-width / PamphletColWidthMm. */
const COLUMN_CONTENT_WIDTH_MM = 57.85;
/** Vertical gap between items (CSS --item-gap-height). */
const ITEM_GAP_HEIGHT_MM = 2.5;

/**
 * Convert layout px → mm using the measure column’s real CSS mm width.
 * Hard-coding 96dpi drifts on some displays and leaves empty space at column bottoms.
 */
function convertPixelsToMillimeters(px: number, columnEl?: HTMLElement | null): number {
    const col = columnEl ?? ensureMeasureRoot().column;
    const widthPx = col.offsetWidth;
    if (widthPx > 0) {
        return px * (COLUMN_CONTENT_WIDTH_MM / widthPx);
    }
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
    const itemMm = convertPixelsToMillimeters(itemPx, column);
    const spacerMm = convertPixelsToMillimeters(spacerPx, column);
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
        // Strip trailing item-gap from filled (last item has no spacer under it).
        const filledContent = filled > 0 ? Math.max(0, filled - ITEM_GAP_HEIGHT_MM) : 0;
        if (filledContent + newItemMm + buttonMm <= max) {
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

function reflowAndReport(container: HTMLElement) {
    const leadSlots = Array.from(
        container.querySelectorAll<HTMLElement>(":scope > .pamphlet-lead-slot"),
    );
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
        // Filled so far includes a trailing item-gap after the previous item; that gap is
        // removed when the column ends. Fit the next item against content height only, or
        // cols 1–6 leave ~2.5mm+ empty at the bottom and look under-packed.
        const filledWithoutTrailingGap =
            currentColumnItemsCount > 0
                ? Math.max(0, currentColumnFilledMm - ITEM_GAP_HEIGHT_MM)
                : 0;
        const wouldOverflow =
            currentColumnItemsCount > 0 && filledWithoutTrailingGap + itemMm > currentMaxMm;
        const preview = (item.textContent ?? "").trim().slice(0, 48);

        if (wouldOverflow && columnIndex < 8) {
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
            // Spec 035: past col 8 capacity, keep packing into col 8 (CSS clips).
            // Never create column_9+ that serializePamphlet would drop.
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

    for (const slot of leadSlots) {
        container.appendChild(slot);
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
    }

    // Readable column text for debugging (not nested object dumps).
    const columnPayload = serializePamphlet(
        container,
        currentDoc?.last_edited_element ?? { column: 1, index: 0 },
        currentDoc,
    );
    const lines: string[] = ["[pamphlet] column text"];
    for (const key of [
        "column_1",
        "column_2",
        "column_3",
        "column_4",
        "column_5",
        "column_6",
        "column_7",
        "column_8",
    ] as const) {
        const items = columnPayload[key] ?? [];
        lines.push(`=== ${key} (${items.length}) ===`);
        if (items.length === 0) {
            lines.push("(empty)");
            continue;
        }
        items.forEach((item, i) => {
            if (item.type === "image") {
                lines.push(`[${i}] image height_mm=${item.height_mm}`);
                return;
            }
            const text = (item.content || "").replace(/\s+/g, " ").trim();
            const preview = text.length > 160 ? `${text.slice(0, 160)}…` : text;
            lines.push(`[${i}] ${item.type}: ${preview || "(blank)"}`);
        });
    }
    console.log(lines.join("\n"));

    // After chrome/grid resolve, refresh scroll gap after reflow.
    requestAnimationFrame(() => {
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
        const field = FOOTER_FIELD_KEYS[Math.min(Math.max(loc.index, 0), FOOTER_FIELD_KEYS.length - 1)];
        const item = main.querySelector<HTMLElement>(
            `:scope > .pamphlet-page-footer .pamphlet-item[data-footer-field="${field}"]`,
        );
        if (item) clickInner(item);
        return;
    }

    const region = getRegionItems(data, loc.column);
    if (region.length === 0) return;

    const oddLead =
        data.type === "pamphlet_structured_images" &&
        (loc.column === 1 || loc.column === 3 || loc.column === 5 || loc.column === 7) &&
        region[0]?.type === "image";

    if (oddLead && loc.index === 0) {
        const leadItem = main.querySelector<HTMLElement>(
            `:scope > .pamphlet-lead-${loc.column} > .pamphlet-item`,
        );
        if (leadItem) {
            clickInner(leadItem);
            return;
        }
    }

    // DOM body items exclude structured leads; map JSON index → body slot.
    let bodyFlat = 0;
    for (let c = 1; c < loc.column; c++) {
        const items = getRegionItems(data, c);
        const lead =
            data.type === "pamphlet_structured_images" &&
            (c === 1 || c === 3 || c === 5 || c === 7) &&
            items[0]?.type === "image";
        bodyFlat += Math.max(0, items.length - (lead ? 1 : 0));
    }
    const bodyIndexInCol = oddLead ? loc.index - 1 : loc.index;
    if (bodyIndexInCol < 0) return;
    bodyFlat += bodyIndexInCol;

    const items = Array.from(
        main.querySelectorAll<HTMLElement>(
            ":scope > .dumb-column[class*='pamphlet-column-'] > .pamphlet-item",
        ),
    );
    if (items.length === 0) return;
    clickInner(items[Math.min(Math.max(bodyFlat, 0), items.length - 1)]);
}

function renderDocument(data: PamphletStructure, openEdit: boolean): void {
    currentDoc = data;
    currentHeader = { ...data.header };
    appRoot.dataset.pamphletType = data.type;
    const structured = data.type === "pamphlet_structured_images";
    templateBtn.classList.toggle("header-dynamic-menu__btn--active", structured);
    templateBtn.classList.toggle("is-active", structured);
    templateBtn.setAttribute("aria-pressed", structured ? "true" : "false");
    templateBtn.title = structured
        ? "Plantilla: imágenes estructuradas (clic → simple)"
        : "Plantilla: simple (clic → imágenes estructuradas)";
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

/**
 * Persist header/footer chrome without reflowing body columns.
 * Full renderDocument/reflow after chrome edits reshuffled / hid column 8 ink.
 */
async function commitChromeOnly(data: PamphletStructure): Promise<void> {
    if (!hasEditableSession()) {
        setError("No pamphlet file is open. Open or create a file first.");
        return;
    }

    try {
        let next = ensureDocumentId(data);
        if (next.footer_bind === "linked" && currentDoc?.footer_bind === "linked") {
            const before = JSON.stringify(currentDoc.footer);
            const after = JSON.stringify(next.footer);
            if (before !== after) {
                next = { ...next, footer_bind: "snapshot" };
                setStatus("Pie desvinculado — los cambios son solo de este panfleto.", "info");
            }
        }
        currentDoc = next;
        currentHeader = { ...next.header };
        renderPageChrome(main, next);
        if (hasOpenFile()) {
            await savePamphlet(next);
            setStatus(`Saved: ${getOpenFileName() || "document"}`, "success");
        } else if (cloudEpamId) {
            next = await persistCloud(next);
            currentDoc = next;
            currentHeader = { ...next.header };
            renderPageChrome(main, next);
            setStatus(`Saved to cloud: ${getOpenFileName() || cloudEpamId}`, "success");
        } else {
            setStatus("Updated in browser — use Save to cloud to keep a copy.", "info");
        }
        clearError();
        syncSheetScale();
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

    if (loc.column === FOOTER_COLUMN) {
        syncItemContentFromTextarea(container);
        const tray = container.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
        const content = tray?.value ?? "";
        const field = container.getAttribute("data-footer-field") as FooterFieldKey | null;
        if (field && FOOTER_FIELD_KEYS.includes(field)) {
            data.footer[field] = content;
        }
        const footerRoot = container.closest<HTMLElement>(".pamphlet-page-footer");
        if (footerRoot) syncFooterMetaEmptyFlags(footerRoot, data.footer);
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
    if (column < 1 || column > 8) return;
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
        if (isChromeItem(detail.container)) return;
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

    // Header / footer chrome: only close updates JSON (undo is local in the tray).
    // Do NOT full-reflow body columns — that reshuffled / hid col 7–8 ink.
    if (loc.column === HEADER_COLUMN || loc.column === FOOTER_COLUMN) {
        if (detail.action !== "close") return;
        base.last_edited_element = loc;
        if (loc.column === HEADER_COLUMN) {
            currentHeader = { ...base.header };
        }
        pushUndoSnapshot();
        await commitChromeOnly(base);
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

const COPY_ICON_SVG = `<svg class="open-cloud-list__copy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4h10v12h-2V6H8V4zm-4 4h10v12H4V8zm2 2v8h6v-8H6z" fill="currentColor"/></svg>`;

let openCloudSelectMode = false;
/** open = pick to load; copy = pick a source to clone (never deletes). */
let openCloudIntent: "open" | "copy" = "open";

function syncOpenCloudChrome(): void {
    const copying = openCloudIntent === "copy";
    openCloudDeleteToggle.hidden = copying;
    if (openCloudHeading) {
        openCloudHeading.textContent = copying
            ? "Copy an existing pamphlet"
            : "My pamphlets in the cloud";
    }
}

function closeOpenCloudModal(): void {
    openCloudSelectMode = false;
    openCloudIntent = "open";
    openCloudDeleteToggle.classList.remove("is-active");
    openCloudDeleteToggle.setAttribute("aria-pressed", "false");
    openCloudDeleteConfirm.hidden = true;
    openCloudDeleteToggle.hidden = false;
    if (openCloudHeading) {
        openCloudHeading.textContent = "My pamphlets in the cloud";
    }
    if (openCloudModal.open) openCloudModal.close();
}

/**
 * POST /copy only. Never DELETE/recycle the source. New id + suffixed title.
 * When openAfter, load the clone — the editor must not stay on the original.
 */
async function duplicateCloudPamphlet(sourceId: string, openAfter: boolean): Promise<void> {
    const copied = await copyEpam(sourceId);
    if (!copied.meta.epamId || copied.meta.epamId === sourceId) {
        throw new Error("Copy returned the original pamphlet id — aborted to protect the source.");
    }
    setStatus(`Copia creada: ${copied.meta.title} (original intacto)`, "success");
    if (openAfter) {
        await openCloudDocumentById(copied.meta.epamId);
    }
}

function syncOpenCloudDeleteConfirm(): void {
    if (!openCloudSelectMode) {
        openCloudDeleteConfirm.hidden = true;
        return;
    }
    const checked = openCloudList.querySelectorAll<HTMLInputElement>(
        'input.open-cloud-list__check:checked',
    ).length;
    openCloudDeleteConfirm.hidden = checked === 0;
}

function setOpenCloudSelectMode(on: boolean): void {
    if (openCloudIntent === "copy") return;
    openCloudSelectMode = on;
    openCloudDeleteToggle.classList.toggle("is-active", on);
    openCloudDeleteToggle.setAttribute("aria-pressed", on ? "true" : "false");
    openCloudHint.textContent = on
        ? "Marca los panfletos a borrar, luego confirma abajo."
        : "Selecciona un .epam asociado a tu cuenta.";
    openCloudList.querySelectorAll<HTMLElement>(".open-cloud-list__row").forEach((row) => {
        const check = row.querySelector<HTMLInputElement>("input.open-cloud-list__check");
        const card = row.querySelector<HTMLButtonElement>(".open-cloud-list__card");
        if (check) {
            check.hidden = !on;
            if (!on) check.checked = false;
        }
        if (card) card.disabled = on;
    });
    syncOpenCloudDeleteConfirm();
}

function appendCloudPamphletRow(parent: HTMLElement, item: EpamSeriesTreeItem): void {
    const row = document.createElement("div");
    row.className = "open-cloud-list__row";
    row.setAttribute("role", "listitem");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "open-cloud-list__check";
    check.hidden = !openCloudSelectMode;
    check.value = item.epamId;
    check.setAttribute("aria-label", `Seleccionar ${item.title || item.fileName || item.epamId}`);
    check.addEventListener("change", () => syncOpenCloudDeleteConfirm());

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "open-cloud-list__item open-cloud-list__card";
    btn.disabled = openCloudSelectMode;
    btn.setAttribute(
        "aria-label",
        openCloudIntent === "copy"
            ? `Crear copia de ${item.title || item.fileName || item.epamId}`
            : `Abrir panfleto ${item.title || item.fileName || item.epamId}`,
    );
    const title = document.createElement("span");
    title.className = "open-cloud-list__title";
    title.textContent = item.title || item.fileName || item.epamId;
    const meta = document.createElement("span");
    meta.className = "open-cloud-list__meta";
    const updated = (item.updatedAt ?? "").slice(0, 10) || "—";
    meta.textContent = `${item.fileName || "sin-nombre.epam"} · ${updated}`;
    const hint = document.createElement("span");
    hint.className = "open-cloud-list__action";
    hint.textContent = openCloudIntent === "copy" ? "Clic para copiar" : "Clic para abrir";
    btn.append(title, meta, hint);
    btn.addEventListener("click", () => {
        void (async () => {
            if (openCloudSelectMode || btn.disabled) return;
            btn.disabled = true;
            btn.classList.add("is-loading");
            const copying = openCloudIntent === "copy";
            hint.textContent = copying ? "Copiando…" : "Abriendo…";
            try {
                if (copying) {
                    await duplicateCloudPamphlet(item.epamId, true);
                    closeOpenCloudModal();
                } else {
                    await openCloudDocumentById(item.epamId);
                    closeOpenCloudModal();
                    setStatus(`Opened from cloud: ${item.fileName || item.title}`, "success");
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                setError(copying ? `Copy failed: ${message}` : `Cloud open failed: ${message}`);
                openApiErrorModal(message, {
                    title: "Cloud pamphlet error",
                    summary: copying
                        ? "Could not duplicate this .epam. The original was not deleted."
                        : "Could not open this .epam from the server.",
                });
                hint.textContent = copying ? "Clic para copiar" : "Clic para abrir";
            } finally {
                btn.disabled = false;
                btn.classList.remove("is-loading");
            }
        })();
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "open-cloud-list__copy";
    copyBtn.title = "Crear copia";
    copyBtn.setAttribute("aria-label", `Crear copia de ${item.title || item.fileName || item.epamId}`);
    copyBtn.innerHTML = COPY_ICON_SVG;
    copyBtn.addEventListener("click", () => {
        void (async () => {
            if (openCloudSelectMode || openCloudIntent === "copy") return;
            copyBtn.disabled = true;
            try {
                await duplicateCloudPamphlet(item.epamId, false);
                await reloadOpenCloudList();
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                setError(`Copy failed: ${message}`);
                openApiErrorModal(message, {
                    title: "Cloud pamphlet error",
                    summary: "Could not duplicate this .epam. The original was not deleted.",
                });
            } finally {
                copyBtn.disabled = false;
            }
        })();
    });

    row.append(check, btn, copyBtn);
    if (openCloudIntent === "copy") {
        copyBtn.hidden = true;
    }
    parent.appendChild(row);
}

function renderOpenCloudTree(tree: EpamSeriesTreeResponse): void {
    openCloudList.replaceChildren();
    if (tree.count === 0) {
        openCloudHint.textContent = "No hay panfletos en la nube para esta cuenta.";
        const empty = document.createElement("p");
        empty.className = "open-cloud-list__empty";
        empty.textContent = "Save a pamphlet with “Save to cloud”.";
        openCloudList.appendChild(empty);
        return;
    }
    openCloudHint.textContent = openCloudSelectMode
        ? "Marca los panfletos a borrar, luego confirma abajo."
        : openCloudIntent === "copy"
          ? "Elige el panfleto a copiar. Se crea uno nuevo con otro nombre e id; el original no se borra."
          : "Selecciona un .epam asociado a tu cuenta. Copy never deletes the original.";
    for (const seriesNode of tree.series) {
        const seriesEl = document.createElement("details");
        seriesEl.className = "open-cloud-list__series";
        seriesEl.open = true;
        const seriesSummary = document.createElement("summary");
        seriesSummary.className = "open-cloud-list__series-title";
        seriesSummary.textContent = seriesNode.name;
        seriesEl.appendChild(seriesSummary);
        for (const chapter of seriesNode.chapters) {
            const chapterEl = document.createElement("details");
            chapterEl.className = "open-cloud-list__chapter";
            chapterEl.open = true;
            const chapterSummary = document.createElement("summary");
            chapterSummary.className = "open-cloud-list__chapter-title";
            chapterSummary.textContent = `Capítulo ${chapter.name}`;
            chapterEl.appendChild(chapterSummary);
            const chapterList = document.createElement("div");
            chapterList.className = "open-cloud-list__chapter-items";
            for (const item of chapter.items) {
                appendCloudPamphletRow(chapterList, item);
            }
            chapterEl.appendChild(chapterList);
            seriesEl.appendChild(chapterEl);
        }
        openCloudList.appendChild(seriesEl);
    }
}

async function reloadOpenCloudList(): Promise<void> {
    openCloudHint.textContent = "Cargando…";
    const tree = await fetchEpamSeriesTree();
    renderOpenCloudTree(tree);
}

on(openSourceCloudBtn, "click", async () => {
    closeOpenSourceModal();
    clearError();
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Sign in to open from the cloud.");
        return;
    }
    await openCloudListModal("open");
});

async function openCloudListModal(intent: "open" | "copy"): Promise<void> {
    openCloudIntent = intent;
    openCloudSelectMode = false;
    openCloudDeleteToggle.classList.remove("is-active");
    openCloudDeleteToggle.setAttribute("aria-pressed", "false");
    openCloudDeleteConfirm.hidden = true;
    syncOpenCloudChrome();
    openCloudList.replaceChildren();
    openCloudModal.showModal();
    try {
        await reloadOpenCloudList();
    } catch (err) {
        closeOpenCloudModal();
        const message = err instanceof Error ? err.message : String(err);
        setError(`Cloud list failed: ${message}`);
        openApiErrorModal(message, {
            title: "Cloud pamphlet error",
            summary: "Could not list pamphlets from the server.",
        });
    }
}

on(openCloudDeleteToggle, "click", () => {
    if (openCloudIntent === "copy") return;
    setOpenCloudSelectMode(!openCloudSelectMode);
});

on(openCloudDeleteConfirm, "click", () => {
    void (async () => {
        if (openCloudIntent === "copy") return;
        const ids = Array.from(
            openCloudList.querySelectorAll<HTMLInputElement>(
                "input.open-cloud-list__check:checked",
            ),
        ).map((el) => el.value);
        if (ids.length === 0) return;
        const ok = window.confirm(
            ids.length === 1
                ? "¿Mover este panfleto a la papelera?"
                : `¿Mover ${ids.length} panfletos a la papelera?`,
        );
        if (!ok) return;
        openCloudDeleteConfirm.disabled = true;
        try {
            for (const id of ids) {
                await recycleEpam(id);
                if (cloudEpamId === id) {
                    cloudEpamId = null;
                    rememberLastEpamId(null);
                }
            }
            setStatus(
                ids.length === 1
                    ? "Panfleto movido a la papelera."
                    : `${ids.length} panfletos movidos a la papelera.`,
                "success",
            );
            openCloudSelectMode = false;
            openCloudDeleteToggle.classList.remove("is-active");
            openCloudDeleteToggle.setAttribute("aria-pressed", "false");
            openCloudDeleteConfirm.hidden = true;
            await reloadOpenCloudList();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Delete failed: ${message}`);
            openApiErrorModal(message, {
                title: "Cloud pamphlet error",
                summary: "Could not move pamphlet(s) to the recycle bin.",
            });
        } finally {
            openCloudDeleteConfirm.disabled = false;
        }
    })();
});

on(openCloudCancelBtn, "click", () => {
    closeOpenCloudModal();
});

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

function closeFooterModal(): void {
    if (footerModal.open) footerModal.close();
}

function readFooterFormFields() {
    return footerFromForm({
        action: footerFormAction.value,
        message: footerFormMessage.value,
        value1: footerFormValue1.value,
        value2: footerFormValue2.value,
        value3: footerFormValue3.value,
        value4: footerFormValue4.value,
    });
}

function fillFooterForm(profile: FooterProfile | null): void {
    footerFormId.value = profile?.footerId ?? "";
    footerFormName.value = profile?.name ?? "";
    const f = profile?.footer ?? emptyFooter();
    footerFormAction.value = f.action;
    footerFormMessage.value = f.message;
    footerFormValue1.value = f.value1;
    footerFormValue2.value = f.value2;
    footerFormValue3.value = f.value3;
    footerFormValue4.value = f.value4;
}

async function applyFooterProfile(profile: FooterProfile, bind: "snapshot" | "linked"): Promise<void> {
    if (!currentDoc) {
        setError("Abre un panfleto para aplicar este pie.");
        return;
    }
    const live = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
    const next: PamphletStructure = {
        ...live,
        footer: { ...profile.footer },
        footer_profile_id: profile.footerId,
        footer_bind: bind,
    };
    currentDoc = next;
    renderPageChrome(main, next);
    try {
        if (hasOpenFile()) {
            await savePamphlet(next);
        } else if (getAuthToken() && isAuthenticated() && cloudEpamId) {
            const saved = await persistCloud(next);
            currentDoc = {
                ...saved,
                footer: next.footer,
                footer_profile_id: next.footer_profile_id,
                footer_bind: next.footer_bind,
            };
            renderPageChrome(main, currentDoc);
        }
        setStatus(
            bind === "linked"
                ? `Pie vinculado: ${profile.name}`
                : `Pie copiado: ${profile.name}`,
            "success",
        );
        await refreshFooterProfiles();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Footer apply failed: ${message}`);
        openApiErrorModal(message, {
            title: "Pie de página",
            summary: "No se pudo aplicar el pie al panfleto.",
        });
    }
}

async function refreshFooterProfiles(): Promise<void> {
    footerProfileList.replaceChildren();
    if (!getAuthToken() || !isAuthenticated()) {
        footerModalHint.textContent = "Inicia sesión para guardar pies reutilizables.";
        return;
    }
    footerModalHint.textContent = currentDoc
        ? "Copia deja un snapshot. Vincular actualiza este panfleto cuando edites el maestro."
        : "Crea pies reutilizables (la info). Abre un panfleto para copiarlos o vincularlos.";
    try {
        const { footers } = await fetchFooterProfiles();
        if (footers.length === 0) {
            const empty = document.createElement("p");
            empty.className = "footer-profile-list__empty";
            empty.textContent = "Aún no hay pies guardados.";
            footerProfileList.appendChild(empty);
            return;
        }
        for (const profile of footers) {
            const card = document.createElement("article");
            card.className = "footer-profile-card";
            card.setAttribute("role", "listitem");
            if (currentDoc?.footer_profile_id === profile.footerId) {
                card.classList.add("is-current");
            }
            const heading = document.createElement("h3");
            heading.className = "footer-profile-card__name";
            heading.textContent = profile.name;
            const meta = document.createElement("p");
            meta.className = "footer-profile-card__meta";
            const bindLabel =
                currentDoc?.footer_profile_id === profile.footerId
                    ? currentDoc.footer_bind === "linked"
                        ? "vinculado"
                        : "copiado en este panfleto"
                    : "";
            meta.textContent = [profile.footer.action, profile.footer.value1, bindLabel]
                .filter(Boolean)
                .join(" · ");
            const actions = document.createElement("div");
            actions.className = "footer-profile-card__actions";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.textContent = "Editar";
            editBtn.addEventListener("click", () => fillFooterForm(profile));

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.textContent = "Borrar";
            delBtn.addEventListener("click", () => {
                void (async () => {
                    if (!window.confirm(`¿Borrar el pie “${profile.name}”?`)) return;
                    try {
                        await deleteFooterProfile(profile.footerId);
                        if (footerFormId.value === profile.footerId) fillFooterForm(null);
                        await refreshFooterProfiles();
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        setError(`Footer delete failed: ${message}`);
                    }
                })();
            });

            actions.append(editBtn, delBtn);
            if (currentDoc) {
                const snapBtn = document.createElement("button");
                snapBtn.type = "button";
                snapBtn.textContent = "Copiar";
                snapBtn.title = "Snapshot: el maestro ya no cambia este panfleto";
                snapBtn.addEventListener("click", () => {
                    void applyFooterProfile(profile, "snapshot");
                });
                const linkBtn = document.createElement("button");
                linkBtn.type = "button";
                linkBtn.textContent = "Vincular";
                linkBtn.title = "Si editas el maestro, este panfleto se actualiza al abrirlo";
                linkBtn.addEventListener("click", () => {
                    void applyFooterProfile(profile, "linked");
                });
                actions.append(snapBtn, linkBtn);
            }
            card.append(heading, meta, actions);
            footerProfileList.appendChild(card);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        footerModalHint.textContent = `No se pudieron cargar los pies: ${message}`;
        openApiErrorModal(message, {
            title: "Pie de página",
            summary: "Could not list static footer profiles.",
        });
    }
}

async function openFooterModal(): Promise<void> {
    closeActivityTray();
    clearError();
    fillFooterForm(null);
    footerModal.showModal();
    footerFormName.focus();
    await refreshFooterProfiles();
}

on(footerBtn, "click", () => {
    void openFooterModal();
});

on(footerModalCancelBtn, "click", () => {
    closeFooterModal();
});

on(footerFormReset, "click", () => {
    fillFooterForm(null);
    footerFormName.focus();
});

on(footerFormFromSheet, "click", () => {
    if (!currentDoc) {
        setError("Abre un panfleto para copiar su pie al formulario.");
        return;
    }
    const live = serializePamphlet(main, currentDoc.last_edited_element, currentDoc);
    fillFooterForm({
        userId: "",
        footerId: footerFormId.value,
        name: footerFormName.value.trim() || live.header.title || "Pie actual",
        footer: live.footer,
    });
});

on(footerProfileForm, "submit", (event: Event) => {
    event.preventDefault();
    void (async () => {
        const name = footerFormName.value.trim();
        if (!name) {
            setError("El pie necesita un nombre.");
            return;
        }
        if (!getAuthToken() || !isAuthenticated()) {
            setError("Inicia sesión para guardar pies.");
            return;
        }
        const payload = { name, footer: readFooterFormFields() };
        try {
            const id = footerFormId.value.trim();
            const saved = id
                ? await updateFooterProfile(id, payload)
                : await createFooterProfile(payload);
            fillFooterForm(saved);
            setStatus(`Pie guardado: ${saved.name}`, "success");
            await refreshFooterProfiles();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Footer save failed: ${message}`);
            openApiErrorModal(message, {
                title: "Pie de página",
                summary: "Could not save this static footer.",
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

on(copyBtn, "click", () => {
    closeActivityTray();
    clearError();
    if (!getAuthToken() || !isAuthenticated()) {
        setError("Sign in to copy a cloud pamphlet.");
        return;
    }
    void openCloudListModal("copy");
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

on(templateBtn, "click", () => {
    if (!currentDoc) return;
    const snap = snapshotFromDom(currentDoc.last_edited_element) ?? currentDoc;
    let next: PamphletStructure;
    if (snap.type === "pamphlet_structured_images") {
        // Leads stay outside body forever — strip them; columns grow + reflow.
        next = stripStructuredLeadImages(snap);
    } else {
        next = ensureStructuredLeadImages(snap);
    }
    void commitDocument(next, false);
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
