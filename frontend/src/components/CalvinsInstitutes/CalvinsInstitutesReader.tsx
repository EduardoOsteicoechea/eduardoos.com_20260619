/**
 * Public reader for Calvin’s Institutes (Latin 1559) — Liber-grouped Capita
 * sidebar + paragraph/point body. Sidebar docks left; toggled from Header
 * Dynamic Menu (Homescool pattern).
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchInstitutesIndex,
  fetchInstitutesSection,
  flattenSectionBody,
  groupSectionsByLiber,
  sectionNavLabel,
  type InstitutesIndexSection,
  type InstitutesSection,
} from "../../lib/calvinsInstitutes";
import { ViewLoading } from "../ViewLoading/ViewLoading";
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

export default function CalvinsInstitutesReader({
  onGoDashboard,
}: {
  onGoDashboard?: () => void;
} = {}) {
  const [chapters, setChapters] = useState<InstitutesIndexSection[]>([]);
  const [chapterKey, setChapterKey] = useState("");
  const [sectionDoc, setSectionDoc] = useState<InstitutesSection | null>(null);
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

  const liberGroups = useMemo(() => groupSectionsByLiber(chapters), [chapters]);

  const bodyBlocks = useMemo(
    () => (sectionDoc ? flattenSectionBody(sectionDoc).paragraphs : []),
    [sectionDoc],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idx = await fetchInstitutesIndex();
        if (cancelled) return;
        const list = [...(idx.sections ?? [])].sort((a, b) => a.order - b.order);
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
    if (!activeChapter) return;
    let cancelled = false;
    setLoadingSection(true);
    setError("");
    void (async () => {
      try {
        // Load on demand from the index entry id (maps to relative url sections/NNNN.json).
        const doc = await fetchInstitutesSection(activeChapter.id);
        if (cancelled) return;
        setSectionDoc(doc);
      } catch (err) {
        if (!cancelled) {
          setSectionDoc(null);
          setError(err instanceof Error ? err.message : "Could not load section");
        }
      } finally {
        if (!cancelled) setLoadingSection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChapter?.id]);

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

  const readerTitle =
    activeChapter?.section === "PRELIMINARY"
      ? activeChapter.heading || "PRELIMINARY LATIN MATERIAL"
      : activeChapter
        ? `Liber ${activeChapter.book} · Caput ${activeChapter.section}`
        : "";

  return (
    <div className={rootClass}>
      <CalvinsInstitutesHeaderMenu
        chaptersOpen={chaptersOpen}
        onToggleChapters={toggleChapters}
        onGoDashboard={onGoDashboard}
      />

      {chaptersOpen ? (
        <aside className="calvins-institutes__aside" aria-label="Capita">
          {loadingIndex ? (
            <ViewLoading label="Loading" />
          ) : (
            <nav className="calvins-institutes__nav">
              {liberGroups.map((group) => (
                <div key={group.book} className="calvins-institutes__liber">
                  <h2 className="calvins-institutes__liber-title">
                    Liber {group.book}
                  </h2>
                  <ol>
                    {group.entries.map((c) => (
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
                            {sectionNavLabel(c)}
                          </span>
                          <span className="calvins-institutes__nav-heading">
                            {c.heading}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </nav>
          )}
        </aside>
      ) : null}

      <section className="calvins-institutes__main">
        {error ? <p className="calvins-institutes__error">{error}</p> : null}
        {loadingSection ? <ViewLoading label="Loading" /> : null}
        {activeChapter && sectionDoc && !loadingSection ? (
          <>
            <p className="calvins-institutes__meta">{readerTitle}</p>
            <h1 className="calvins-institutes__caput">
              {sectionDoc.heading || activeChapter.heading}
            </h1>
            <div className="calvins-institutes__body">
              {bodyBlocks.map((block) =>
                block.lines.length ? (
                  <div key={block.key} className="calvins-institutes__paragraph">
                    {block.lines.map((line, i) => (
                      <p key={`${block.key}-${i}`} className="calvins-institutes__point">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null,
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
