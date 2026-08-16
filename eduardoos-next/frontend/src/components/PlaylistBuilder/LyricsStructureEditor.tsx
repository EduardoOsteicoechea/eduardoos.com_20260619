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
    removeEmusicLineWords,
    setEmusicBlockKind,
    updateEmusicLineWord,
    type EmusicBlockKind,
    type EmusicDocument,
} from "../../lib/emusic";
import "./LyricsStructureEditor.css";

interface LyricsStructureEditorProps {
    doc: EmusicDocument;
    onChange: (next: EmusicDocument) => void;
    onCommit: (next: EmusicDocument) => Promise<void> | void;
}

type FocusWord = {
    unitIndex: number;
    lineIndex: number;
    wordIndex: number;
};

function wordKey(unitIndex: number, lineIndex: number, wordIndex: number): string {
    return `${unitIndex}:${lineIndex}:${wordIndex}`;
}

function parseWordKey(key: string): FocusWord | null {
    const parts = key.split(":").map((part) => Number(part));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    return { unitIndex: parts[0], lineIndex: parts[1], wordIndex: parts[2] };
}

export default function LyricsStructureEditor({
    doc,
    onChange,
    onCommit,
}: LyricsStructureEditorProps) {
    const { unidades } = useMemo(() => normalizeEmusicDocument(doc), [doc]);
    const [blockKind, setBlockKind] = useState<EmusicBlockKind>("estrofa");
    const [focus, setFocus] = useState<FocusWord | null>(null);
    const [draftText, setDraftText] = useState("");
    const [draftTime, setDraftTime] = useState("0");
    const [draftEnd, setDraftEnd] = useState("0.45");
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
    const [anchorKey, setAnchorKey] = useState<string | null>(null);

    const flatWordKeys = useMemo(() => {
        const keys: string[] = [];
        unidades.forEach((unit, unitIndex) => {
            unit.l.forEach((line, lineIndex) => {
                line.p.forEach((_, wordIndex) => {
                    keys.push(wordKey(unitIndex, lineIndex, wordIndex));
                });
            });
        });
        return keys;
    }, [unidades]);

    useEffect(() => {
        if (!focus) return;
        const word = unidades[focus.unitIndex]?.l[focus.lineIndex]?.p[focus.wordIndex];
        if (!word) {
            setFocus(null);
            return;
        }
        setDraftText(word.t);
        setDraftTime(String(word.i));
        setDraftEnd(String(word.f));
    }, [focus, unidades]);

    useEffect(() => {
        const valid = new Set(flatWordKeys);
        setSelectedKeys((prev) => {
            let changed = false;
            const next = new Set<string>();
            for (const key of prev) {
                if (valid.has(key)) next.add(key);
                else changed = true;
            }
            return changed || next.size !== prev.size ? next : prev;
        });
        if (anchorKey && !valid.has(anchorKey)) setAnchorKey(null);
    }, [flatWordKeys, anchorKey]);

    async function commit(next: EmusicDocument): Promise<void> {
        const cloned = cloneEmusicDocument(next);
        onChange(cloned);
        await onCommit(cloned);
    }

    async function commitFocusedWord(): Promise<void> {
        if (!focus) return;
        const timeSec = Number(draftTime);
        const endSec = Number(draftEnd);
        const next = updateEmusicLineWord(
            doc,
            focus.unitIndex,
            focus.lineIndex,
            focus.wordIndex,
            draftText,
            Number.isFinite(timeSec) ? timeSec : 0,
            Number.isFinite(endSec) ? endSec : undefined,
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

    function clearSelection(): void {
        setSelectedKeys(new Set());
        setAnchorKey(null);
    }

    function selectRange(fromKey: string, toKey: string): void {
        const from = flatWordKeys.indexOf(fromKey);
        const to = flatWordKeys.indexOf(toKey);
        if (from < 0 || to < 0) {
            setSelectedKeys(new Set([toKey]));
            return;
        }
        const [start, end] = from <= to ? [from, to] : [to, from];
        setSelectedKeys(new Set(flatWordKeys.slice(start, end + 1)));
    }

    function onWordChipClick(
        e: React.MouseEvent,
        unitIndex: number,
        lineIndex: number,
        wordIndex: number,
    ): void {
        const key = wordKey(unitIndex, lineIndex, wordIndex);
        const multi = e.ctrlKey || e.metaKey;
        const range = e.shiftKey;

        if (multi) {
            e.preventDefault();
            setFocus(null);
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
            setAnchorKey(key);
            return;
        }

        if (range) {
            e.preventDefault();
            setFocus(null);
            if (anchorKey) selectRange(anchorKey, key);
            else setSelectedKeys(new Set([key]));
            setAnchorKey((prev) => prev ?? key);
            return;
        }

        clearSelection();
        setFocus({ unitIndex, lineIndex, wordIndex });
        setAnchorKey(key);
    }

    async function deleteSelectedWords(): Promise<void> {
        if (selectedKeys.size === 0) return;
        const targets = [...selectedKeys]
            .map(parseWordKey)
            .filter((t): t is FocusWord => t !== null);
        if (targets.length === 0) return;
        setFocus(null);
        clearSelection();
        await commit(removeEmusicLineWords(doc, targets));
    }

    const selectedCount = selectedKeys.size;

    return (
        <section className="lyrics-structure-editor" aria-label="Lyric structure editor">
            <header className="lyrics-structure-editor__header">
                <h3>Editor de estructura</h3>
                <p>
                    unidades → líneas → palabras <code>{`{ t, i, f }`}</code>. OK / Enter / Esc guarda
                    en S3.
                </p>
                <p className="lyrics-structure-editor__hint">
                    Clic = editar. Ctrl/Cmd+clic = seleccionar. Mayús+clic = rango. Luego elimina en
                    lote.
                </p>
            </header>

            {selectedCount > 0 ? (
                <div
                    className="lyrics-structure-editor__selection-bar"
                    role="toolbar"
                    aria-label="Selección de palabras"
                >
                    <span className="lyrics-structure-editor__selection-count">
                        {selectedCount} palabra{selectedCount === 1 ? "" : "s"} seleccionada
                        {selectedCount === 1 ? "" : "s"}
                    </span>
                    <button
                        type="button"
                        className="lyrics-structure-editor__btn"
                        onClick={clearSelection}
                    >
                        Limpiar selección
                    </button>
                    <button
                        type="button"
                        className="lyrics-structure-editor__btn lyrics-structure-editor__btn--danger"
                        onClick={() => void deleteSelectedWords()}
                    >
                        Eliminar seleccionadas
                    </button>
                </div>
            ) : null}

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
                            key={`unit-${unitIndex}`}
                            className="lyrics-structure-editor__block"
                        >
                            <div className="lyrics-structure-editor__block-bar">
                                <label className="lyrics-structure-editor__unit-kind">
                                    <select
                                        value={unit.t}
                                        aria-label={`Tipo de unidad ${unitIndex + 1}`}
                                        onChange={(e) => {
                                            const kind = e.target.value as EmusicBlockKind;
                                            void commit(setEmusicBlockKind(doc, unitIndex, kind));
                                        }}
                                    >
                                        {EMUSIC_BLOCK_KINDS.map((kind) => (
                                            <option key={kind} value={kind}>
                                                {kind}
                                            </option>
                                        ))}
                                    </select>
                                </label>
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
                                                const key = wordKey(unitIndex, lineIndex, wordIndex);
                                                const isSelected = selectedKeys.has(key);
                                                return (
                                                    <li key={key}>
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
                                                                <input
                                                                    type="number"
                                                                    step="0.001"
                                                                    min="0"
                                                                    value={draftEnd}
                                                                    onChange={(e) =>
                                                                        setDraftEnd(e.target.value)
                                                                    }
                                                                    onKeyDown={onWordKeyDown}
                                                                    aria-label="Fin en segundos"
                                                                    title="Fin (segundos)"
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
                                                                className={`lyrics-structure-editor__word-chip${isSelected ? " is-selected" : ""}`}
                                                                aria-pressed={isSelected}
                                                                onClick={(e) =>
                                                                    onWordChipClick(
                                                                        e,
                                                                        unitIndex,
                                                                        lineIndex,
                                                                        wordIndex,
                                                                    )
                                                                }
                                                            >
                                                                <span>{word.t}</span>
                                                                <small>
                                                                    {word.i.toFixed(2)}–{word.f.toFixed(2)}s
                                                                </small>
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
