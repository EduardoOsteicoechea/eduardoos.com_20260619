import {
    assertPamphletStructure,
    createEmptyPamphlet,
    normalizePamphletData,
    type CreatePamphletMeta,
    type PamphletStructure,
} from "./pamphlet_schema";

let fileHandle: FileSystemFileHandle | null = null;
let fileName = "";

/** Custom pamphlet container: JSON on disk with a `.epam` extension. */
const EPAM_PICKER_TYPES: FilePickerAcceptType[] = [
    {
        description: "Pamphlet EPAM",
        accept: { "application/x-epam": [".epam"] },
    },
];

export function isFileSystemAccessSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        "showOpenFilePicker" in window &&
        "showSaveFilePicker" in window
    );
}

export function getOpenFileName(): string {
    return fileName;
}

export function hasOpenFile(): boolean {
    return fileHandle !== null;
}

function suggestFileName(meta: CreatePamphletMeta): string {
    const series = meta.series.trim().replace(/[^\w.-]+/g, "_") || "pamphlet";
    const chapter = meta.series_chapter.trim().replace(/[^\w.-]+/g, "_") || "1";
    return `${series}_ch${chapter}.epam`;
}

async function readHandle(handle: FileSystemFileHandle): Promise<PamphletStructure> {
    const file = await handle.getFile();
    const text = await file.text();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("Invalid EPAM file: contents could not be parsed as JSON");
    }
    const normalized = normalizePamphletData(parsed);
    assertPamphletStructure(normalized);
    return normalized;
}

async function writeHandle(handle: FileSystemFileHandle, data: PamphletStructure): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 4));
    await writable.close();
}

export async function openPamphletFile(): Promise<PamphletStructure> {
    if (!isFileSystemAccessSupported()) {
        throw new Error(
            "File System Access API is not supported in this browser. Use Chrome or Edge.",
        );
    }

    const [handle] = await window.showOpenFilePicker({
        types: EPAM_PICKER_TYPES,
        excludeAcceptAllOption: true,
        multiple: false,
    });

    const data = await readHandle(handle);
    fileHandle = handle;
    fileName = handle.name;
    return data;
}

export async function createPamphletFile(meta: CreatePamphletMeta): Promise<PamphletStructure> {
    if (!isFileSystemAccessSupported()) {
        throw new Error(
            "File System Access API is not supported in this browser. Use Chrome or Edge.",
        );
    }

    const title = meta.title.trim();
    const series = meta.series.trim();
    const series_chapter = meta.series_chapter.trim();
    const author = meta.author.trim();

    if (!title || !series || !series_chapter || !author) {
        throw new Error("Title, series, chapter, and author are required");
    }

    const data = createEmptyPamphlet({ title, series, series_chapter, author });

    const handle = await window.showSaveFilePicker({
        suggestedName: suggestFileName({ title, series, series_chapter, author }),
        types: EPAM_PICKER_TYPES,
        excludeAcceptAllOption: true,
    });

    await writeHandle(handle, data);
    fileHandle = handle;
    fileName = handle.name;
    return data;
}

export async function savePamphlet(data: PamphletStructure): Promise<void> {
    if (!fileHandle) {
        throw new Error("No pamphlet file is open");
    }
    assertPamphletStructure(data);
    await writeHandle(fileHandle, data);
}
