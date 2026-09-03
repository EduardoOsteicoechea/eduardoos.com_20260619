/**
 * Scrib Institutes panel — Liber tabs → Caput number chips → paragraph number
 * chips → plain text only (no Copy buttons). Spec 056.
 */

import { useEffect, useMemo, useState } from "react";
import {
  chapterNavLabel,
  fetchParagraphChapter,
  fetchParagraphIndex,
  groupChaptersByLiber,
  type ParagraphChapterDoc,
  type ParagraphIndexChapter,
  type ParagraphUnit,
} from "../../lib/calvinsInstitutesParagraphs";

type ScribInstitutesModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ScribInstitutesModal({ open, onClose }: ScribInstitutesModalProps) {
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [error, setError] = useState("");
  const [chapters, setChapters] = useState<ParagraphIndexChapter[]>([]);
  const [activeBook, setActiveBook] = useState("I");
  const [selected, setSelected] = useState<ParagraphIndexChapter | null>(null);
  const [doc, setDoc] = useState<ParagraphChapterDoc | null>(null);
  const [selectedParaOrder, setSelectedParaOrder] = useState<number | null>(null);

  const groups = useMemo(() => groupChaptersByLiber(chapters), [chapters]);
  const bookEntries = useMemo(() => {
    const g = groups.find((x) => x.book === activeBook);
    return g?.entries ?? [];
  }, [groups, activeBook]);

  const paragraphs = useMemo(() => {
    if (!doc?.paragraphs) return [] as ParagraphUnit[];
    return [...doc.paragraphs].sort((a, b) => a.order - b.order);
  }, [doc]);

  const activeParagraph = useMemo(() => {
    if (selectedParaOrder == null) return null;
    return paragraphs.find((p) => p.order === selectedParaOrder) ?? null;
  }, [paragraphs, selectedParaOrder]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingIndex(true);
    setError("");
    setSelected(null);
    setDoc(null);
    setSelectedParaOrder(null);
    void (async () => {
      try {
        const idx = await fetchParagraphIndex();
        if (cancelled) return;
        setChapters(idx.chapters ?? []);
        const firstBook = groupChaptersByLiber(idx.chapters ?? [])[0]?.book ?? "I";
        setActiveBook(firstBook);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load Institutes index");
          setChapters([]);
        }
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selected) {
      setDoc(null);
      setSelectedParaOrder(null);
      return;
    }
    let cancelled = false;
    setLoadingChapter(true);
    setError("");
    setSelectedParaOrder(null);
    void (async () => {
      try {
        const chapterDoc = await fetchParagraphChapter(selected.book, selected.chapter);
        if (!cancelled) setDoc(chapterDoc);
      } catch (e) {
        if (!cancelled) {
          setDoc(null);
          setError(e instanceof Error ? e.message : "Failed to load chapter");
        }
      } finally {
        if (!cancelled) setLoadingChapter(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selected]);

  if (!open) return null;

  return (
    <div
      className="scrib-layers-modal scrib-institutes-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Institutes Capita"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div className="scrib-layers-modal__panel scrib-institutes-modal__panel">
        <header className="scrib-layers-modal__head">
          <h2>Institutes</h2>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="scrib-institutes-modal__scroll">
          {error ? <p className="scrib-institutes-modal__error">{error}</p> : null}

          {loadingIndex ? (
            <p className="scrib-institutes-modal__status">Loading Capita…</p>
          ) : (
            <>
              <div className="scrib-institutes-modal__libers" role="tablist" aria-label="Libri">
                {groups.map((g) => (
                  <button
                    key={g.book}
                    type="button"
                    role="tab"
                    aria-selected={activeBook === g.book}
                    className={
                      activeBook === g.book
                        ? "scrib-institutes-modal__liber is-active"
                        : "scrib-institutes-modal__liber"
                    }
                    onClick={() => {
                      setActiveBook(g.book);
                      setSelected(null);
                      setDoc(null);
                      setSelectedParaOrder(null);
                    }}
                  >
                    Liber {g.book}
                  </button>
                ))}
              </div>

              <section className="scrib-institutes-modal__step" aria-label="Chapter">
                <div
                  className="scrib-institutes-modal__chips scrib-institutes-modal__chips--chapters"
                  role="listbox"
                  aria-label="Caput number"
                >
                  {bookEntries.map((entry) => {
                    const label = chapterNavLabel(entry);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="option"
                        title={entry.heading}
                        aria-selected={selected?.id === entry.id}
                        className={
                          selected?.id === entry.id
                            ? "scrib-institutes-modal__chip is-active"
                            : "scrib-institutes-modal__chip"
                        }
                        onClick={() => setSelected(entry)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {!selected ? (
                  <p className="scrib-institutes-modal__status">Select a chapter.</p>
                ) : null}
              </section>

              {selected ? (
                <section className="scrib-institutes-modal__step" aria-label="Paragraph">
                  {loadingChapter ? (
                    <p className="scrib-institutes-modal__status">Loading paragraphs…</p>
                  ) : (
                    <>
                      <div
                        className="scrib-institutes-modal__chips scrib-institutes-modal__chips--paras"
                        role="listbox"
                        aria-label="Paragraph number"
                      >
                        {paragraphs.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            role="option"
                            aria-selected={selectedParaOrder === p.order}
                            className={
                              selectedParaOrder === p.order
                                ? "scrib-institutes-modal__chip is-active"
                                : "scrib-institutes-modal__chip"
                            }
                            onClick={() => setSelectedParaOrder(p.order)}
                          >
                            {p.order}
                          </button>
                        ))}
                      </div>
                      {selectedParaOrder == null ? (
                        <p className="scrib-institutes-modal__status">Select a paragraph.</p>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {activeParagraph ? (
                <section className="scrib-institutes-modal__text" aria-live="polite">
                  <p className="scrib-institutes-modal__text-id">{activeParagraph.id}</p>
                  <p className="scrib-institutes-modal__text-body">{activeParagraph.text}</p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
