import { useEffect, useMemo, useState } from "react";
import {
    addEmusicBlock,
    addEmusicLine,
    addEmusicLineWord,
    cloneEmusicDocument,
    EMUSIC_BLOCK_KINDS,
    normalizeEmusicDocument,
    removeEmusicBlock,
    removeEmusicLine,
    removeEmusicLineWord,
    updateEmusicLineWord,
    type EmusicBlockKind,
    type EmusicDocument,
} from "../../lib/emusic";
import "./LyricsStructureEditor.css";

interface LyricsStructureEditorProps {
    doc: EmusicDocument;
    onChange: (next: EmusicDocument) => void;
    onCommit: (next: EmusicDocument) => Promise<void> | void;
    saveStatus?: string;
}

type FocusWord = {
    sectionIndex: number;
    lineIndex: number;
    cueIndex: number;
};

export default function LyricsStructureEditor({
    doc,
    onChange,
    onCommit,
    saveStatus = "",
}: LyricsStructureEditorProps) {
    const normalized = useMemo(() => normalizeEmusicDocument(doc), [doc]);
    const [blockKind, setBlockKind] = useState<EmusicBlockKind>("estrofa");
    const [focus, setFocus] = useState<FocusWord | null>(null);
    const [draftText, setDraftText] = useState("");
    const [draftTime, setDraftTime] = useState("0");

    useEffect(() => {
        if (!focus) return;
        const cue = normalized.sections[focus.sectionIndex]?.lines[focus.lineIndex]?.cues[focus.cueIndex];
        if (!cue) {
            setFocus(null);
            return;
        }
        const id = cue.w[0];
        setDraftText((id && normalized.lexicon[id]) || "");
        setDraftTime(String(cue.t));
    }, [focus, normalized]);

    async function commit(next: EmusicDocument): Promise<void> {
        const cloned = cloneEmusicDocument(next);
        onChange(cloned);
        await onCommit(cloned);
    }

    async function commitFocusedWord(): Promise<void> {
        if (!focus) return;
        const timeSec = Number(draftTime);
        const next = updateEmusicLineWord(
            doc,
            focus.sectionIndex,
            focus.lineIndex,
            focus.cueIndex,
            draftText,
            Number.isFinite(timeSec) ? timeSec : 0,
        );
        setFocus(null);
        await commit(next);
    }

    function onWordKeyDown(e: React.KeyboardEvent): void {
        if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            void commitFocusedWord();
        }
    }

    return (
        <section className="lyrics-structure-editor" aria-label="Lyric structure editor">
            <header className="lyrics-structure-editor__header">
                <h3>Editor de estructura</h3>
                <p>Bloques → líneas → palabras. OK / Enter / Esc guarda en S3.</p>
                {saveStatus ? <p className="lyrics-structure-editor__status">{saveStatus}</p> : null}
            </header>

            <div className="lyrics-structure-editor__add-block">
                <label>
                    Tipo de bloque
                    <select
                        value={blockKind}
                        onChange={(e) => setBlockKind(e.target.value as EmusicBlockKind)}
                    >
                        {EMUSIC_BLOCK_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                                {kind}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="lyrics-structure-editor__btn"
                    onClick={() => {
                        void commit(addEmusicBlock(doc, blockKind));
                    }}
                >
                    + Bloque
                </button>
            </div>

            <div className="lyrics-structure-editor__blocks">
                {normalized.sections.length === 0 ? (
                    <p className="lyrics-structure-editor__empty">Sin bloques. Añade un bloque para empezar.</p>
                ) : (
                    normalized.sections.map((section, sectionIndex) => (
                        <article key={`block-${sectionIndex}-${section.label}`} className="lyrics-structure-editor__block">
                            <div className="lyrics-structure-editor__block-bar">
                                <strong>
                                    [{section.label}] {section.kind || "estrofa"}
                                </strong>
                                <div className="lyrics-structure-editor__row-actions">
                                    <button
                                        type="button"
                                        className="lyrics-structure-editor__btn"
                                        title="Add line"
                                        onClick={() => void commit(addEmusicLine(doc, sectionIndex))}
                                    >
                                        + línea
                                    </button>
                                    <button
                                        type="button"
                                        className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                                        title="Remove block"
                                        onClick={() => void commit(removeEmusicBlock(doc, sectionIndex))}
                                    >
                                        − bloque
                                    </button>
                                </div>
                            </div>

                            {section.lines.map((line, lineIndex) => (
                                <div key={`line-${sectionIndex}-${lineIndex}`} className="lyrics-structure-editor__line">
                                    <div className="lyrics-structure-editor__line-bar">
                                        <span>Línea {lineIndex + 1}</span>
                                        <div className="lyrics-structure-editor__row-actions">
                                            <button
                                                type="button"
                                                className="lyrics-structure-editor__btn"
                                                onClick={() =>
                                                    void commit(addEmusicLineWord(doc, sectionIndex, lineIndex))
                                                }
                                            >
                                                + palabra
                                            </button>
                                            <button
                                                type="button"
                                                className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                                                onClick={() =>
                                                    void commit(removeEmusicLine(doc, sectionIndex, lineIndex))
                                                }
                                            >
                                                − línea
                                            </button>
                                        </div>
                                    </div>

                                    <ul className="lyrics-structure-editor__words">
                                        {line.cues.length === 0 ? (
                                            <li className="lyrics-structure-editor__empty">Sin palabras</li>
                                        ) : (
                                            line.cues.map((cue, cueIndex) => {
                                                const id = cue.w[0];
                                                const text = (id && normalized.lexicon[id]) || "…";
                                                const isFocused =
                                                    focus?.sectionIndex === sectionIndex &&
                                                    focus?.lineIndex === lineIndex &&
                                                    focus?.cueIndex === cueIndex;
                                                return (
                                                    <li key={`cue-${sectionIndex}-${lineIndex}-${cueIndex}`}>
                                                        {isFocused ? (
                                                            <div className="lyrics-structure-editor__word-edit">
                                                                <input
                                                                    type="text"
                                                                    value={draftText}
                                                                    onChange={(e) => setDraftText(e.target.value)}
                                                                    onKeyDown={onWordKeyDown}
                                                                    autoFocus
                                                                    aria-label="Palabra"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    step="0.001"
                                                                    min="0"
                                                                    value={draftTime}
                                                                    onChange={(e) => setDraftTime(e.target.value)}
                                                                    onKeyDown={onWordKeyDown}
                                                                    aria-label="Tiempo en segundos"
                                                                    title="Tiempo de inicio (segundos)"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="lyrics-structure-editor__btn lyrics-structure-editor__btn--ok"
                                                                    onClick={() => void commitFocusedWord()}
                                                                >
                                                                    OK
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                                                                    onClick={() => {
                                                                        setFocus(null);
                                                                        void commit(
                                                                            removeEmusicLineWord(
                                                                                doc,
                                                                                sectionIndex,
                                                                                lineIndex,
                                                                                cueIndex,
                                                                            ),
                                                                        );
                                                                    }}
                                                                >
                                                                    −
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="lyrics-structure-editor__word-chip"
                                                                onClick={() => {
                                                                    setFocus({ sectionIndex, lineIndex, cueIndex });
                                                                }}
                                                            >
                                                                <span>{text}</span>
                                                                <small>{cue.t.toFixed(2)}s</small>
                                                            </button>
                                                        )}
                                                    </li>
                                                );
                                            })
                                        )}
                                    </ul>
                                </div>
                            ))}
                        </article>
                    ))
                )}
            </div>
        </section>
    );
}
