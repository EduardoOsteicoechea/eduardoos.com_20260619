/**
 * .emusic — timed lyric words for karaoke-style highlighting during playback.
 *
 * Proposed format (JSON, UTF-8, extension `.emusic`):
 * {
 *   "type": "emusic",
 *   "version": 1,
 *   "trackFile": "Song.mp3",
 *   "title": "Song",
 *   "words": [ { "t": 0.0, "d": 0.4, "w": "Lorem" }, ... ]
 * }
 * - t: start time in seconds from track start
 * - d: duration the word stays active (seconds)
 * - w: word/token text
 *
 * Lookup: /lyrics/{slug}.emusic where slug is the MP3 basename
 * (accents stripped, non-alnum → hyphens).
 */
import { trackDisplayName } from "./mediaLibrary";

export interface EmusicWord {
    /** Start time (seconds). */
    t: number;
    /** Active duration (seconds). */
    d: number;
    /** Display token. */
    w: string;
}

export interface EmusicDocument {
    type: "emusic";
    version: number;
    trackFile?: string;
    title?: string;
    words: EmusicWord[];
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

export async function fetchEmusicForTrack(objectKey: string): Promise<EmusicDocument | null> {
    const url = emusicPublicUrl(objectKey);
    try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const data = (await res.json()) as EmusicDocument;
        if (data?.type !== "emusic" || !Array.isArray(data.words)) return null;
        return data;
    } catch {
        return null;
    }
}

/** Index of the word active at `timeSec`, or -1 if none. */
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
