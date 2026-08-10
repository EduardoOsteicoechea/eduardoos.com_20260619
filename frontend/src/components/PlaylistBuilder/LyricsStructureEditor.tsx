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
    unitIndex: number;
    lineIndex: number;
    wordIndex: number;
};

export default function LyricsStructureEditor({
    doc,
    onChange,
    onCommit,
    saveStatus = "",
}: LyricsStructureEditorProps) {
    const { unidades } = useMemo(() => normalizeEmusicDocument(doc), [doc]);
    const [blockKind, setBlockKind] = useState<EmusicBlockKind>("estrofa");
    const [focus, setFocus] = useState<FocusWord | null>(null);
    const [draftText, setDraftText] = useState("");
    const [draftTime, setDraftTime] = useState("0");

    useEffect(() => {
        if (!focus) return;
        const word = unidades[focus.unitIndex]?.l[focus.lineIndex]?.p[focus.wordIndex];
        if (!word) {
            setFocus(null);
            return;
        }
        setDraftText(word.t);
        setDraftTime(String(word.i));
    }, [focus, unidades]);

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
            focus.unitIndex,
            focus.lineIndex,
            focus.wordIndex,
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
                <p>
                    unidades → líneas → palabras <code>{`{ t, i }`}</code>. OK / Enter / Esc guarda en
                    S3.
                </p>
                {saveStatus ? <p className="lyrics-structure-editor__status">{saveStatus}</p> : null}
            </header>

            <div className="lyrics-structure-editor__add-block">
                <label>
                    Tipo de unidad
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
                    + Unidad
                </button>
            </div>

            <div className="lyrics-structure-editor__blocks">
                {unidades.length === 0 ? (
                    <p className="lyrics-structure-editor__empty">
                        Sin unidades. Añade una unidad para empezar.
                    </p>
                ) : (
                    unidades.map((unit, unitIndex) => (
                        <article
                            key={`unit-${unitIndex}-${unit.t}`}
                            className="lyrics-structure-editor__block"
                        >
                            <div className="lyrics-structure-editor__block-bar">
                                <strong>
                                    unidad {unitIndex + 1}: {unit.t}
                                </strong>
                                <div className="lyrics-structure-editor__row-actions">
                                    <button
                                        type="button"
                                        className="lyrics-structure-editor__btn"
                                        title="Add line"
                                        onClick={() => void commit(addEmusicLine(doc, unitIndex))}
                                    >
                                        + línea
                                    </button>
                                    <button
                                        type="button"
                                        className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                                        title="Remove unit"
                                        onClick={() => void commit(removeEmusicBlock(doc, unitIndex))}
                                    >
                                        − unidad
                                    </button>
                                </div>
                            </div>

                            {unit.l.map((line, lineIndex) => (
                                <div
                                    key={`line-${unitIndex}-${lineIndex}`}
                                    className="lyrics-structure-editor__line"
                                >
                                    <div className="lyrics-structure-editor__line-bar">
                                        <span>Línea {lineIndex + 1}</span>
                                        <div className="lyrics-structure-editor__row-actions">
                                            <button
                                                type="button"
                                                className="lyrics-structure-editor__btn"
                                                onClick={() =>
                                                    void commit(
                                                        addEmusicLineWord(doc, unitIndex, lineIndex),
                                                    )
                                                }
                                            >
                                                + palabra
                                            </button>
                                            <button
                                                type="button"
                                                className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                                                onClick={() =>
                                                    void commit(
                                                        removeEmusicLine(doc, unitIndex, lineIndex),
                                                    )
                                                }
                                            >
                                                − línea
                                            </button>
                                        </div>
                                    </div>

                                    <ul className="lyrics-structure-editor__words">
                                        {line.p.length === 0 ? (
                                            <li className="lyrics-structure-editor__empty">
                                                Sin palabras
                                            </li>
                                        ) : (
                                            line.p.map((word, wordIndex) => {
                                                const isFocused =
                                                    focus?.unitIndex === unitIndex &&
                                                    focus?.lineIndex === lineIndex &&
                                                    focus?.wordIndex === wordIndex;
                                                return (
                                                    <li
                                                        key={`word-${unitIndex}-${lineIndex}-${wordIndex}`}
                                                    >
                                                        {isFocused ? (
                                                            <div className="lyrics-structure-editor__word-edit">
                                                                <input
                                                                    type="text"
                                                                    value={draftText}
                                                                    onChange={(e) =>
                                                                        setDraftText(e.target.value)
                                                                    }
                                                                    onKeyDown={onWordKeyDown}
                                                                    autoFocus
                                                                    aria-label="Texto"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    step="0.001"
                                                                    min="0"
                                                                    value={draftTime}
                                                                    onChange={(e) =>
                                                                        setDraftTime(e.target.value)
                                                                    }
                                                                    onKeyDown={onWordKeyDown}
                                                                    aria-label="Inicio en segundos"
                                                                    title="Inicio (segundos)"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="lyrics-structure-editor__btn lyrics-structure-editor__btn--ok"
                                                                    onClick={() =>
                                                                        void commitFocusedWord()
                                                                    }
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
                                                                                unitIndex,
                                                                                lineIndex,
                                                                                wordIndex,
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
                                                                    setFocus({
                                                                        unitIndex,
                                                                        lineIndex,
                                                                        wordIndex,
                                                                    });
                                                                }}
                                                            >
                                                                <span>{word.t}</span>
                                                                <small>{word.i.toFixed(2)}s</small>
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
