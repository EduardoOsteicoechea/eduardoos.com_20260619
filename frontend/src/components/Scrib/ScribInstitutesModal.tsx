/**
 * Scrib Institutes modal — pick Liber → Caput from the parallel paragraph pack
 * and copy paragraph / chapter Latin to the clipboard (spec 056).
 */

import { useEffect, useMemo, useState } from "react";
import {
  chapterNavLabel,
  copyTextToClipboard,
  fetchParagraphChapter,
  fetchParagraphIndex,
  formatChapterClipboard,
  groupChaptersByLiber,
  type ParagraphChapterDoc,
  type ParagraphIndexChapter,
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
  const [copyHint, setCopyHint] = useState("");

  const groups = useMemo(() => groupChaptersByLiber(chapters), [chapters]);
  const bookEntries = useMemo(() => {
    const g = groups.find((x) => x.book === activeBook);
    return g?.entries ?? [];
  }, [groups, activeBook]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingIndex(true);
    setError("");
    setCopyHint("");
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
      return;
    }
    let cancelled = false;
    setLoadingChapter(true);
    setError("");
    setCopyHint("");
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

  async function onCopy(text: string, label: string) {
    try {
      await copyTextToClipboard(text);
      setCopyHint(`Copied ${label}`);
    } catch {
      setCopyHint("Copy failed");
    }
  }

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

        {error ? <p className="scrib-institutes-modal__error">{error}</p> : null}
        {copyHint ? (
          <p className="scrib-institutes-modal__hint" aria-live="polite">
            {copyHint}
          </p>
        ) : null}

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
                  }}
                >
                  Liber {g.book}
                </button>
              ))}
            </div>

            <div className="scrib-institutes-modal__body">
              <nav className="scrib-institutes-modal__nav" aria-label="Capita">
                <ul>
                  {bookEntries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={
                          selected?.id === entry.id
                            ? "scrib-institutes-modal__caput is-active"
                            : "scrib-institutes-modal__caput"
                        }
                        onClick={() => setSelected(entry)}
                      >
                        <span className="scrib-institutes-modal__caput-id">
                          {chapterNavLabel(entry)}
                        </span>
                        <span className="scrib-institutes-modal__caput-heading">
                          {entry.heading}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <section className="scrib-institutes-modal__reader" aria-live="polite">
                {!selected ? (
                  <p className="scrib-institutes-modal__status">Select a Caput to copy.</p>
                ) : null}
                {loadingChapter ? (
                  <p className="scrib-institutes-modal__status">Loading paragraphs…</p>
                ) : null}
                {doc ? (
                  <>
                    <div className="scrib-institutes-modal__reader-head">
                      <p className="scrib-institutes-modal__meta">{doc.id}</p>
                      <h3>{doc.heading}</h3>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void onCopy(formatChapterClipboard(doc), `chapter ${doc.id}`)
                        }
                      >
                        Copy chapter
                      </button>
                    </div>
                    <ul className="scrib-institutes-modal__paras">
                      {doc.paragraphs.map((p) => (
                        <li key={p.id} className="scrib-institutes-modal__para">
                          <div className="scrib-institutes-modal__para-head">
                            <code>{p.id}</code>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void onCopy(p.text, p.id)}
                            >
                              Copy
                            </button>
                          </div>
                          <p>{p.text}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
