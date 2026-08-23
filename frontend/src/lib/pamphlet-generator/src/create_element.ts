import {
    DEFAULT_IMAGE_HEIGHT_MM,
    DEFAULT_IMAGE_SCALE,
    DEFAULT_STYLE_INDEXES,
    IMAGE_HEIGHT_STEP_MM,
    IMAGE_OFFSET_STEP_MM,
    IMAGE_SCALE_STEP,
    MAX_IMAGE_SCALE,
    MIN_IMAGE_HEIGHT_MM,
    MIN_IMAGE_SCALE,
    chromeFieldMaxLength,
    clampImageHeightMm,
    imageOffsetXMmFromStyles,
    imageOffsetYMmFromStyles,
    imageScaleFromStyles,
    writeImageTransformToStyles,
    type StyleIndexes,
} from "./pamphlet_schema";
import { ICONS } from "./icons";

const STYLE_INDEXES_ATTR = "data-style-indexes";

function setChromeStatus(visible: boolean, remaining?: number, max?: number) {
    const bar = document.getElementById("pamphlet-chrome-status");
    if (!bar) return;
    if (!visible) {
        bar.setAttribute("hidden", "");
        bar.textContent = "";
        return;
    }
    bar.removeAttribute("hidden");
    bar.textContent = `${remaining ?? 0} restantes · máx. ${max ?? 0}`;
}

export type EditTrayMode = "full" | "header";

export type PamphletTrayAction =
    | { action: "edit-open"; container: HTMLElement }
    | { action: "close"; container: HTMLElement }
    | { action: "move-up"; container: HTMLElement }
    | { action: "move-down"; container: HTMLElement }
    | { action: "add-above"; container: HTMLElement }
    | { action: "add-below"; container: HTMLElement }
    | { action: "bold"; container: HTMLElement; start: number; end: number }
    | { action: "undo"; container: HTMLElement }
    | { action: "delete"; container: HTMLElement };

export interface CreateElementOptions {
    trayMode?: EditTrayMode;
    headerField?: string;
    footerField?: string;
    extraClasses?: string[];
    itemType?: "paragraph" | "heading_1" | "image";
}

const MAX_IMAGE_EDGE_PX = 1600;

function setButtonIcon(button: HTMLButtonElement, src: string, label: string): void {
    button.replaceChildren();
    button.type = "button";
    button.classList.add("edit_tray_icon_button");
    button.setAttribute("aria-label", label);
    button.title = label;

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.className = "edit_tray_icon";
    img.draggable = false;
    button.appendChild(img);
}

function dispatchTrayAction(target: HTMLElement, detail: PamphletTrayAction): void {
    target.dispatchEvent(
        new CustomEvent<PamphletTrayAction>("pamphlet-tray-action", {
            bubbles: true,
            detail,
        }),
    );
}

function isImageContainer(container: HTMLElement): boolean {
    return container.getAttribute("data-item-type") === "image";
}

function getImageFrame(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>(":scope > .pamphlet-image-frame");
}

function getImageEl(container: HTMLElement): HTMLImageElement | null {
    return container.querySelector<HTMLImageElement>(":scope > .pamphlet-image-frame > img");
}

function readImageStyles(container: HTMLElement): StyleIndexes {
    const raw = container.getAttribute(STYLE_INDEXES_ATTR);
    if (!raw) return structuredClone(DEFAULT_STYLE_INDEXES);
    try {
        return JSON.parse(raw) as StyleIndexes;
    } catch {
        return structuredClone(DEFAULT_STYLE_INDEXES);
    }
}

/** Apply cover + pan/zoom CSS variables on the image element. */
export function applyImageTransform(container: HTMLElement): void {
    const img = getImageEl(container);
    if (!img) return;
    const styles = readImageStyles(container);
    const offsetXMm = imageOffsetXMmFromStyles(styles);
    const offsetYMm = imageOffsetYMmFromStyles(styles);
    const scale = imageScaleFromStyles(styles);
    img.style.setProperty("--img-offset-x", `${offsetXMm}mm`);
    img.style.setProperty("--img-offset-y", `${offsetYMm}mm`);
    img.style.setProperty("--img-scale", String(scale));
    // Clear leftover layout quirks from previous src / flex centering.
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.maxWidth = "none";
    img.style.objectFit = "cover";
    img.style.objectPosition = "center center";
}

function setImageHeightMm(container: HTMLElement, heightMm: number): void {
    const clamped = clampImageHeightMm(heightMm);
    container.setAttribute("data-height-mm", String(clamped));
    const frame = getImageFrame(container);
    if (frame) {
        frame.style.height = `${clamped}mm`;
    }
}

function setImageTransform(
    container: HTMLElement,
    offsetXMm: number,
    offsetYMm: number,
    scale: number,
): void {
    const next = writeImageTransformToStyles(
        readImageStyles(container),
        offsetXMm,
        offsetYMm,
        scale,
    );
    container.setAttribute(STYLE_INDEXES_ATTR, JSON.stringify(next));
    applyImageTransform(container);
}

function nudgeImageOffset(container: HTMLElement, deltaXMm: number, deltaYMm: number): void {
    const styles = readImageStyles(container);
    setImageTransform(
        container,
        imageOffsetXMmFromStyles(styles) + deltaXMm,
        imageOffsetYMmFromStyles(styles) + deltaYMm,
        imageScaleFromStyles(styles),
    );
}

function nudgeImageScale(container: HTMLElement, delta: number): void {
    const styles = readImageStyles(container);
    const next = Math.min(
        MAX_IMAGE_SCALE,
        Math.max(MIN_IMAGE_SCALE, imageScaleFromStyles(styles) + delta),
    );
    setImageTransform(
        container,
        imageOffsetXMmFromStyles(styles),
        imageOffsetYMmFromStyles(styles),
        next,
    );
}

async function copyTextareaSelectionOrAll(area: HTMLTextAreaElement): Promise<void> {
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = end > start ? area.value.slice(start, end) : area.value;
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Fallback when clipboard permission is denied.
        const prevStart = area.selectionStart;
        const prevEnd = area.selectionEnd;
        area.focus();
        if (end <= start) area.select();
        try {
            document.execCommand("copy");
        } finally {
            area.setSelectionRange(prevStart, prevEnd);
        }
    }
}

async function fileToDataUrl(file: File): Promise<string> {
    const rawUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
        reader.readAsDataURL(file);
    });

    // Always re-encode to JPEG so the Go PDF builder can embed the bytes
    // (WebP/AVIF/GIF data URLs otherwise become "[imagen]" placeholders).
    return normalizeImageDataUrlToJpeg(rawUrl);
}

/** Decode any browser-supported image and emit a JPEG data URL (optionally downscaled). */
export function normalizeImageDataUrlToJpeg(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const maxEdge = Math.max(img.width, img.height);
            const scale = maxEdge > MAX_IMAGE_EDGE_PX ? MAX_IMAGE_EDGE_PX / maxEdge : 1;
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(dataUrl);
                return;
            }
            // White matte so transparent PNGs don't become black in JPEG.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

export function openItemEditTray(elContainer: HTMLElement): void {
    const clickTarget =
        getImageFrame(elContainer) ??
        (elContainer.firstElementChild as HTMLElement | null);
    if (!clickTarget) return;
    editTray(elContainer, clickTarget, "", (elContainer.getAttribute("data-tray-mode") as EditTrayMode) || "full");
}

export default function CreateElement(
    tag: string,
    id: string,
    classes: string[],
    attributes: { key: string, value: string }[],
    content: string,
    options: CreateElementOptions = {},
): HTMLElement {
    const trayMode = options.trayMode ?? "full";
    const elContainer: HTMLElement = document.createElement("div");

    elContainer.className = "pamphlet-item";
    if (options.extraClasses?.length) {
        // classList.add throws InvalidCharacterError if a token contains spaces
        // (e.g. a mistaken "foo bar" string). Split so chrome never vanishes.
        const tokens = options.extraClasses
            .flatMap((c) => c.split(/\s+/))
            .filter(Boolean);
        if (tokens.length) elContainer.classList.add(...tokens);
    }
    elContainer.setAttribute("data-tray-mode", trayMode);
    if (options.headerField) {
        elContainer.setAttribute("data-header-field", options.headerField);
    }
    if (options.footerField) {
        elContainer.setAttribute("data-footer-field", options.footerField);
    }
    const itemType =
        options.itemType ??
        (tag.toLowerCase() === "h1" ? "heading_1" : "paragraph");
    elContainer.setAttribute("data-item-type", itemType);
    elContainer.setAttribute(
        "data-style-indexes",
        JSON.stringify([[0, 0], [0, 0], [0, 0]]),
    );
    elContainer.setAttribute("data-height-mm", "0");

    const el: HTMLElement = document.createElement(tag);
    elContainer.appendChild(el);

    if (id) {
        el.id = id;
        elContainer.id = `${id}_container`;
    }

    classes.forEach((c) => el.classList.add(c));
    attributes.forEach((att) => el.setAttribute(att.key, att.value));
    el.textContent = content;

    el.addEventListener("click", () => {
        editTray(elContainer, el, id, trayMode);
    });

    return elContainer;
}

function editTray(
    elContainer: HTMLElement,
    el: HTMLElement,
    id: string,
    trayMode: EditTrayMode,
) {
    if (elContainer.querySelector(".element_edit_tray")) return;

    dispatchTrayAction(elContainer, { action: "edit-open", container: elContainer });

    const imageMode = isImageContainer(elContainer);
    const imageEl = getImageEl(elContainer);
    const initialContent = imageMode ? (imageEl?.getAttribute("src") ?? "") : (el.textContent || "");
    const initialHeightMm = Number(elContainer.getAttribute("data-height-mm") || DEFAULT_IMAGE_HEIGHT_MM);
    const initialStyles = readImageStyles(elContainer);
    const initialOffsetXMm = imageOffsetXMmFromStyles(initialStyles);
    const initialOffsetYMm = imageOffsetYMmFromStyles(initialStyles);
    const initialScale = imageScaleFromStyles(initialStyles);

    const tray = document.createElement("div");
    if (id) tray.id = `${id}_edit_tray`;
    tray.className = "element_edit_tray";

    tray.addEventListener("click", (trayEvent: PointerEvent) => {
        trayEvent.stopPropagation();
    });

    const editTrayButtonsTray = document.createElement("div");
    editTrayButtonsTray.className = "element_edit_tray_buttons_container";

    let onOutsidePointer: (e: PointerEvent) => void = () => {};
    let onTrayHotkey: (e: KeyboardEvent) => void = () => {};

    const detachTrayListeners = () => {
        document.removeEventListener("pointerdown", onOutsidePointer, true);
        document.removeEventListener("keydown", onTrayHotkey, true);
    };

    const saveAndClose = () => {
        detachTrayListeners();
        if (trayMode === "header") setChromeStatus(false);
        dispatchTrayAction(elContainer, { action: "close", container: elContainer });
    };

    const dispatchRemountAction = (detail: PamphletTrayAction) => {
        // Remount paths destroy this tray — drop document listeners first.
        detachTrayListeners();
        dispatchTrayAction(elContainer, detail);
    };

    onOutsidePointer = (e: PointerEvent) => {
        if (!tray.isConnected) {
            detachTrayListeners();
            return;
        }
        const target = e.target as Node | null;
        if (!target) return;
        if (tray.contains(target)) return;
        // Click outside the edit tray → same as OK / save-and-close.
        saveAndClose();
    };

    // Enter / Escape → same as green OK, even when focus is on a tray toolbar button
    // (textarea-only listeners miss that). Shift+Enter still inserts a newline in the field.
    // Capture phase so we commit before other chrome (header menu, button activation).
    onTrayHotkey = (e: KeyboardEvent) => {
        if (!tray.isConnected) {
            detachTrayListeners();
            return;
        }
        if (e.isComposing) return;
        const target = e.target;
        if (target instanceof Element && target.closest("dialog[open]")) return;

        const isEscape = e.key === "Escape";
        const isEnterOk =
            e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
        if (!isEscape && !isEnterOk) return;

        // Enter only while focus is in this tray (textarea or toolbar). Escape dismisses
        // edit mode more broadly so it still matches OK after focus drifts.
        if (isEnterOk) {
            const active = document.activeElement;
            if (!(active instanceof Node) || !tray.contains(active)) return;
        }

        e.preventDefault();
        e.stopPropagation();
        saveAndClose();
    };

    const editTrayCloseButton = document.createElement("button");
    setButtonIcon(editTrayCloseButton, ICONS.check, "Save and close");
    editTrayCloseButton.classList.add("edit_tray_close_button");
    editTrayCloseButton.addEventListener("click", () => {
        saveAndClose();
    });

    const undoButton = document.createElement("button");
    setButtonIcon(undoButton, ICONS.undo, "Undo");
    undoButton.addEventListener("click", () => {
        if (trayMode === "header") {
            const textArea = tray.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
            if (textArea) {
                textArea.value = initialContent;
                el.textContent = initialContent;
            }
            return;
        }
        if (imageMode) {
            if (imageEl) {
                if (initialContent) imageEl.src = initialContent;
                else imageEl.removeAttribute("src");
            }
            setImageHeightMm(elContainer, initialHeightMm);
            setImageTransform(elContainer, initialOffsetXMm, initialOffsetYMm, initialScale);
            return;
        }
        dispatchRemountAction({ action: "undo", container: elContainer });
    });

    editTrayButtonsTray.appendChild(editTrayCloseButton);

    let editTrayTextArea: HTMLTextAreaElement | null = null;

    if (trayMode === "full") {
        const upButton = document.createElement("button");
        setButtonIcon(upButton, ICONS.arrowUp, "Move up");
        upButton.addEventListener("click", () => {
            dispatchRemountAction({ action: "move-up", container: elContainer });
        });

        const downButton = document.createElement("button");
        setButtonIcon(downButton, ICONS.arrowDown, "Move down");
        downButton.addEventListener("click", () => {
            dispatchRemountAction({ action: "move-down", container: elContainer });
        });

        const addUpButton = document.createElement("button");
        setButtonIcon(addUpButton, ICONS.addRowAbove, "Add above");
        addUpButton.addEventListener("click", () => {
            dispatchRemountAction({ action: "add-above", container: elContainer });
        });

        const addDownButton = document.createElement("button");
        setButtonIcon(addDownButton, ICONS.addRowBelow, "Add below");
        addDownButton.addEventListener("click", () => {
            dispatchRemountAction({ action: "add-below", container: elContainer });
        });

        const deleteButton = document.createElement("button");
        setButtonIcon(deleteButton, ICONS.delete, "Delete");
        deleteButton.classList.add("edit_tray_delete_button");
        deleteButton.addEventListener("click", () => {
            dispatchRemountAction({ action: "delete", container: elContainer });
        });

        editTrayButtonsTray.appendChild(upButton);
        editTrayButtonsTray.appendChild(downButton);
        editTrayButtonsTray.appendChild(addUpButton);
        editTrayButtonsTray.appendChild(addDownButton);

        if (!imageMode) {
            const enboldButton = document.createElement("button");
            enboldButton.type = "button";
            enboldButton.classList.add("edit_tray_icon_button", "edit_tray_text_button");
            enboldButton.textContent = "B";
            enboldButton.setAttribute("aria-label", "Bold");
            enboldButton.title = "Bold";
            enboldButton.addEventListener("click", () => {
                if (!editTrayTextArea) return;
                dispatchRemountAction({
                    action: "bold",
                    container: elContainer,
                    start: editTrayTextArea.selectionStart,
                    end: editTrayTextArea.selectionEnd,
                });
            });
            editTrayButtonsTray.appendChild(enboldButton);

            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.classList.add("edit_tray_icon_button", "edit_tray_text_button");
            copyButton.textContent = "⎘";
            copyButton.setAttribute("aria-label", "Copiar");
            copyButton.title = "Copy selection (or all text)";
            copyButton.addEventListener("click", () => {
                const area =
                    editTrayTextArea ??
                    tray.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
                if (!area) return;
                void copyTextareaSelectionOrAll(area);
            });
            editTrayButtonsTray.appendChild(copyButton);
        }

        editTrayButtonsTray.appendChild(undoButton);
        editTrayButtonsTray.appendChild(deleteButton);
    } else {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.classList.add("edit_tray_icon_button", "edit_tray_text_button");
        copyButton.textContent = "⎘";
        copyButton.setAttribute("aria-label", "Copiar");
        copyButton.title = "Copy selection (or all text)";
        copyButton.addEventListener("click", () => {
            const area =
                editTrayTextArea ??
                tray.querySelector<HTMLTextAreaElement>(".edit_tray_text_area");
            if (!area) return;
            void copyTextareaSelectionOrAll(area);
        });
        editTrayButtonsTray.appendChild(copyButton);
        editTrayButtonsTray.appendChild(undoButton);
    }

    tray.appendChild(editTrayButtonsTray);

    if (imageMode) {
        const imageControls = document.createElement("div");
        imageControls.className = "edit_tray_image_controls";

        const rowPrimary = document.createElement("div");
        rowPrimary.className = "edit_tray_image_row edit_tray_image_row--primary";

        const fileLabel = document.createElement("label");
        fileLabel.className = "edit_tray_file_label";
        fileLabel.textContent = "Elegir imagen";

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.className = "edit_tray_file_input";
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file || !imageEl) return;
            void fileToDataUrl(file).then((dataUrl) => {
                // Reset pan/zoom so a new asset is always cover-centered.
                setImageTransform(elContainer, 0, 0, DEFAULT_IMAGE_SCALE);
                const onReady = () => {
                    applyImageTransform(elContainer);
                    imageEl.removeEventListener("load", onReady);
                };
                imageEl.addEventListener("load", onReady);
                imageEl.src = dataUrl;
                // Cached data URLs may fire load before the listener attaches.
                if (imageEl.complete) onReady();
            });
        });
        fileLabel.appendChild(fileInput);

        const heightBtns = document.createElement("div");
        heightBtns.className = "edit_tray_image_btn_group";

        const tallerBtn = document.createElement("button");
        tallerBtn.type = "button";
        tallerBtn.className = "edit_tray_height_button";
        tallerBtn.textContent = "+";
        tallerBtn.setAttribute("aria-label", "Make image taller");
        tallerBtn.addEventListener("click", () => {
            const current = Number(elContainer.getAttribute("data-height-mm") || DEFAULT_IMAGE_HEIGHT_MM);
            setImageHeightMm(elContainer, current + IMAGE_HEIGHT_STEP_MM);
        });

        const shorterBtn = document.createElement("button");
        shorterBtn.type = "button";
        shorterBtn.className = "edit_tray_height_button";
        shorterBtn.textContent = "−";
        shorterBtn.setAttribute("aria-label", "Hacer imagen menos alta");
        shorterBtn.addEventListener("click", () => {
            const current = Number(elContainer.getAttribute("data-height-mm") || DEFAULT_IMAGE_HEIGHT_MM);
            setImageHeightMm(elContainer, Math.max(MIN_IMAGE_HEIGHT_MM, current - IMAGE_HEIGHT_STEP_MM));
        });

        heightBtns.appendChild(tallerBtn);
        heightBtns.appendChild(shorterBtn);
        rowPrimary.appendChild(fileLabel);
        rowPrimary.appendChild(heightBtns);

        const rowTransform = document.createElement("div");
        rowTransform.className = "edit_tray_image_row edit_tray_image_row--transform";

        const panLeftBtn = document.createElement("button");
        panLeftBtn.type = "button";
        panLeftBtn.className = "edit_tray_height_button";
        panLeftBtn.textContent = "←";
        panLeftBtn.setAttribute("aria-label", "Mover imagen 2mm a la izquierda");
        panLeftBtn.title = "Mover 2mm izquierda";
        panLeftBtn.addEventListener("click", () => {
            nudgeImageOffset(elContainer, -IMAGE_OFFSET_STEP_MM, 0);
        });

        const panUpBtn = document.createElement("button");
        panUpBtn.type = "button";
        panUpBtn.className = "edit_tray_height_button";
        panUpBtn.textContent = "↑";
        panUpBtn.setAttribute("aria-label", "Mover imagen 2mm arriba");
        panUpBtn.title = "Mover 2mm arriba";
        panUpBtn.addEventListener("click", () => {
            nudgeImageOffset(elContainer, 0, -IMAGE_OFFSET_STEP_MM);
        });

        const panRightBtn = document.createElement("button");
        panRightBtn.type = "button";
        panRightBtn.className = "edit_tray_height_button";
        panRightBtn.textContent = "→";
        panRightBtn.setAttribute("aria-label", "Mover imagen 2mm a la derecha");
        panRightBtn.title = "Mover 2mm derecha";
        panRightBtn.addEventListener("click", () => {
            nudgeImageOffset(elContainer, IMAGE_OFFSET_STEP_MM, 0);
        });

        const panDownBtn = document.createElement("button");
        panDownBtn.type = "button";
        panDownBtn.className = "edit_tray_height_button";
        panDownBtn.textContent = "↓";
        panDownBtn.setAttribute("aria-label", "Mover imagen 2mm abajo");
        panDownBtn.title = "Mover 2mm abajo";
        panDownBtn.addEventListener("click", () => {
            nudgeImageOffset(elContainer, 0, IMAGE_OFFSET_STEP_MM);
        });

        const zoomInBtn = document.createElement("button");
        zoomInBtn.type = "button";
        zoomInBtn.className = "edit_tray_height_button";
        zoomInBtn.textContent = "＋";
        zoomInBtn.setAttribute("aria-label", "Acercar imagen");
        zoomInBtn.title = "Zoom in";
        zoomInBtn.addEventListener("click", () => {
            nudgeImageScale(elContainer, IMAGE_SCALE_STEP);
        });

        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.type = "button";
        zoomOutBtn.className = "edit_tray_height_button";
        zoomOutBtn.textContent = "－";
        zoomOutBtn.setAttribute("aria-label", "Alejar imagen");
        zoomOutBtn.title = "Zoom out";
        zoomOutBtn.addEventListener("click", () => {
            nudgeImageScale(elContainer, -IMAGE_SCALE_STEP);
        });

        rowTransform.appendChild(panLeftBtn);
        rowTransform.appendChild(panUpBtn);
        rowTransform.appendChild(panRightBtn);
        rowTransform.appendChild(panDownBtn);
        rowTransform.appendChild(zoomOutBtn);
        rowTransform.appendChild(zoomInBtn);

        imageControls.appendChild(rowPrimary);
        imageControls.appendChild(rowTransform);
        tray.appendChild(imageControls);
    } else {
        editTrayTextArea = document.createElement("textarea");
        editTrayTextArea.value = initialContent;
        editTrayTextArea.classList.add("edit_tray_text_area");
        const chromeField =
            elContainer.getAttribute("data-header-field") ||
            elContainer.getAttribute("data-footer-field");
        if (trayMode === "header" && chromeField) {
            const max = chromeFieldMaxLength(chromeField);
            editTrayTextArea.maxLength = max;
            const updateStatus = () => {
                const len = editTrayTextArea!.value.length;
                setChromeStatus(true, Math.max(0, max - len), max);
            };
            updateStatus();
            editTrayTextArea.addEventListener("input", updateStatus);
        }
        // Suppress OS / browser selection chrome (copy/paste/select-all bars).
        editTrayTextArea.addEventListener("contextmenu", (e: MouseEvent) => {
            e.preventDefault();
        });

        editTrayTextArea.addEventListener("input", (e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            el.textContent = target.value;
        });

        tray.appendChild(editTrayTextArea);
    }

    elContainer.appendChild(tray);

    if (editTrayTextArea) {
        editTrayTextArea.focus();
        // New items default to "Escribe aquí" — select all so typing replaces the placeholder.
        // rAF: some mobile browsers clear selection if applied synchronously after focus.
        const area = editTrayTextArea;
        const selectPlaceholder = area.value === "Write here";
        requestAnimationFrame(() => {
            area.focus();
            if (selectPlaceholder) {
                area.select();
            } else {
                area.setSelectionRange(area.value.length, area.value.length);
            }
        });
    }

    // Defer so the opening click does not immediately close the tray.
    requestAnimationFrame(() => {
        document.addEventListener("pointerdown", onOutsidePointer, true);
        document.addEventListener("keydown", onTrayHotkey, true);
    });
}
