/**
 * .emusic — timed lyrics as nested units → lines → words.
 *
 * Canonical v4 shape (each word owns its own text + start time):
 * {
 *   "type": "emusic",
 *   "version": 4,
 *   "title": "Song title",
 *   "unidades": [
 *     {
 *       "t": "estrofa",
 *       "l": [
 *         { "p": [ { "t": "Es", "i": 0 }, { "t": "más", "i": 0.42 } ] }
 *       ]
 *     }
 *   ]
 * }
 *
 * Word highlight duration = next word start − this start (within the unit).
 * Legacy lexicon/sections/cues formats are migrated on load and always saved as v4.
 */
import { trackDisplayName } from "./mediaLibrary";

export type EmusicBlockKind = "estrofa" | "coro" | "precoro" | "puente";

/** One sung word: text + start time (seconds). */
export interface EmusicPalabra {
    t: string;
    i: number;
}

export interface EmusicLinea {
    p: EmusicPalabra[];
}

export interface EmusicUnidad {
    /** Block kind: estrofa | coro | precoro | puente */
    t: EmusicBlockKind;
    l: EmusicLinea[];
}

export interface EmusicDocument {
    type: "emusic";
    version: number;
    trackFile?: string;
    title?: string;
    unidades?: EmusicUnidad[];
    /** Legacy fields kept only for migration. */
    lexicon?: Record<string, string>;
    sections?: unknown[];
    words?: unknown[];
}

export interface ResolvedWord {
    text: string;
    t: number;
    end: number;
    unitIndex: number;
    lineIndex: number;
    wordIndex: number;
    occurrenceKey: string;
}

export interface ResolvedLine {
    lineIndex: number;
    words: ResolvedWord[];
}

export interface ResolvedSection {
    label: string;
    kind: EmusicBlockKind;
    lines: ResolvedLine[];
    words: ResolvedWord[];
}

export const EMUSIC_BLOCK_KINDS: EmusicBlockKind[] = ["estrofa", "coro", "precoro", "puente"];

const KIND_SET = new Set<string>(EMUSIC_BLOCK_KINDS);

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

export function emusicCloudFileUrl(slug: string): string {
    return `/api/media/file/emusic_files/${encodeURIComponent(slug)}.emusic`;
}

export function emusicApiUrl(slug: string): string {
    return `/api/emusic/${encodeURIComponent(slug)}`;
}

function asBlockKind(raw: unknown, fallback: EmusicBlockKind = "estrofa"): EmusicBlockKind {
    const value = String(raw || "")
        .trim()
        .toLowerCase();
    if (KIND_SET.has(value)) return value as EmusicBlockKind;
    if (value === "chorus" || value === "refrain") return "coro";
    if (value === "bridge") return "puente";
    if (value === "verse" || value === "estrofa") return "estrofa";
    return fallback;
}

function labelForKind(kind: EmusicBlockKind, estrofaOrdinal: number): string {
    if (kind === "coro") return "CORO";
    if (kind === "precoro") return "PRECORO";
    if (kind === "puente") return "PUENTE";
    if (estrofaOrdinal <= 3) return ["I", "II", "III"][estrofaOrdinal - 1];
    return String(estrofaOrdinal);
}

function kindFromLegacyLabel(label: string): EmusicBlockKind {
    const upper = label.trim().toUpperCase();
    if (upper.includes("PRECORO") || upper.includes("PRE-CORO")) return "precoro";
    if (upper.includes("CORO") || upper.includes("CHORUS")) return "coro";
    if (upper.includes("PUENTE") || upper.includes("BRIDGE")) return "puente";
    return "estrofa";
}

function wordEndTime(starts: number[], index: number): number {
    const start = starts[index] ?? 0;
    const next = starts[index + 1];
    if (typeof next === "number" && Number.isFinite(next) && next > start) return next;
    return start + 0.45;
}

function cloneUnidades(unidades: EmusicUnidad[]): EmusicUnidad[] {
    return unidades.map((unit) => ({
        t: unit.t,
        l: unit.l.map((line) => ({
            p: line.p.map((word) => ({ t: word.t, i: word.i })),
        })),
    }));
}

function parsePalabra(raw: unknown): EmusicPalabra | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const text = String(row.t ?? "").trim();
    if (!text) return null;
    const i = Number(row.i);
    return { t: text, i: Number.isFinite(i) ? Math.max(0, i) : 0 };
}

function parseLinea(raw: unknown): EmusicLinea {
    if (!raw || typeof raw !== "object") return { p: [] };
    const row = raw as Record<string, unknown>;
    const list = Array.isArray(row.p) ? row.p : [];
    return {
        p: list.map(parsePalabra).filter((word): word is EmusicPalabra => word !== null),
    };
}

function parseUnidad(raw: unknown): EmusicUnidad | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const lines = Array.isArray(row.l) ? row.l.map(parseLinea) : [{ p: [] }];
    return {
        t: asBlockKind(row.t),
        l: lines.length ? lines : [{ p: [] }],
    };
}

/** Migrate any supported .emusic version into canonical unidades. */
export function normalizeEmusicDocument(doc: EmusicDocument): {
    unidades: EmusicUnidad[];
} {
    if (Array.isArray(doc.unidades) && doc.unidades.length > 0) {
        const unidades = doc.unidades
            .map(parseUnidad)
            .filter((unit): unit is EmusicUnidad => unit !== null);
        return { unidades };
    }
    if (Array.isArray(doc.unidades)) {
        return { unidades: [] };
    }

    // Legacy v3: lexicon + sections (lines/cues or flat cues).
    const lexicon = { ...(doc.lexicon ?? {}) };
    const rawSections = Array.isArray(doc.sections) ? doc.sections : [];
    if (rawSections.length > 0) {
        const unidades: EmusicUnidad[] = [];
        for (const section of rawSections) {
            if (!section || typeof section !== "object") continue;
            const row = section as Record<string, unknown>;
            const label = String(row.label || "I");
            const kind = row.kind ? asBlockKind(row.kind) : kindFromLegacyLabel(label);
            const lines: EmusicLinea[] = [];

            if (Array.isArray(row.lines) && row.lines.length > 0) {
                for (const line of row.lines) {
                    if (!line || typeof line !== "object") {
                        lines.push({ p: [] });
                        continue;
                    }
                    const lineRow = line as Record<string, unknown>;
                    const cues = Array.isArray(lineRow.cues) ? lineRow.cues : [];
                    const p: EmusicPalabra[] = [];
                    for (const cue of cues) {
                        if (!cue || typeof cue !== "object") continue;
                        const cueRow = cue as Record<string, unknown>;
                        const start = Number(cueRow.t) || 0;
                        const ids = Array.isArray(cueRow.w) ? cueRow.w.map(String) : [];
                        for (const id of ids) {
                            const text = String(lexicon[id] ?? "").trim();
                            if (!text) continue;
                            p.push({ t: text, i: start });
                        }
                    }
                    lines.push({ p });
                }
            } else if (Array.isArray(row.cues) && row.cues.length > 0) {
                const p: EmusicPalabra[] = [];
                for (const cue of row.cues) {
                    if (!cue || typeof cue !== "object") continue;
                    const cueRow = cue as Record<string, unknown>;
                    const start = Number(cueRow.t) || 0;
                    const ids = Array.isArray(cueRow.w) ? cueRow.w.map(String) : [];
                    for (const id of ids) {
                        const text = String(lexicon[id] ?? "").trim();
                        if (!text) continue;
                        p.push({ t: text, i: start });
                    }
                }
                lines.push({ p });
            } else if (Array.isArray(row.words) && row.words.length > 0) {
                const p: EmusicPalabra[] = [];
                for (const word of row.words) {
                    if (!word || typeof word !== "object") continue;
                    const wordRow = word as Record<string, unknown>;
                    const text = String(wordRow.w ?? "").trim();
                    if (!text) continue;
                    p.push({ t: text, i: Number(wordRow.t) || 0 });
                }
                lines.push({ p });
            } else {
                lines.push({ p: [] });
            }

            unidades.push({ t: kind, l: lines.length ? lines : [{ p: [] }] });
        }
        return { unidades };
    }

    // Legacy flat words list.
    if (Array.isArray(doc.words) && doc.words.length > 0) {
        const p: EmusicPalabra[] = [];
        for (const word of doc.words) {
            if (!word || typeof word !== "object") continue;
            const wordRow = word as Record<string, unknown>;
            const text = String(wordRow.w ?? "").trim();
            if (!text) continue;
            p.push({ t: text, i: Number(wordRow.t) || 0 });
        }
        return {
            unidades: p.length ? [{ t: "estrofa", l: [{ p }] }] : [],
        };
    }

    return { unidades: [] };
}

export function resolveEmusicSections(doc: EmusicDocument): ResolvedSection[] {
    const { unidades } = normalizeEmusicDocument(doc);
    let estrofaOrdinal = 0;
    return unidades.map((unit, unitIndex) => {
        if (unit.t === "estrofa") estrofaOrdinal += 1;
        const label = labelForKind(unit.t, estrofaOrdinal);
        const flatStarts = unit.l.flatMap((line) => line.p.map((word) => word.i));
        const lines: ResolvedLine[] = [];
        const words: ResolvedWord[] = [];
        let flatCursor = 0;
        unit.l.forEach((line, lineIndex) => {
            const lineWords: ResolvedWord[] = [];
            line.p.forEach((word, wordIndex) => {
                const resolved: ResolvedWord = {
                    text: word.t,
                    t: word.i,
                    end: wordEndTime(flatStarts, flatCursor),
                    unitIndex,
                    lineIndex,
                    wordIndex,
                    occurrenceKey: `${unitIndex}:${lineIndex}:${wordIndex}`,
                };
                lineWords.push(resolved);
                words.push(resolved);
                flatCursor += 1;
            });
            lines.push({ lineIndex, words: lineWords });
        });
        return { label, kind: unit.t, lines, words };
    });
}

export function flattenResolvedWords(sections: ResolvedSection[]): ResolvedWord[] {
    return sections.flatMap((section) => section.words);
}

export async function fetchEmusicForTrack(objectKey: string): Promise<EmusicDocument | null> {
    const slug = trackLyricsSlug(objectKey);
    if (typeof navigator === "undefined" || navigator.onLine) {
        const urls = [emusicCloudFileUrl(slug), emusicPublicUrl(objectKey)];
        for (const url of urls) {
            try {
                const res = await fetch(url, { headers: { Accept: "application/json" } });
                if (!res.ok) continue;
                const data = (await res.json()) as EmusicDocument;
                if (data?.type !== "emusic") continue;
                const hasUnits = Array.isArray(data.unidades);
                const hasLegacy = Array.isArray(data.sections) || Array.isArray(data.words);
                if (!hasUnits && !hasLegacy) continue;
                try {
                    const { saveEmusicOffline } = await import("./offlineEmusic");
                    await saveEmusicOffline(objectKey, data);
                } catch {
                    // offline cache is best-effort
                }
                return data;
            } catch {
                // try next source
            }
        }
    }
    try {
        const { getEmusicOffline } = await import("./offlineEmusic");
        return await getEmusicOffline(objectKey);
    } catch {
        return null;
    }
}

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

export function activeOccurrenceKeys(words: ResolvedWord[], timeSec: number): Set<string> {
    const keys = new Set<string>();
    const index = activeWordIndex(words, timeSec);
    if (index < 0) return keys;
    keys.add(words[index].occurrenceKey);
    return keys;
}

export function cloneEmusicDocument(doc: EmusicDocument): EmusicDocument {
    const { unidades } = normalizeEmusicDocument(doc);
    return {
        type: "emusic",
        version: 4,
        trackFile: doc.trackFile,
        title: doc.title,
        unidades: cloneUnidades(unidades),
    };
}

export function serializeEmusicDocument(doc: EmusicDocument): string {
    return `${JSON.stringify(cloneEmusicDocument(doc), null, 2)}\n`;
}

function parseOccurrence(occurrenceKey: string): {
    unitIndex: number;
    lineIndex: number;
    wordIndex: number;
} | null {
    const parts = occurrenceKey.split(":");
    if (parts.length < 3) return null;
    const unitIndex = Number(parts[0]);
    const lineIndex = Number(parts[1]);
    const wordIndex = Number(parts[2]);
    if (![unitIndex, lineIndex, wordIndex].every((n) => Number.isFinite(n))) return null;
    return { unitIndex, lineIndex, wordIndex };
}

function mutateNormalized(
    doc: EmusicDocument,
    mutate: (unidades: EmusicUnidad[]) => void,
): EmusicDocument {
    const { unidades } = normalizeEmusicDocument(doc);
    const next = cloneUnidades(unidades);
    mutate(next);
    return {
        type: "emusic",
        version: 4,
        trackFile: doc.trackFile,
        title: doc.title,
        unidades: next,
    };
}

export function updateEmusicWord(
    doc: EmusicDocument,
    occurrenceKey: string,
    text: string,
    timeSec: number,
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (unidades) => {
        const word = unidades[loc.unitIndex]?.l[loc.lineIndex]?.p[loc.wordIndex];
        if (!word) return;
        const trimmed = text.trim();
        if (trimmed) word.t = trimmed;
        if (Number.isFinite(timeSec)) word.i = Math.max(0, timeSec);
    });
}

export function deleteEmusicWord(doc: EmusicDocument, occurrenceKey: string): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (unidades) => {
        const line = unidades[loc.unitIndex]?.l[loc.lineIndex];
        if (!line) return;
        line.p.splice(loc.wordIndex, 1);
    });
}

export function insertEmusicWordBefore(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (unidades) => {
        const line = unidades[loc.unitIndex]?.l[loc.lineIndex];
        const word = line?.p[loc.wordIndex];
        if (!line || !word) return;
        const prevI = line.p[loc.wordIndex - 1]?.i ?? Math.max(0, word.i - 0.4);
        const i = Number(((prevI + word.i) / 2).toFixed(3));
        line.p.splice(loc.wordIndex, 0, { t: text.trim() || "nueva", i });
    });
}

export function insertEmusicWordAfter(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (unidades) => {
        const line = unidades[loc.unitIndex]?.l[loc.lineIndex];
        const word = line?.p[loc.wordIndex];
        if (!line || !word) return;
        const nextI = line.p[loc.wordIndex + 1]?.i ?? word.i + 0.4;
        const i = Number(((word.i + nextI) / 2).toFixed(3));
        line.p.splice(loc.wordIndex + 1, 0, { t: text.trim() || "nueva", i });
    });
}

export function addEmusicBlock(doc: EmusicDocument, kind: EmusicBlockKind): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        unidades.push({ t: kind, l: [{ p: [] }] });
    });
}

export function setEmusicBlockKind(
    doc: EmusicDocument,
    unitIndex: number,
    kind: EmusicBlockKind,
): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const unit = unidades[unitIndex];
        if (!unit) return;
        unit.t = kind;
    });
}

export function removeEmusicBlock(doc: EmusicDocument, unitIndex: number): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        if (unitIndex < 0 || unitIndex >= unidades.length) return;
        unidades.splice(unitIndex, 1);
    });
}

export function addEmusicLine(doc: EmusicDocument, unitIndex: number): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const unit = unidades[unitIndex];
        if (!unit) return;
        unit.l.push({ p: [] });
    });
}

export function removeEmusicLine(
    doc: EmusicDocument,
    unitIndex: number,
    lineIndex: number,
): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const unit = unidades[unitIndex];
        if (!unit || lineIndex < 0 || lineIndex >= unit.l.length) return;
        unit.l.splice(lineIndex, 1);
        if (unit.l.length === 0) unit.l.push({ p: [] });
    });
}

export function addEmusicLineWord(
    doc: EmusicDocument,
    unitIndex: number,
    lineIndex: number,
    text = "nueva",
    timeSec?: number,
): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const line = unidades[unitIndex]?.l[lineIndex];
        if (!line) return;
        const lastI = line.p[line.p.length - 1]?.i ?? 0;
        const i = Number.isFinite(timeSec as number)
            ? Number(timeSec)
            : Number((lastI + 0.4).toFixed(3));
        line.p.push({ t: text.trim() || "nueva", i: Math.max(0, i) });
    });
}

export function removeEmusicLineWord(
    doc: EmusicDocument,
    unitIndex: number,
    lineIndex: number,
    wordIndex: number,
): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const line = unidades[unitIndex]?.l[lineIndex];
        if (!line || wordIndex < 0 || wordIndex >= line.p.length) return;
        line.p.splice(wordIndex, 1);
    });
}

export function updateEmusicLineWord(
    doc: EmusicDocument,
    unitIndex: number,
    lineIndex: number,
    wordIndex: number,
    text: string,
    timeSec: number,
): EmusicDocument {
    return mutateNormalized(doc, (unidades) => {
        const word = unidades[unitIndex]?.l[lineIndex]?.p[wordIndex];
        if (!word) return;
        const trimmed = text.trim();
        if (trimmed) word.t = trimmed;
        if (Number.isFinite(timeSec)) word.i = Math.max(0, timeSec);
    });
}

export function emptyEmusicDocument(trackFile?: string, title?: string): EmusicDocument {
    return {
        type: "emusic",
        version: 4,
        trackFile,
        title,
        unidades: [{ t: "estrofa", l: [{ p: [] }] }],
    };
}
