import { useEffect, useMemo, useRef, useState } from "react";
import {
    activeOccurrenceKeys,
    cloneEmusicDocument,
    deleteEmusicWord,
    downloadEmusicDocument,
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
import { getAuthEmailFromToken, isApsAdminEmail } from "../../lib/auth";
import { isLocalTrackKey, trackDisplayName } from "../../lib/mediaLibrary";
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
    const activeRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        setCanEdit(isApsAdminEmail(getAuthEmailFromToken()));
    }, [trackKey]);

    useEffect(() => {
        let cancelled = false;
        if (!trackKey || isLocalTrackKey(trackKey)) {
            setDoc(null);
            setSelectedKey(null);
            setUndoStack([]);
            setStatus(!trackKey ? "idle" : "missing");
            return;
        }
        setStatus("loading");
        setSelectedKey(null);
        setUndoStack([]);
        void fetchEmusicForTrack(trackKey).then((loaded) => {
            if (cancelled) return;
            if (!loaded) {
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

    function pushUndo(): void {
        if (!doc) return;
        setUndoStack((stack) => [...stack, cloneEmusicDocument(doc)].slice(-40));
    }

    function selectWord(word: ResolvedWord): void {
        if (!canEdit) return;
        setSelectedKey(word.occurrenceKey);
    }

    function applyOk(): void {
        if (!doc || !selectedKey) return;
        const timeSec = Number(draftTimeSec);
        pushUndo();
        const next = updateEmusicWord(
            doc,
            selectedKey,
            draftWord,
            Number.isFinite(timeSec) ? timeSec : 0,
        );
        setDoc(next);
        downloadEmusicDocument(next, `${trackLyricsSlug(trackKey || "lyrics")}.emusic`);
        setSelectedKey(null);
    }

    function handleUndo(): void {
        setUndoStack((stack) => {
            if (stack.length === 0) return stack;
            const prev = stack[stack.length - 1];
            setDoc(cloneEmusicDocument(prev));
            return stack.slice(0, -1);
        });
    }

    function handleDelete(): void {
        if (!doc || !selectedKey) return;
        pushUndo();
        const next = deleteEmusicWord(doc, selectedKey);
        setDoc(next);
        setSelectedKey(null);
    }

    function handleAddBeforeCurrent(): void {
        if (!doc || !selectedKey) return;
        pushUndo();
        const next = insertEmusicWordBefore(doc, selectedKey, draftWord.trim() || "nueva");
        setDoc(next);
        // Keep tray open on the nearest word after rebuild — clear selection to avoid stale keys.
        setSelectedKey(null);
    }

    function handleAddBeforeNext(): void {
        if (!doc || !selectedKey) return;
        pushUndo();
        const next = insertEmusicWordAfter(doc, selectedKey, draftWord.trim() || "nueva");
        setDoc(next);
        setSelectedKey(null);
    }

    const trayOpen = canEdit && Boolean(selectedKey && selectedWord);

    return (
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
                    {sections.map((section) => (
                        <div
                            key={`${section.label}-${section.words[0]?.occurrenceKey ?? "empty"}`}
                            className="playlist-lyrics__section"
                        >
                            <p className="playlist-lyrics__section-label">[{section.label}]</p>
                            <p className="playlist-lyrics__section-words">
                                {section.words.map((word) => {
                                    const isActive = activeKeys.has(word.occurrenceKey);
                                    const isSelected = selectedKey === word.occurrenceKey;
                                    return (
                                        <span
                                            key={word.occurrenceKey}
                                            ref={word.occurrenceKey === scrollKey ? activeRef : undefined}
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
                                })}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {trayOpen && selectedWord ? (
                <div className="lyrics-edit-tray" role="dialog" aria-label="Edit lyric word">
                    <div className="element_edit_tray_buttons_container lyrics-edit-tray__buttons">
                        <button
                            type="button"
                            className="edit_tray_icon_button edit_tray_close_button lyrics-edit-tray__text-btn"
                            title="OK — apply and download .emusic"
                            onClick={applyOk}
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
                            onClick={handleAddBeforeCurrent}
                        >
                            + before
                        </button>
                        <button
                            type="button"
                            className="edit_tray_icon_button lyrics-edit-tray__text-btn"
                            title="Add word before next (after current)"
                            onClick={handleAddBeforeNext}
                        >
                            + before next
                        </button>
                        <button
                            type="button"
                            className="edit_tray_icon_button edit_tray_delete_button lyrics-edit-tray__text-btn"
                            title="Delete word"
                            onClick={handleDelete}
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
                            />
                        </label>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
