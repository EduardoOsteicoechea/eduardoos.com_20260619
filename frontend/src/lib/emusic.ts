/**
 * .emusic — timed lyric sections for karaoke-style highlighting.
 *
 * v3 shape:
 * {
 *   "type": "emusic",
 *   "version": 3,
 *   "title": "Song title",
 *   "lexicon": { "1": "mis", "2": "iniquidades" },
 *   "sections": [
 *     {
 *       "label": "I",
 *       "cues": [
 *         { "t": 0.0, "w": ["1"] },
 *         { "t": 0.5, "w": ["2"] }
 *       ]
 *     }
 *   ]
 * }
 *
 * `t` is the highlight start (seconds). Duration is next cue's `t` minus this `t`.
 * `w` is an array of lexicon ids to highlight for that cue.
 * Highlighting follows audio.currentTime (freezes while buffering/paused).
 */
import { trackDisplayName } from "./mediaLibrary";

export type EmusicLexicon = Record<string, string>;

export interface EmusicCue {
    /** Highlight start time in seconds. */
    t: number;
    /** Lexicon word ids active for this cue. */
    w: string[];
}

export interface EmusicSection {
    /** Display label without brackets, e.g. "I", "CORO", "PUENTE". */
    label: string;
    cues: EmusicCue[];
}

export interface EmusicDocument {
    type: "emusic";
    version: number;
    trackFile?: string;
    title?: string;
    /** Global word dictionary keyed by string ids. */
    lexicon?: EmusicLexicon;
    sections?: EmusicSection[];
    /** Legacy v1/v2 flat or per-section timed words. */
    words?: LegacyEmusicWord[];
}

/** Legacy timed word (v1/v2). Kept only for migration/normalize. */
interface LegacyEmusicWord {
    t: number;
    d?: number;
    w: string;
}

interface LegacySection {
    label: string;
    words?: LegacyEmusicWord[];
    cues?: EmusicCue[];
}

export interface ResolvedWord {
    id: string;
    text: string;
    t: number;
    end: number;
    sectionIndex: number;
    cueIndex: number;
    /** Stable key for this on-screen occurrence. */
    occurrenceKey: string;
}

export interface ResolvedSection {
    label: string;
    words: ResolvedWord[];
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

function asStringIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => String(item).trim())
        .filter(Boolean);
}

function cueEndTime(cues: EmusicCue[], index: number): number {
    const start = cues[index]?.t ?? 0;
    const next = cues[index + 1]?.t;
    if (typeof next === "number" && Number.isFinite(next) && next > start) {
        return next;
    }
    return start + 0.45;
}

/** Normalize any supported .emusic version into lexicon + cue sections. */
export function normalizeEmusicDocument(doc: EmusicDocument): {
    lexicon: EmusicLexicon;
    sections: EmusicSection[];
} {
    const lexicon: EmusicLexicon = { ...(doc.lexicon ?? {}) };
    let nextId = Object.keys(lexicon).reduce((max, key) => {
        const n = Number(key);
        return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);

    const ensureWord = (text: string): string => {
        const trimmed = text.trim();
        if (!trimmed) return "";
        for (const [id, value] of Object.entries(lexicon)) {
            if (value === trimmed) return id;
        }
        nextId += 1;
        const id = String(nextId);
        lexicon[id] = trimmed;
        return id;
    };

    const rawSections = Array.isArray(doc.sections) ? (doc.sections as LegacySection[]) : [];
    if (rawSections.length > 0) {
        const sections: EmusicSection[] = [];
        for (const section of rawSections) {
            const label = String(section.label || "I").trim() || "I";
            if (Array.isArray(section.cues) && section.cues.length > 0) {
                const cues = section.cues
                    .map((cue) => ({
                        t: Number(cue.t) || 0,
                        w: asStringIds(cue.w),
                    }))
                    .filter((cue) => cue.w.length > 0)
                    .sort((a, b) => a.t - b.t);
                if (cues.length) sections.push({ label, cues });
                continue;
            }
            if (Array.isArray(section.words) && section.words.length > 0) {
                const cues: EmusicCue[] = section.words
                    .map((word) => {
                        const id = ensureWord(String(word.w || ""));
                        if (!id) return null;
                        return { t: Number(word.t) || 0, w: [id] };
                    })
                    .filter((cue): cue is EmusicCue => cue !== null)
                    .sort((a, b) => a.t - b.t);
                if (cues.length) sections.push({ label, cues });
            }
        }
        return { lexicon, sections };
    }

    if (Array.isArray(doc.words) && doc.words.length > 0) {
        const cues: EmusicCue[] = doc.words
            .map((word) => {
                const id = ensureWord(String(word.w || ""));
                if (!id) return null;
                return { t: Number(word.t) || 0, w: [id] };
            })
            .filter((cue): cue is EmusicCue => cue !== null)
            .sort((a, b) => a.t - b.t);
        return { lexicon, sections: cues.length ? [{ label: "I", cues }] : [] };
    }

    return { lexicon, sections: [] };
}

export function resolveEmusicSections(doc: EmusicDocument): ResolvedSection[] {
    const { lexicon, sections } = normalizeEmusicDocument(doc);
    return sections.map((section, sectionIndex) => {
        const words: ResolvedWord[] = [];
        section.cues.forEach((cue, cueIndex) => {
            const end = cueEndTime(section.cues, cueIndex);
            cue.w.forEach((id, wordIndex) => {
                const text = lexicon[id];
                if (!text) return;
                words.push({
                    id,
                    text,
                    t: cue.t,
                    end,
                    sectionIndex,
                    cueIndex,
                    occurrenceKey: `${sectionIndex}:${cueIndex}:${wordIndex}:${id}`,
                });
            });
        });
        return { label: section.label, words };
    });
}

export function flattenResolvedWords(sections: ResolvedSection[]): ResolvedWord[] {
    return sections.flatMap((section) => section.words);
}

export async function fetchEmusicForTrack(objectKey: string): Promise<EmusicDocument | null> {
    const url = emusicPublicUrl(objectKey);
    try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const data = (await res.json()) as EmusicDocument;
        if (data?.type !== "emusic") return null;
        if (!resolveEmusicSections(data).some((section) => section.words.length > 0)) return null;
        return data;
    } catch {
        return null;
    }
}

/** Global flattened word index active at `timeSec`, or -1. */
export function activeWordIndex(words: ResolvedWord[], timeSec: number): number {
    if (!words.length) return -1;
    for (let i = 0; i < words.length; i++) {
        if (timeSec >= words[i].t && timeSec < words[i].end) return i;
    }
    for (let i = words.length - 1; i >= 0; i--) {
        if (timeSec >= words[i].t) return i;
    }
    return -1;
}

/** Occurrence keys belonging to the active cue at `timeSec`. */
export function activeOccurrenceKeys(words: ResolvedWord[], timeSec: number): Set<string> {
    const keys = new Set<string>();
    const index = activeWordIndex(words, timeSec);
    if (index < 0) return keys;
    const active = words[index];
    for (const word of words) {
        if (word.sectionIndex === active.sectionIndex && word.cueIndex === active.cueIndex) {
            keys.add(word.occurrenceKey);
        }
    }
    return keys;
}

export function cloneEmusicDocument(doc: EmusicDocument): EmusicDocument {
    const { lexicon, sections } = normalizeEmusicDocument(doc);
    return {
        type: "emusic",
        version: 3,
        trackFile: doc.trackFile,
        title: doc.title,
        lexicon: { ...lexicon },
        sections: sections.map((section) => ({
            label: section.label,
            cues: section.cues.map((cue) => ({ t: cue.t, w: [...cue.w] })),
        })),
    };
}

export function serializeEmusicDocument(doc: EmusicDocument): string {
    return `${JSON.stringify(cloneEmusicDocument(doc), null, 2)}\n`;
}

function nextLexiconId(lexicon: EmusicLexicon): string {
    let max = 0;
    for (const key of Object.keys(lexicon)) {
        const n = Number(key);
        if (Number.isFinite(n)) max = Math.max(max, n);
    }
    return String(max + 1);
}

function parseOccurrence(occurrenceKey: string): {
    sectionIndex: number;
    cueIndex: number;
    wordIndex: number;
} | null {
    const [sectionRaw, cueRaw, wordRaw] = occurrenceKey.split(":");
    const sectionIndex = Number(sectionRaw);
    const cueIndex = Number(cueRaw);
    const wordIndex = Number(wordRaw);
    if (![sectionIndex, cueIndex, wordIndex].every((n) => Number.isFinite(n))) return null;
    return { sectionIndex, cueIndex, wordIndex };
}

function mutateNormalized(
    doc: EmusicDocument,
    mutate: (lexicon: EmusicLexicon, sections: EmusicSection[]) => void,
): EmusicDocument {
    const { lexicon, sections } = normalizeEmusicDocument(doc);
    const nextLexicon = { ...lexicon };
    const nextSections = sections.map((section) => ({
        label: section.label,
        cues: section.cues.map((cue) => ({ t: cue.t, w: [...cue.w] })),
    }));
    mutate(nextLexicon, nextSections);
    return {
        type: "emusic",
        version: 3,
        trackFile: doc.trackFile,
        title: doc.title,
        lexicon: nextLexicon,
        sections: nextSections,
    };
}

/** Update lexicon text and/or cue start time for one on-screen word. */
export function updateEmusicWord(
    doc: EmusicDocument,
    occurrenceKey: string,
    text: string,
    timeSec: number,
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const section = sections[loc.sectionIndex];
        const cue = section?.cues[loc.cueIndex];
        if (!cue) return;
        const id = cue.w[loc.wordIndex];
        if (!id) return;
        const trimmed = text.trim();
        if (trimmed) lexicon[id] = trimmed;
        cue.t = Math.max(0, Number.isFinite(timeSec) ? timeSec : cue.t);
        section.cues.sort((a, b) => a.t - b.t);
    });
}

export function deleteEmusicWord(doc: EmusicDocument, occurrenceKey: string): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (_lexicon, sections) => {
        const section = sections[loc.sectionIndex];
        const cue = section?.cues[loc.cueIndex];
        if (!cue) return;
        cue.w.splice(loc.wordIndex, 1);
        if (cue.w.length === 0) {
            section.cues.splice(loc.cueIndex, 1);
        }
    });
}

/** Insert a new single-word cue before the selected word (same section). */
export function insertEmusicWordBefore(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const section = sections[loc.sectionIndex];
        const cue = section?.cues[loc.cueIndex];
        if (!cue) return;
        const prevT = section.cues[loc.cueIndex - 1]?.t ?? Math.max(0, cue.t - 0.4);
        const t = Number(((prevT + cue.t) / 2).toFixed(3));
        const id = nextLexiconId(lexicon);
        lexicon[id] = text.trim() || "nueva";
        section.cues.splice(loc.cueIndex, 0, { t, w: [id] });
    });
}

/** Insert a new single-word cue after the selected word (before the next). */
export function insertEmusicWordAfter(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const section = sections[loc.sectionIndex];
        const cue = section?.cues[loc.cueIndex];
        if (!cue) return;
        const nextT = section.cues[loc.cueIndex + 1]?.t ?? cue.t + 0.4;
        const t = Number(((cue.t + nextT) / 2).toFixed(3));
        const id = nextLexiconId(lexicon);
        lexicon[id] = text.trim() || "nueva";
        section.cues.splice(loc.cueIndex + 1, 0, { t, w: [id] });
    });
}

export function downloadEmusicDocument(doc: EmusicDocument, fileName: string): void {
    const blob = new Blob([serializeEmusicDocument(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".emusic") ? fileName : `${fileName}.emusic`;
    a.click();
    URL.revokeObjectURL(url);
}
