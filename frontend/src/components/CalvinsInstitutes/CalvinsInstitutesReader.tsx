/**
 * Public reader for Calvin’s Institutes — flush Capita sidebar + continuous text.
 * Sidebar docks left; toggled from Header Dynamic Menu (Homescool pattern).
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchInstitutesIndex,
  fetchInstitutesSection,
  type InstitutesIndexSection,
} from "../../lib/calvinsInstitutes";
import CalvinsInstitutesHeaderMenu from "./CalvinsInstitutesHeaderMenu";
import "./CalvinsInstitutes.css";

const CHAPTERS_SIDEBAR_KEY = "eduardoos-calvins-chapters-open";

function readChaptersOpen(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = localStorage.getItem(CHAPTERS_SIDEBAR_KEY);
    if (stored === null) return true;
    return stored === "1" || stored === "true";
  } catch {
    return true;
  }
}

function writeChaptersOpen(open: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CHAPTERS_SIDEBAR_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export default function CalvinsInstitutesReader() {
  const [chapters, setChapters] = useState<InstitutesIndexSection[]>([]);
  const [chapterKey, setChapterKey] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(true);

  useEffect(() => {
    setChaptersOpen(readChaptersOpen());
  }, []);

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

  function toggleChapters() {
    setChaptersOpen((prev) => {
      const next = !prev;
      writeChaptersOpen(next);
      return next;
    });
  }

  const rootClass = [
    "calvins-institutes",
    chaptersOpen ? "" : "calvins-institutes--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <CalvinsInstitutesHeaderMenu
        chaptersOpen={chaptersOpen}
        onToggleChapters={toggleChapters}
      />

      {chaptersOpen ? (
        <aside className="calvins-institutes__aside" aria-label="Capita">
          {loadingIndex ? (
            <p className="calvins-institutes__status">Loading…</p>
          ) : (
            <nav className="calvins-institutes__nav">
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
          )}
        </aside>
      ) : null}

      <section className="calvins-institutes__main">
        {error ? <p className="calvins-institutes__error">{error}</p> : null}
        {loadingSection ? <p className="calvins-institutes__status">Loading…</p> : null}
        {activeChapter && body && !loadingSection ? (
          <>
            <h1 className="calvins-institutes__caput">{activeChapter.heading}</h1>
            <pre className="calvins-institutes__text">{body}</pre>
          </>
        ) : null}
      </section>
    </div>
  );
}

function labelCaput(heading: string): string {
  const m = heading.match(/Caput\s+([IVXLC]+)|Argumentum/i);
  if (!m) return "";
  return m[1] ?? "Arg";
}
