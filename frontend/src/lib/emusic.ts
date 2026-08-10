/**
 * .emusic — timed lyric sections for karaoke-style highlighting.
 *
 * {
 *   "type": "emusic",
 *   "version": 2,
 *   "trackFile": "Song.mp3",
 *   "title": "Song title",
 *   "sections": [
 *     {
 *       "label": "I",
 *       "words": [ { "t": 0.0, "d": 0.4, "w": "Es" }, ... ]
 *     },
 *     { "label": "CORO", "words": [ ... ] }
 *   ]
 * }
 *
 * Highlighting follows audio.currentTime (freezes while buffering/paused).
 */
import { trackDisplayName } from "./mediaLibrary";

export interface EmusicWord {
    t: number;
    d: number;
    w: string;
}

export interface EmusicSection {
    /** Display label without brackets, e.g. "I", "CORO", "PUENTE". */
    label: string;
    words: EmusicWord[];
}

export interface EmusicDocument {
    type: "emusic";
    version: number;
    trackFile?: string;
    title?: string;
    /** Preferred structured lyrics. */
    sections?: EmusicSection[];
    /** Legacy flat word list (v1). */
    words?: EmusicWord[];
}

export function trackLyricsSlug(objectKey: string): string {
    const name = trackDisplayName(objectKey).replace(/\.mp3$/i, "");
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
}

export function emusicPublicUrl(objectKey: string): string {
    return `/lyrics/${trackLyricsSlug(objectKey)}.emusic`;
}

export function normalizeEmusicSections(doc: EmusicDocument): EmusicSection[] {
    if (Array.isArray(doc.sections) && doc.sections.length > 0) {
        return doc.sections.filter((s) => Array.isArray(s.words) && s.words.length > 0);
    }
    if (Array.isArray(doc.words) && doc.words.length > 0) {
        return [{ label: "I", words: doc.words }];
    }
    return [];
}

export function flattenSectionWords(sections: EmusicSection[]): EmusicWord[] {
    return sections.flatMap((s) => s.words);
}

export async function fetchEmusicForTrack(objectKey: string): Promise<EmusicDocument | null> {
    const url = emusicPublicUrl(objectKey);
    try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const data = (await res.json()) as EmusicDocument;
        if (data?.type !== "emusic") return null;
        if (!normalizeEmusicSections(data).length) return null;
        return data;
    } catch {
        return null;
    }
}

/** Index into the flattened word list active at `timeSec`, or -1. */
export function activeWordIndex(words: EmusicWord[], timeSec: number): number {
    if (!words.length) return -1;
    for (let i = 0; i < words.length; i++) {
        const start = words[i].t;
        const end = start + Math.max(0.05, words[i].d);
        if (timeSec >= start && timeSec < end) return i;
    }
    for (let i = words.length - 1; i >= 0; i--) {
        if (timeSec >= words[i].t) return i;
    }
    return -1;
}
