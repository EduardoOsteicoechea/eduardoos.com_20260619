/**
 * Public reader for Calvin’s Institutes — chapter outline + section panel.
 * Index is Latin-only Capita in Liber order; pages[] steps through OCR pages.
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchInstitutesIndex,
  fetchInstitutesSection,
  type InstitutesIndexSection,
  type InstitutesSection,
} from "../../lib/calvinsInstitutes";
import "./CalvinsInstitutes.css";

export default function CalvinsInstitutesReader() {
  const [chapters, setChapters] = useState<InstitutesIndexSection[]>([]);
  const [chapterKey, setChapterKey] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [section, setSection] = useState<InstitutesSection | null>(null);
  const [error, setError] = useState("");
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === chapterKey) ?? null,
    [chapters, chapterKey],
  );

  const pageIds = useMemo(() => {
    if (!activeChapter) return [] as string[];
    if (activeChapter.pages?.length) return activeChapter.pages;
    return [activeChapter.id];
  }, [activeChapter]);

  const selectedId = pageIds[pageIndex] ?? "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idx = await fetchInstitutesIndex();
        if (cancelled) return;
        const list = idx.sections ?? [];
        setChapters(list);
        if (list.length) {
          setChapterKey(list[0].id);
          setPageIndex(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load index");
        }
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingSection(true);
    setError("");
    void (async () => {
      try {
        const data = await fetchInstitutesSection(selectedId);
        if (!cancelled) setSection(data);
      } catch (err) {
        if (!cancelled) {
          setSection(null);
          setError(err instanceof Error ? err.message : "Could not load section");
        }
      } finally {
        if (!cancelled) setLoadingSection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function selectChapter(id: string) {
    setChapterKey(id);
    setPageIndex(0);
  }

  return (
    <section className="calvins-institutes" aria-labelledby="calvins-title">
      <header className="calvins-institutes__head">
        <h1 id="calvins-title">Calvin’s Institutes</h1>
        <p className="calvins-institutes__lead">
          Latin text only — Liber III–IV Capita in order. English Allen sheets stay on S3 but
          are hidden. Use page controls when a Caput spans several OCR sheets.
        </p>
      </header>

      {loadingIndex ? <p className="calvins-institutes__status">Loading index…</p> : null}
      {error ? <p className="calvins-institutes__error">{error}</p> : null}

      <div className="calvins-institutes__layout">
        <nav className="calvins-institutes__nav" aria-label="Capita">
          <ol>
            {chapters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={
                    c.id === chapterKey
                      ? "calvins-institutes__nav-btn is-active"
                      : "calvins-institutes__nav-btn"
                  }
                  onClick={() => selectChapter(c.id)}
                >
                  <span className="calvins-institutes__nav-order">
                    {c.book ? `${c.book}.` : ""}
                    {labelCaput(c.heading)}
                  </span>
                  <span className="calvins-institutes__nav-heading">{c.heading}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="calvins-institutes__panel">
          {activeChapter && pageIds.length > 1 ? (
            <div className="calvins-institutes__pager">
              <button
                type="button"
                className="calvins-institutes__pager-btn"
                disabled={pageIndex <= 0 || loadingSection}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              >
                Previous page
              </button>
              <span className="calvins-institutes__pager-status">
                Page {pageIndex + 1} / {pageIds.length}
              </span>
              <button
                type="button"
                className="calvins-institutes__pager-btn"
                disabled={pageIndex >= pageIds.length - 1 || loadingSection}
                onClick={() => setPageIndex((i) => Math.min(pageIds.length - 1, i + 1))}
              >
                Next page
              </button>
            </div>
          ) : null}

          {loadingSection ? <p className="calvins-institutes__status">Loading section…</p> : null}
          {section && !loadingSection ? (
            <>
              <h2>{activeChapter?.heading ?? section.heading}</h2>
              <pre className="calvins-institutes__text">{section.text}</pre>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function labelCaput(heading: string): string {
  const m = heading.match(/Caput\s+([IVXLC]+)|Argumentum/i);
  if (!m) return "";
  return m[1] ?? "Arg";
}
