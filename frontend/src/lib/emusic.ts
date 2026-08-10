/**
 * .emusic — timed lyric sections for karaoke-style highlighting + structure editing.
 *
 * v3 shape (preferred):
 * {
 *   "type": "emusic",
 *   "version": 3,
 *   "title": "Song title",
 *   "lexicon": { "1": "mis", "2": "iniquidades" },
 *   "sections": [
 *     {
 *       "label": "I",
 *       "kind": "estrofa",
 *       "lines": [
 *         { "cues": [ { "t": 0.0, "w": ["1"] }, { "t": 0.5, "w": ["2"] } ] }
 *       ]
 *     }
 *   ]
 * }
 *
 * Duration of a cue is next cue start minus this start (across the section).
 */
import { trackDisplayName } from "./mediaLibrary";

export type EmusicLexicon = Record<string, string>;
export type EmusicBlockKind = "estrofa" | "coro" | "precoro" | "puente";

export interface EmusicCue {
    /** Highlight start time in seconds. */
    t: number;
    /** Lexicon word ids active for this cue. */
    w: string[];
}

export interface EmusicLine {
    cues: EmusicCue[];
}

export interface EmusicSection {
    /** Display label without brackets, e.g. "I", "CORO", "PUENTE". */
    label: string;
    kind?: EmusicBlockKind;
    lines: EmusicLine[];
}

export interface EmusicDocument {
    type: "emusic";
    version: number;
    trackFile?: string;
    title?: string;
    lexicon?: EmusicLexicon;
    sections?: EmusicSection[];
    /** Legacy flat timed words. */
    words?: LegacyEmusicWord[];
}

interface LegacyEmusicWord {
    t: number;
    d?: number;
    w: string;
}

interface LegacySection {
    label: string;
    kind?: EmusicBlockKind;
    lines?: EmusicLine[];
    cues?: EmusicCue[];
    words?: LegacyEmusicWord[];
}

export interface ResolvedWord {
    id: string;
    text: string;
    t: number;
    end: number;
    sectionIndex: number;
    lineIndex: number;
    cueIndex: number;
    occurrenceKey: string;
}

export interface ResolvedSection {
    label: string;
    kind?: EmusicBlockKind;
    words: ResolvedWord[];
}

export const EMUSIC_BLOCK_KINDS: EmusicBlockKind[] = ["estrofa", "coro", "precoro", "puente"];

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

function asStringIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => String(item).trim())
        .filter(Boolean);
}

function flattenSectionCues(section: EmusicSection): EmusicCue[] {
    return section.lines.flatMap((line) => line.cues);
}

function cueEndTime(cues: EmusicCue[], index: number): number {
    const start = cues[index]?.t ?? 0;
    const next = cues[index + 1]?.t;
    if (typeof next === "number" && Number.isFinite(next) && next > start) {
        return next;
    }
    return start + 0.45;
}

function defaultLabelForKind(kind: EmusicBlockKind, index: number): string {
    if (kind === "coro") return "CORO";
    if (kind === "precoro") return "PRECORO";
    if (kind === "puente") return "PUENTE";
    const n = index + 1;
    if (n <= 3) return ["I", "II", "III"][n - 1];
    return String(n);
}

/** Normalize any supported .emusic version into lexicon + lined sections. */
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

    const cuesFromLegacyWords = (words: LegacyEmusicWord[]): EmusicCue[] =>
        words
            .map((word) => {
                const id = ensureWord(String(word.w || ""));
                if (!id) return null;
                return { t: Number(word.t) || 0, w: [id] };
            })
            .filter((cue): cue is EmusicCue => cue !== null)
            .sort((a, b) => a.t - b.t);

    const rawSections = Array.isArray(doc.sections) ? (doc.sections as LegacySection[]) : [];
    if (rawSections.length > 0) {
        const sections: EmusicSection[] = [];
        for (const section of rawSections) {
            const label = String(section.label || "I").trim() || "I";
            const kind = section.kind;
            if (Array.isArray(section.lines) && section.lines.length > 0) {
                const lines = section.lines
                    .map((line) => ({
                        cues: (Array.isArray(line.cues) ? line.cues : [])
                            .map((cue) => ({
                                t: Number(cue.t) || 0,
                                w: asStringIds(cue.w),
                            }))
                            .filter((cue) => cue.w.length > 0)
                            .sort((a, b) => a.t - b.t),
                    }))
                    .filter((line) => line.cues.length > 0);
                if (lines.length) sections.push({ label, kind, lines });
                continue;
            }
            if (Array.isArray(section.cues) && section.cues.length > 0) {
                const cues = section.cues
                    .map((cue) => ({
                        t: Number(cue.t) || 0,
                        w: asStringIds(cue.w),
                    }))
                    .filter((cue) => cue.w.length > 0)
                    .sort((a, b) => a.t - b.t);
                if (cues.length) sections.push({ label, kind, lines: [{ cues }] });
                continue;
            }
            if (Array.isArray(section.words) && section.words.length > 0) {
                const cues = cuesFromLegacyWords(section.words);
                if (cues.length) sections.push({ label, kind, lines: [{ cues }] });
            }
        }
        return { lexicon, sections };
    }

    if (Array.isArray(doc.words) && doc.words.length > 0) {
        const cues = cuesFromLegacyWords(doc.words);
        return { lexicon, sections: cues.length ? [{ label: "I", kind: "estrofa", lines: [{ cues }] }] : [] };
    }

    return { lexicon, sections: [] };
}

export function resolveEmusicSections(doc: EmusicDocument): ResolvedSection[] {
    const { lexicon, sections } = normalizeEmusicDocument(doc);
    return sections.map((section, sectionIndex) => {
        const flatCues = flattenSectionCues(section);
        const words: ResolvedWord[] = [];
        let flatCueCursor = 0;
        section.lines.forEach((line, lineIndex) => {
            line.cues.forEach((cue, cueIndex) => {
                const end = cueEndTime(flatCues, flatCueCursor);
                cue.w.forEach((id, wordIndex) => {
                    const text = lexicon[id];
                    if (!text) return;
                    words.push({
                        id,
                        text,
                        t: cue.t,
                        end,
                        sectionIndex,
                        lineIndex,
                        cueIndex,
                        occurrenceKey: `${sectionIndex}:${lineIndex}:${cueIndex}:${wordIndex}:${id}`,
                    });
                });
                flatCueCursor += 1;
            });
        });
        return { label: section.label, kind: section.kind, words };
    });
}

export function flattenResolvedWords(sections: ResolvedSection[]): ResolvedWord[] {
    return sections.flatMap((section) => section.words);
}

export async function fetchEmusicForTrack(objectKey: string): Promise<EmusicDocument | null> {
    const slug = trackLyricsSlug(objectKey);
    const urls = [emusicCloudFileUrl(slug), emusicPublicUrl(objectKey)];
    for (const url of urls) {
        try {
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) continue;
            const data = (await res.json()) as EmusicDocument;
            if (data?.type !== "emusic") continue;
            if (!resolveEmusicSections(data).some((section) => section.words.length > 0) && !data.sections?.length) {
                // Allow empty structure docs for editing.
                if (!Array.isArray(data.sections)) continue;
            }
            return data;
        } catch {
            // try next source
        }
    }
    return null;
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
    const active = words[index];
    for (const word of words) {
        if (
            word.sectionIndex === active.sectionIndex &&
            word.lineIndex === active.lineIndex &&
            word.cueIndex === active.cueIndex
        ) {
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
            kind: section.kind,
            lines: section.lines.map((line) => ({
                cues: line.cues.map((cue) => ({ t: cue.t, w: [...cue.w] })),
            })),
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
    lineIndex: number;
    cueIndex: number;
    wordIndex: number;
} | null {
    const parts = occurrenceKey.split(":");
    if (parts.length < 4) return null;
    const sectionIndex = Number(parts[0]);
    const lineIndex = Number(parts[1]);
    const cueIndex = Number(parts[2]);
    const wordIndex = Number(parts[3]);
    if (![sectionIndex, lineIndex, cueIndex, wordIndex].every((n) => Number.isFinite(n))) return null;
    return { sectionIndex, lineIndex, cueIndex, wordIndex };
}

function mutateNormalized(
    doc: EmusicDocument,
    mutate: (lexicon: EmusicLexicon, sections: EmusicSection[]) => void,
): EmusicDocument {
    const { lexicon, sections } = normalizeEmusicDocument(doc);
    const nextLexicon = { ...lexicon };
    const nextSections = sections.map((section) => ({
        label: section.label,
        kind: section.kind,
        lines: section.lines.map((line) => ({
            cues: line.cues.map((cue) => ({ t: cue.t, w: [...cue.w] })),
        })),
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

export function updateEmusicWord(
    doc: EmusicDocument,
    occurrenceKey: string,
    text: string,
    timeSec: number,
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const cue = sections[loc.sectionIndex]?.lines[loc.lineIndex]?.cues[loc.cueIndex];
        if (!cue) return;
        const id = cue.w[loc.wordIndex];
        if (!id) return;
        const trimmed = text.trim();
        if (trimmed) lexicon[id] = trimmed;
        cue.t = Math.max(0, Number.isFinite(timeSec) ? timeSec : cue.t);
        sections[loc.sectionIndex].lines[loc.lineIndex].cues.sort((a, b) => a.t - b.t);
    });
}

export function deleteEmusicWord(doc: EmusicDocument, occurrenceKey: string): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (_lexicon, sections) => {
        const line = sections[loc.sectionIndex]?.lines[loc.lineIndex];
        const cue = line?.cues[loc.cueIndex];
        if (!line || !cue) return;
        cue.w.splice(loc.wordIndex, 1);
        if (cue.w.length === 0) line.cues.splice(loc.cueIndex, 1);
        if (line.cues.length === 0) sections[loc.sectionIndex].lines.splice(loc.lineIndex, 1);
    });
}

export function insertEmusicWordBefore(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const line = sections[loc.sectionIndex]?.lines[loc.lineIndex];
        const cue = line?.cues[loc.cueIndex];
        if (!line || !cue) return;
        const prevT = line.cues[loc.cueIndex - 1]?.t ?? Math.max(0, cue.t - 0.4);
        const t = Number(((prevT + cue.t) / 2).toFixed(3));
        const id = nextLexiconId(lexicon);
        lexicon[id] = text.trim() || "nueva";
        line.cues.splice(loc.cueIndex, 0, { t, w: [id] });
    });
}

export function insertEmusicWordAfter(
    doc: EmusicDocument,
    occurrenceKey: string,
    text = "nueva",
): EmusicDocument {
    const loc = parseOccurrence(occurrenceKey);
    if (!loc) return cloneEmusicDocument(doc);
    return mutateNormalized(doc, (lexicon, sections) => {
        const line = sections[loc.sectionIndex]?.lines[loc.lineIndex];
        const cue = line?.cues[loc.cueIndex];
        if (!line || !cue) return;
        const nextT = line.cues[loc.cueIndex + 1]?.t ?? cue.t + 0.4;
        const t = Number(((cue.t + nextT) / 2).toFixed(3));
        const id = nextLexiconId(lexicon);
        lexicon[id] = text.trim() || "nueva";
        line.cues.splice(loc.cueIndex + 1, 0, { t, w: [id] });
    });
}

export function addEmusicBlock(doc: EmusicDocument, kind: EmusicBlockKind): EmusicDocument {
    return mutateNormalized(doc, (_lexicon, sections) => {
        sections.push({
            label: defaultLabelForKind(kind, sections.length),
            kind,
            lines: [{ cues: [] }],
        });
    });
}

export function removeEmusicBlock(doc: EmusicDocument, sectionIndex: number): EmusicDocument {
    return mutateNormalized(doc, (_lexicon, sections) => {
        if (sectionIndex < 0 || sectionIndex >= sections.length) return;
        sections.splice(sectionIndex, 1);
    });
}

export function addEmusicLine(doc: EmusicDocument, sectionIndex: number): EmusicDocument {
    return mutateNormalized(doc, (_lexicon, sections) => {
        const section = sections[sectionIndex];
        if (!section) return;
        section.lines.push({ cues: [] });
    });
}

export function removeEmusicLine(doc: EmusicDocument, sectionIndex: number, lineIndex: number): EmusicDocument {
    return mutateNormalized(doc, (_lexicon, sections) => {
        const section = sections[sectionIndex];
        if (!section || lineIndex < 0 || lineIndex >= section.lines.length) return;
        section.lines.splice(lineIndex, 1);
        if (section.lines.length === 0) section.lines.push({ cues: [] });
    });
}

export function addEmusicLineWord(
    doc: EmusicDocument,
    sectionIndex: number,
    lineIndex: number,
    text = "nueva",
    timeSec?: number,
): EmusicDocument {
    return mutateNormalized(doc, (lexicon, sections) => {
        const line = sections[sectionIndex]?.lines[lineIndex];
        if (!line) return;
        const lastT = line.cues[line.cues.length - 1]?.t ?? 0;
        const t = Number.isFinite(timeSec as number) ? Number(timeSec) : Number((lastT + 0.4).toFixed(3));
        const id = nextLexiconId(lexicon);
        lexicon[id] = text.trim() || "nueva";
        line.cues.push({ t: Math.max(0, t), w: [id] });
        line.cues.sort((a, b) => a.t - b.t);
    });
}

export function removeEmusicLineWord(
    doc: EmusicDocument,
    sectionIndex: number,
    lineIndex: number,
    cueIndex: number,
): EmusicDocument {
    return mutateNormalized(doc, (_lexicon, sections) => {
        const line = sections[sectionIndex]?.lines[lineIndex];
        if (!line || cueIndex < 0 || cueIndex >= line.cues.length) return;
        line.cues.splice(cueIndex, 1);
    });
}

export function updateEmusicLineWord(
    doc: EmusicDocument,
    sectionIndex: number,
    lineIndex: number,
    cueIndex: number,
    text: string,
    timeSec: number,
): EmusicDocument {
    return mutateNormalized(doc, (lexicon, sections) => {
        const cue = sections[sectionIndex]?.lines[lineIndex]?.cues[cueIndex];
        if (!cue || !cue.w[0]) return;
        const trimmed = text.trim();
        if (trimmed) lexicon[cue.w[0]] = trimmed;
        cue.t = Math.max(0, Number.isFinite(timeSec) ? timeSec : cue.t);
        sections[sectionIndex].lines[lineIndex].cues.sort((a, b) => a.t - b.t);
    });
}

export function emptyEmusicDocument(trackFile?: string, title?: string): EmusicDocument {
    return {
        type: "emusic",
        version: 3,
        trackFile,
        title,
        lexicon: {},
        sections: [],
    };
}
