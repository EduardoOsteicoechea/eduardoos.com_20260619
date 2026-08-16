/**
 * .emusics — portable offline pack: encoded audio + structured .emusic lyrics per track.
 *
 * {
 *   "type": "emusics",
 *   "version": 1,
 *   "createdAt": "ISO-8601",
 *   "tracks": [
 *     {
 *       "key": "media/worship_playlists/song.mp3",
 *       "name": "song.mp3",
 *       "mime": "audio/mpeg",
 *       "audioBase64": "...",
 *       "emusic": { "type": "emusic", "version": 4, "unidades": [...] }
 *     }
 *   ]
 * }
 */
import {
    cloneEmusicDocument,
    emptyEmusicDocument,
    fetchEmusicForTrack,
    type EmusicDocument,
} from "./emusic";
import { trackDisplayName, type AudioLibraryItem } from "./mediaLibrary";
import { saveTrackBlobOffline } from "./offlineAudio";
import {
    saveEmusicOffline,
    saveOfflineLibraryCatalog,
    type OfflineLibraryItem,
} from "./offlineEmusic";

export const EMUSICS_MIME = "application/json";
export const EMUSICS_EXTENSION = ".emusics";

export interface EmusicsTrack {
    key: string;
    name: string;
    mime: string;
    size: number;
    audioBase64: string;
    emusic: EmusicDocument | null;
}

export interface EmusicsBundle {
    type: "emusics";
    version: 1;
    createdAt: string;
    tracks: EmusicsTrack[];
}

export type EmusicsBuildProgress = {
    done: number;
    total: number;
    trackKey: string;
    stage: "audio" | "lyrics" | "encode" | "done" | "failed";
    error?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
}

export function base64ToBlob(base64: string, mime: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime || "audio/mpeg" });
}

export async function buildEmusicsBundle(
    items: Array<{ key: string; url: string; name?: string; contentType?: string }>,
    onProgress?: (progress: EmusicsBuildProgress) => void,
): Promise<EmusicsBundle> {
    const tracks: EmusicsTrack[] = [];
    const total = items.length;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const name = item.name || trackDisplayName(item.key);
        try {
            onProgress?.({
                done: index,
                total,
                trackKey: item.key,
                stage: "audio",
            });
            const res = await fetch(item.url);
            if (!res.ok) {
                throw new Error(`audio HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const mime = item.contentType || blob.type || "audio/mpeg";

            onProgress?.({
                done: index,
                total,
                trackKey: item.key,
                stage: "lyrics",
            });
            let emusic: EmusicDocument | null = null;
            try {
                emusic = await fetchEmusicForTrack(item.key);
            } catch {
                emusic = null;
            }
            if (!emusic) {
                emusic = emptyEmusicDocument(name, name.replace(/\.mp3$/i, ""));
            } else {
                emusic = cloneEmusicDocument(emusic);
            }

            onProgress?.({
                done: index,
                total,
                trackKey: item.key,
                stage: "encode",
            });
            const audioBase64 = await blobToBase64(blob);

            tracks.push({
                key: item.key,
                name,
                mime,
                size: blob.size,
                audioBase64,
                emusic,
            });

            // Keep IndexedDB in sync while packing.
            await saveTrackBlobOffline(item.key, blob);
            await saveEmusicOffline(item.key, emusic);

            onProgress?.({
                done: index + 1,
                total,
                trackKey: item.key,
                stage: "done",
            });
        } catch (err) {
            onProgress?.({
                done: index + 1,
                total,
                trackKey: item.key,
                stage: "failed",
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        type: "emusics",
        version: 1,
        createdAt: new Date().toISOString(),
        tracks,
    };
}

export function downloadEmusicsBundle(bundle: EmusicsBundle, fileName?: string): void {
    const payload = `${JSON.stringify(bundle)}\n`;
    const blob = new Blob([payload], { type: EMUSICS_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = bundle.createdAt.slice(0, 10);
    anchor.href = url;
    anchor.download = fileName || `worship-library-${stamp}${EMUSICS_EXTENSION}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export function parseEmusicsBundle(raw: unknown): EmusicsBundle {
    if (!raw || typeof raw !== "object") {
        throw new Error("Invalid .emusics file");
    }
    const doc = raw as Record<string, unknown>;
    if (doc.type !== "emusics") {
        throw new Error('document.type must be "emusics"');
    }
    if (!Array.isArray(doc.tracks)) {
        throw new Error("document.tracks must be an array");
    }
    const tracks: EmusicsTrack[] = [];
    for (const row of doc.tracks) {
        if (!row || typeof row !== "object") continue;
        const track = row as Record<string, unknown>;
        const key = String(track.key || "").trim();
        const audioBase64 = String(track.audioBase64 || "").trim();
        if (!key || !audioBase64) continue;
        const name = String(track.name || trackDisplayName(key));
        const mime = String(track.mime || "audio/mpeg");
        const size = Number(track.size) || 0;
        let emusic: EmusicDocument | null = null;
        if (track.emusic && typeof track.emusic === "object") {
            const candidate = track.emusic as EmusicDocument;
            if (candidate.type === "emusic") {
                emusic = cloneEmusicDocument(candidate);
            }
        }
        tracks.push({ key, name, mime, size, audioBase64, emusic });
    }
    if (tracks.length === 0) {
        throw new Error("No tracks found in .emusics file");
    }
    return {
        type: "emusics",
        version: 1,
        createdAt: String(doc.createdAt || new Date().toISOString()),
        tracks,
    };
}

export async function importEmusicsBundle(
    bundle: EmusicsBundle,
    onProgress?: (done: number, total: number, trackKey: string) => void,
): Promise<{ imported: number; library: OfflineLibraryItem[] }> {
    const library: OfflineLibraryItem[] = [];
    let imported = 0;
    for (let index = 0; index < bundle.tracks.length; index += 1) {
        const track = bundle.tracks[index];
        const blob = base64ToBlob(track.audioBase64, track.mime);
        await saveTrackBlobOffline(track.key, blob);
        if (track.emusic) {
            await saveEmusicOffline(track.key, track.emusic);
        } else {
            await saveEmusicOffline(
                track.key,
                emptyEmusicDocument(track.name, track.name.replace(/\.mp3$/i, "")),
            );
        }
        library.push({
            key: track.key,
            name: track.name,
            content_type: track.mime,
            size: track.size || blob.size,
            url: "",
        });
        imported += 1;
        onProgress?.(index + 1, bundle.tracks.length, track.key);
    }
    await saveOfflineLibraryCatalog(library);
    return { imported, library };
}

export async function readEmusicsFile(file: File): Promise<EmusicsBundle> {
    const text = await file.text();
    return parseEmusicsBundle(JSON.parse(text));
}

export function offlineItemsToAudioLibrary(items: OfflineLibraryItem[]): AudioLibraryItem[] {
    return items.map((item) => ({
        key: item.key,
        name: item.name,
        content_type: item.content_type,
        size: item.size,
        url: item.url || "",
    }));
}
