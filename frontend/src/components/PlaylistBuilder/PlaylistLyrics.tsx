import { useEffect, useMemo, useRef, useState } from "react";
import {
    activeOccurrenceKeys,
    cloneEmusicDocument,
    deleteEmusicWord,
    emptyEmusicDocument,
    fetchEmusicForTrack,
    flattenResolvedWords,
    insertEmusicWordAfter,
    insertEmusicWordBefore,
    resolveEmusicSections,
    trackLyricsSlug,
    updateEmusicWord,
    type EmusicDocument,
    type ResolvedWord,
} from "../../lib/emusic";
import { saveEmusicToCloud } from "../../lib/emusicCloud";
import { getAuthEmailFromToken, isApsAdminEmail } from "../../lib/auth";
import { isLocalTrackKey, trackDisplayName } from "../../lib/mediaLibrary";
import LyricsStructureEditor from "./LyricsStructureEditor";
import "./PlaylistLyrics.css";

interface PlaylistLyricsProps {
    trackKey: string | null;
    currentTime: number;
}

export default function PlaylistLyrics({ trackKey, currentTime }: PlaylistLyricsProps) {
    const [doc, setDoc] = useState<EmusicDocument | null>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "missing" | "ready">("idle");
    const [canEdit, setCanEdit] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [draftWord, setDraftWord] = useState("");
    const [draftTimeSec, setDraftTimeSec] = useState("0");
    const [undoStack, setUndoStack] = useState<EmusicDocument[]>([]);
    const [saveStatus, setSaveStatus] = useState("");
    const activeRef = useRef<HTMLSpanElement | null>(null);
    const savingRef = useRef(false);

    useEffect(() => {
        setCanEdit(isApsAdminEmail(getAuthEmailFromToken()));
    }, [trackKey]);

    useEffect(() => {
        let cancelled = false;
        if (!trackKey || isLocalTrackKey(trackKey)) {
            setDoc(null);
            setSelectedKey(null);
            setUndoStack([]);
            setSaveStatus("");
            setStatus(!trackKey ? "idle" : "missing");
            return;
        }
        setStatus("loading");
        setSelectedKey(null);
        setUndoStack([]);
        setSaveStatus("");
        void fetchEmusicForTrack(trackKey).then((loaded) => {
            if (cancelled) return;
            if (!loaded) {
                if (isApsAdminEmail(getAuthEmailFromToken())) {
                    const title = trackDisplayName(trackKey).replace(/\.mp3$/i, "");
                    setDoc(
                        emptyEmusicDocument(
                            trackDisplayName(trackKey),
                            title,
                        ),
                    );
                    setStatus("ready");
                    return;
                }
                setDoc(null);
                setStatus("missing");
                return;
            }
            setDoc(cloneEmusicDocument(loaded));
            setStatus("ready");
        });
        return () => {
            cancelled = true;
        };
    }, [trackKey]);

    const sections = useMemo(() => (doc ? resolveEmusicSections(doc) : []), [doc]);
    const flatWords = useMemo(() => flattenResolvedWords(sections), [sections]);
    const activeKeys = useMemo(
        () => activeOccurrenceKeys(flatWords, currentTime),
        [flatWords, currentTime],
    );
    const scrollKey = useMemo(() => {
        for (const word of flatWords) {
            if (activeKeys.has(word.occurrenceKey)) return word.occurrenceKey;
        }
        return "";
    }, [flatWords, activeKeys]);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [scrollKey]);

    const selectedWord: ResolvedWord | null = useMemo(() => {
        if (!selectedKey) return null;
        return flatWords.find((word) => word.occurrenceKey === selectedKey) ?? null;
    }, [flatWords, selectedKey]);

    useEffect(() => {
        if (!selectedWord) return;
        setDraftWord(selectedWord.text);
        setDraftTimeSec(String(selectedWord.t));
    }, [selectedWord]);

    const title =
        doc?.title?.trim() ||
        (trackKey ? trackDisplayName(trackKey).replace(/\.mp3$/i, "") : "");
    const slug = trackKey ? trackLyricsSlug(trackKey) : "";

    function pushUndo(from: EmusicDocument): void {
        setUndoStack((stack) => [...stack, cloneEmusicDocument(from)].slice(-40));
    }

    async function persistDoc(next: EmusicDocument): Promise<void> {
        if (!slug || savingRef.current) return;
        savingRef.current = true;
        setSaveStatus("Guardando en S3…");
        try {
            const saved = await saveEmusicToCloud(slug, next);
            setDoc(saved);
            setSaveStatus("Guardado en emusic_files/");
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setSaveStatus(`Error al guardar: ${message}`);
            throw err;
        } finally {
            savingRef.current = false;
        }
    }

    function selectWord(word: ResolvedWord): void {
        if (!canEdit) return;
        setSelectedKey(word.occurrenceKey);
    }

    async function applyOk(): Promise<void> {
        if (!doc || !selectedKey) return;
        const timeSec = Number(draftTimeSec);
        pushUndo(doc);
        const next = updateEmusicWord(
            doc,
            selectedKey,
            draftWord,
            Number.isFinite(timeSec) ? timeSec : 0,
        );
        setDoc(next);
        setSelectedKey(null);
        try {
            await persistDoc(next);
        } catch {
            // status already set
        }
    }

    function handleUndo(): void {
        setUndoStack((stack) => {
            if (stack.length === 0) return stack;
            const prev = stack[stack.length - 1];
            setDoc(cloneEmusicDocument(prev));
            void persistDoc(prev).catch(() => undefined);
            return stack.slice(0, -1);
        });
    }

    async function handleDelete(): Promise<void> {
        if (!doc || !selectedKey) return;
        pushUndo(doc);
        const next = deleteEmusicWord(doc, selectedKey);
        setDoc(next);
        setSelectedKey(null);
        try {
            await persistDoc(next);
        } catch {
            // status already set
        }
    }

    async function handleAddBeforeCurrent(): Promise<void> {
        if (!doc || !selectedKey) return;
        pushUndo(doc);
        const next = insertEmusicWordBefore(doc, selectedKey, draftWord.trim() || "nueva");
        setDoc(next);
        setSelectedKey(null);
        try {
            await persistDoc(next);
        } catch {
            // status already set
        }
    }

    async function handleAddBeforeNext(): Promise<void> {
        if (!doc || !selectedKey) return;
        pushUndo(doc);
        const next = insertEmusicWordAfter(doc, selectedKey, draftWord.trim() || "nueva");
        setDoc(next);
        setSelectedKey(null);
        try {
            await persistDoc(next);
        } catch {
            // status already set
        }
    }

    function onTrayKeyDown(e: React.KeyboardEvent): void {
        if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            void applyOk();
        }
    }

    const trayOpen = canEdit && Boolean(selectedKey && selectedWord);

    return (
        <>
            <section
                className={`playlist-lyrics${trayOpen ? " playlist-lyrics--editing" : ""}${canEdit ? " playlist-lyrics--editable" : ""}`}
                aria-label="Lyrics"
            >
                {!trackKey ? (
                    <p className="playlist-lyrics__empty">Selecciona o reproduce una canción.</p>
                ) : status === "loading" ? (
                    <p className="playlist-lyrics__empty">Cargando…</p>
                ) : status === "missing" ? (
                    <p className="playlist-lyrics__empty">
                        {trackKey && isLocalTrackKey(trackKey) ? (
                            "Local session track — no lyrics."
                        ) : (
                            <>
                                Sin archivo <code>.emusic</code> para esta pista.
                            </>
                        )}
                    </p>
                ) : (
                    <div className="playlist-lyrics__scroll">
                        <h3 className="playlist-lyrics__title">{title}</h3>
                        {sections.length === 0 ? (
                            <p className="playlist-lyrics__empty">Sin palabras aún.</p>
                        ) : (
                            sections.map((section) => (
                                <div
                                    key={`${section.label}-${section.words[0]?.occurrenceKey ?? section.label}`}
                                    className="playlist-lyrics__section"
                                >
                                    <p className="playlist-lyrics__section-label">[{section.label}]</p>
                                    {section.lines.map((line) => (
                                        <p
                                            key={`${section.label}-line-${line.lineIndex}`}
                                            className="playlist-lyrics__section-words"
                                        >
                                            {line.words.length === 0 ? (
                                                <span className="playlist-lyrics__empty-line"> </span>
                                            ) : (
                                                line.words.map((word) => {
                                                    const isActive = activeKeys.has(word.occurrenceKey);
                                                    const isSelected = selectedKey === word.occurrenceKey;
                                                    return (
                                                        <span
                                                            key={word.occurrenceKey}
                                                            ref={
                                                                word.occurrenceKey === scrollKey
                                                                    ? activeRef
                                                                    : undefined
                                                            }
                                                            role={canEdit ? "button" : undefined}
                                                            tabIndex={canEdit ? 0 : undefined}
                                                            className={`playlist-lyrics__word${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}${canEdit ? " is-editable" : ""}`}
                                                            onClick={() => selectWord(word)}
                                                            onKeyDown={(e) => {
                                                                if (!canEdit) return;
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    selectWord(word);
                                                                }
                                                            }}
                                                        >
                                                            {word.text}{" "}
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </p>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {trayOpen && selectedWord ? (
                    <div className="lyrics-edit-tray" role="dialog" aria-label="Edit lyric word">
                        <div className="element_edit_tray_buttons_container lyrics-edit-tray__buttons">
                            <button
                                type="button"
                                className="edit_tray_icon_button edit_tray_close_button lyrics-edit-tray__text-btn"
                                title="OK — apply and save to S3"
                                onClick={() => void applyOk()}
                            >
                                OK
                            </button>
                            <button
                                type="button"
                                className="edit_tray_icon_button lyrics-edit-tray__text-btn"
                                title="Undo"
                                onClick={handleUndo}
                                disabled={undoStack.length === 0}
                            >
                                Undo
                            </button>
                            <button
                                type="button"
                                className="edit_tray_icon_button lyrics-edit-tray__text-btn"
                                title="Add word before current"
                                onClick={() => void handleAddBeforeCurrent()}
                            >
                                + before
                            </button>
                            <button
                                type="button"
                                className="edit_tray_icon_button lyrics-edit-tray__text-btn"
                                title="Add word before next (after current)"
                                onClick={() => void handleAddBeforeNext()}
                            >
                                + before next
                            </button>
                            <button
                                type="button"
                                className="edit_tray_icon_button edit_tray_delete_button lyrics-edit-tray__text-btn"
                                title="Delete word"
                                onClick={() => void handleDelete()}
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                className="edit_tray_icon_button lyrics-edit-tray__text-btn"
                                title="Close tray"
                                onClick={() => setSelectedKey(null)}
                            >
                                Close
                            </button>
                        </div>
                        <div className="lyrics-edit-tray__fields">
                            <label className="lyrics-edit-tray__field">
                                <span>Palabra</span>
                                <input
                                    type="text"
                                    value={draftWord}
                                    onChange={(e) => setDraftWord(e.target.value)}
                                    onKeyDown={onTrayKeyDown}
                                    autoComplete="off"
                                />
                            </label>
                            <label className="lyrics-edit-tray__field">
                                <span>Tiempo de inicio (segundos)</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.001"
                                    min="0"
                                    value={draftTimeSec}
                                    onChange={(e) => setDraftTimeSec(e.target.value)}
                                    onKeyDown={onTrayKeyDown}
                                />
                            </label>
                        </div>
                        {saveStatus ? <p className="lyrics-edit-tray__status">{saveStatus}</p> : null}
                    </div>
                ) : null}
            </section>

            {canEdit && doc && trackKey && !isLocalTrackKey(trackKey) ? (
                <LyricsStructureEditor
                    doc={doc}
                    onChange={(next) => {
                        pushUndo(doc);
                        setDoc(next);
                    }}
                    onCommit={async (next) => {
                        await persistDoc(next);
                    }}
                    saveStatus={saveStatus}
                />
            ) : null}
        </>
    );
}
