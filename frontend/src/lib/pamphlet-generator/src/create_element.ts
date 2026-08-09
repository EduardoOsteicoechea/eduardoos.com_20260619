import {
    DEFAULT_IMAGE_HEIGHT_MM,
    IMAGE_HEIGHT_STEP_MM,
    MIN_IMAGE_HEIGHT_MM,
    clampImageHeightMm,
} from "./pamphlet_schema";
import { ICONS } from "./icons";

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

function setImageHeightMm(container: HTMLElement, heightMm: number): void {
    const clamped = clampImageHeightMm(heightMm);
    container.setAttribute("data-height-mm", String(clamped));
    const frame = getImageFrame(container);
    if (frame) {
        frame.style.height = `${clamped}mm`;
    }
}

async function fileToDataUrl(file: File): Promise<string> {
    const rawUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
        reader.readAsDataURL(file);
    });

    return resizeDataUrlIfNeeded(rawUrl);
}

function resizeDataUrlIfNeeded(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const maxEdge = Math.max(img.width, img.height);
            if (maxEdge <= MAX_IMAGE_EDGE_PX) {
                resolve(dataUrl);
                return;
            }
            const scale = MAX_IMAGE_EDGE_PX / maxEdge;
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
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
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
        elContainer.classList.add(...options.extraClasses);
    }
    elContainer.setAttribute("data-tray-mode", trayMode);
    if (options.headerField) {
        elContainer.setAttribute("data-header-field", options.headerField);
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

    const tray = document.createElement("div");
    if (id) tray.id = `${id}_edit_tray`;
    tray.className = "element_edit_tray";

    tray.addEventListener("click", (trayEvent: PointerEvent) => {
        trayEvent.stopPropagation();
    });

    const editTrayButtonsTray = document.createElement("div");
    editTrayButtonsTray.className = "element_edit_tray_buttons_container";

    const saveAndClose = () => {
        dispatchTrayAction(elContainer, { action: "close", container: elContainer });
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
            return;
        }
        dispatchTrayAction(elContainer, { action: "undo", container: elContainer });
    });

    editTrayButtonsTray.appendChild(editTrayCloseButton);

    let editTrayTextArea: HTMLTextAreaElement | null = null;

    if (trayMode === "full") {
        const upButton = document.createElement("button");
        setButtonIcon(upButton, ICONS.arrowUp, "Move up");
        upButton.addEventListener("click", () => {
            dispatchTrayAction(elContainer, { action: "move-up", container: elContainer });
        });

        const downButton = document.createElement("button");
        setButtonIcon(downButton, ICONS.arrowDown, "Move down");
        downButton.addEventListener("click", () => {
            dispatchTrayAction(elContainer, { action: "move-down", container: elContainer });
        });

        const addUpButton = document.createElement("button");
        setButtonIcon(addUpButton, ICONS.addRowAbove, "Add above");
        addUpButton.addEventListener("click", () => {
            dispatchTrayAction(elContainer, { action: "add-above", container: elContainer });
        });

        const addDownButton = document.createElement("button");
        setButtonIcon(addDownButton, ICONS.addRowBelow, "Add below");
        addDownButton.addEventListener("click", () => {
            dispatchTrayAction(elContainer, { action: "add-below", container: elContainer });
        });

        const deleteButton = document.createElement("button");
        setButtonIcon(deleteButton, ICONS.delete, "Delete");
        deleteButton.classList.add("edit_tray_delete_button");
        deleteButton.addEventListener("click", () => {
            dispatchTrayAction(elContainer, { action: "delete", container: elContainer });
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
                dispatchTrayAction(elContainer, {
                    action: "bold",
                    container: elContainer,
                    start: editTrayTextArea.selectionStart,
                    end: editTrayTextArea.selectionEnd,
                });
            });
            editTrayButtonsTray.appendChild(enboldButton);
        }

        editTrayButtonsTray.appendChild(undoButton);
        editTrayButtonsTray.appendChild(deleteButton);
    } else {
        editTrayButtonsTray.appendChild(undoButton);
    }

    tray.appendChild(editTrayButtonsTray);

    if (imageMode) {
        const imageControls = document.createElement("div");
        imageControls.className = "edit_tray_image_controls";

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
                imageEl.src = dataUrl;
            });
        });
        fileLabel.appendChild(fileInput);

        const tallerBtn = document.createElement("button");
        tallerBtn.type = "button";
        tallerBtn.className = "edit_tray_height_button";
        tallerBtn.textContent = "+";
        tallerBtn.setAttribute("aria-label", "Hacer imagen más alta");
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

        imageControls.appendChild(fileLabel);
        imageControls.appendChild(tallerBtn);
        imageControls.appendChild(shorterBtn);
        tray.appendChild(imageControls);

        tray.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                saveAndClose();
            }
        });
    } else {
        editTrayTextArea = document.createElement("textarea");
        editTrayTextArea.value = initialContent;
        editTrayTextArea.classList.add("edit_tray_text_area");

        editTrayTextArea.addEventListener("input", (e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            el.textContent = target.value;
        });

        editTrayTextArea.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveAndClose();
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                saveAndClose();
            }
        });

        tray.appendChild(editTrayTextArea);
    }

    elContainer.appendChild(tray);

    if (editTrayTextArea) {
        editTrayTextArea.focus();
        editTrayTextArea.setSelectionRange(
            editTrayTextArea.value.length,
            editTrayTextArea.value.length,
        );
    }
}
