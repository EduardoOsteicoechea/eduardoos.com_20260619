/**
 * Public reader for Calvin’s Institutes — Liber/Caput sidebar + continuous text.
 * Loads all OCR pages for the selected Caput and joins them (no page pager).
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchInstitutesIndex,
  fetchInstitutesSection,
  type InstitutesIndexSection,
} from "../../lib/calvinsInstitutes";
import "./CalvinsInstitutes.css";

export default function CalvinsInstitutesReader() {
  const [chapters, setChapters] = useState<InstitutesIndexSection[]>([]);
  const [chapterKey, setChapterKey] = useState("");
  const [body, setBody] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idx = await fetchInstitutesIndex();
        if (cancelled) return;
        const list = idx.sections ?? [];
        setChapters(list);
        if (list.length) setChapterKey(list[0].id);
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
    if (!pageIds.length) return;
    let cancelled = false;
    setLoadingSection(true);
    setError("");
    void (async () => {
      try {
        const parts = await Promise.all(pageIds.map((id) => fetchInstitutesSection(id)));
        if (cancelled) return;
        const text = parts
          .map((p) => (p.text ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
        setBody(text);
      } catch (err) {
        if (!cancelled) {
          setBody("");
          setError(err instanceof Error ? err.message : "Could not load section");
        }
      } finally {
        if (!cancelled) setLoadingSection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageIds.join("|")]);

  return (
    <section className="calvins-institutes" aria-labelledby="calvins-title">
      <header className="calvins-institutes__head">
        <h1 id="calvins-title">Calvin’s Institutes</h1>
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
                  onClick={() => setChapterKey(c.id)}
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
          {loadingSection ? <p className="calvins-institutes__status">Loading section…</p> : null}
          {activeChapter && body && !loadingSection ? (
            <>
              <h2>{activeChapter.heading}</h2>
              <pre className="calvins-institutes__text">{body}</pre>
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
