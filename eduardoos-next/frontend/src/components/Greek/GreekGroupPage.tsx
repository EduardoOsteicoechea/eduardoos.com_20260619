/**
 * Greek group detail — top gallery of letter images; bottom hierarchy editor.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  addGreekLetter,
  createGreekChapter,
  createGreekVerse,
  createGreekWord,
  fetchGreekGroup,
  fetchLetterBlobUrl,
  flattenLetterUrls,
  resolveGroupSlugFromLocation,
  updateGreekWord,
  type GreekGroupTree,
  type GreekLetterRef,
  type GreekWord,
} from "../../lib/greek";
import LetterCanvas from "./LetterCanvas";
import { GreekGateShell, useGreekAdminGate } from "./GreekHubPage";
import "./Greek.css";

function LetterThumb({ letter }: { letter: GreekLetterRef }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const url = await fetchLetterBlobUrl(letter.url);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      revoked = url;
      setSrc(url);
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [letter.url]);

  if (!src) {
    return <span className="greek-gallery__letter" aria-hidden="true" />;
  }
  return (
    <img
      className="greek-gallery__letter"
      src={src}
      alt=""
      width={32}
      height={64}
      decoding="async"
    />
  );
}

export default function GreekGroupPage() {
  const gate = useGreekAdminGate();
  const [slug, setSlug] = useState("");
  const [tree, setTree] = useState<GreekGroupTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("");
  const [verseTitle, setVerseTitle] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedVerse, setSelectedVerse] = useState("");
  const [wordSlug, setWordSlug] = useState("");
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [ordCh, setOrdCh] = useState(1);
  const [ordBk, setOrdBk] = useState(1);
  const [canvasTarget, setCanvasTarget] = useState<{
    chapter: string;
    verse: string;
    word: GreekWord;
  } | null>(null);

  useEffect(() => {
    const resolved = resolveGroupSlugFromLocation(
      window.location.pathname,
      window.location.search,
    );
    setSlug(resolved);
  }, []);

  async function refresh(groupSlug = slug) {
    if (!groupSlug) return;
    setLoading(true);
    try {
      const data = await fetchGreekGroup(groupSlug);
      setTree(data);
      if (data?.chapters?.length) {
        if (!selectedChapter || !data.chapters.some((c) => c.slug === selectedChapter)) {
          setSelectedChapter(data.chapters[0].slug);
        }
        const ch =
          data.chapters.find((c) => c.slug === selectedChapter) ?? data.chapters[0];
        if (ch?.verses?.length) {
          if (!selectedVerse || !ch.verses.some((v) => v.slug === selectedVerse)) {
            setSelectedVerse(ch.verses[0].slug);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (gate !== "allowed" || !slug) return;
    void refresh(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once slug+gate ready
  }, [gate, slug]);

  const letters = useMemo(() => flattenLetterUrls(tree), [tree]);

  const chapters = tree?.chapters ?? [];
  const activeChapter = chapters.find((c) => c.slug === selectedChapter) ?? chapters[0];
  const verses = activeChapter?.verses ?? [];
  const activeVerse = verses.find((v) => v.slug === selectedVerse) ?? verses[0];

  async function onAddChapter(e: FormEvent) {
    e.preventDefault();
    if (!slug || !chapterTitle.trim()) return;
    const ch = await createGreekChapter(slug, chapterTitle.trim());
    if (ch) {
      setChapterTitle("");
      setSelectedChapter(ch.slug);
      await refresh();
    }
  }

  async function onAddVerse(e: FormEvent) {
    e.preventDefault();
    if (!slug || !activeChapter || !verseTitle.trim()) return;
    const v = await createGreekVerse(slug, activeChapter.slug, verseTitle.trim());
    if (v) {
      setVerseTitle("");
      setSelectedVerse(v.slug);
      await refresh();
    }
  }

  async function onAddWord(e: FormEvent) {
    e.preventDefault();
    if (!slug || !activeChapter || !activeVerse) return;
    const w = await createGreekWord(slug, activeChapter.slug, activeVerse.slug, {
      slug: wordSlug.trim() || undefined,
      translation1: t1,
      translation2: t2,
      ordinalChapter: ordCh,
      ordinalBook: ordBk,
    });
    if (w) {
      setWordSlug("");
      setT1("");
      setT2("");
      setOrdCh((n) => Math.min(1000, n + 1));
      setOrdBk((n) => Math.min(10000, n + 1));
      await refresh();
    }
  }

  async function saveWordField(
    chapterSlug: string,
    verseSlug: string,
    word: GreekWord,
    patch: Partial<Pick<GreekWord, "translation1" | "translation2" | "ordinalChapter" | "ordinalBook">>,
  ) {
    if (!slug) return;
    await updateGreekWord(slug, chapterSlug, verseSlug, word.slug, patch);
    await refresh();
  }

  if (!slug && gate === "allowed") {
    return (
      <GreekGateShell gate={gate}>
        <div className="greek-gate">
          <p className="greek-gate__text">Missing group. Open one from the builder.</p>
          <a className="btn" href={APP_ROUTES.greekBuild}>
            Back to build
          </a>
        </div>
      </GreekGateShell>
    );
  }

  return (
    <GreekGateShell gate={gate}>
      <div className="greek-page">
        <p className="greek-page__brand">
          <a href={APP_ROUTES.greekBuild}>Greek · Build</a>
        </p>
        <h1 className="greek-page__title">{tree?.group.title ?? slug}</h1>
        <p className="greek-page__lead">
          Top: letter images for this book. Bottom: chapters → verses → words
          (idioma 1 / idioma 2) and draw letters.
        </p>

        <section className="greek-gallery" aria-label="Grouped letter images">
          {loading && !tree ? (
            <p className="greek-gallery__empty">Loading…</p>
          ) : letters.length === 0 ? (
            <p className="greek-gallery__empty">
              No letters yet — add a word and draw glyphs below.
            </p>
          ) : (
            letters.map((letter) => (
              <LetterThumb key={`${letter.key}-${letter.index}`} letter={letter} />
            ))
          )}
        </section>

        <div className="greek-editor">
          <section className="greek-editor__section">
            <h2 className="greek-editor__section-title">Chapters</h2>
            <form className="greek-editor__row" onSubmit={onAddChapter}>
              <div className="greek-build__field">
                <label htmlFor="greek-ch-title">New chapter</label>
                <input
                  id="greek-ch-title"
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  placeholder="Chapter 1"
                />
              </div>
              <button className="btn btn--primary" type="submit">
                Add chapter
              </button>
            </form>
            {chapters.length > 0 && (
              <div className="greek-editor__row">
                <div className="greek-build__field">
                  <label htmlFor="greek-ch-select">Active chapter</label>
                  <select
                    id="greek-ch-select"
                    value={activeChapter?.slug ?? ""}
                    onChange={(e) => {
                      setSelectedChapter(e.target.value);
                      setSelectedVerse("");
                    }}
                  >
                    {chapters.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.title || c.slug}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          {activeChapter && (
            <section className="greek-editor__section greek-chapter">
              <h2 className="greek-editor__section-title">
                Verses · {activeChapter.title || activeChapter.slug}
              </h2>
              <form className="greek-editor__row" onSubmit={onAddVerse}>
                <div className="greek-build__field">
                  <label htmlFor="greek-v-title">New verse</label>
                  <input
                    id="greek-v-title"
                    value={verseTitle}
                    onChange={(e) => setVerseTitle(e.target.value)}
                    placeholder="Verse 1"
                  />
                </div>
                <button className="btn btn--primary" type="submit">
                  Add verse
                </button>
              </form>
              {verses.length > 0 && (
                <div className="greek-editor__row">
                  <div className="greek-build__field">
                    <label htmlFor="greek-v-select">Active verse</label>
                    <select
                      id="greek-v-select"
                      value={activeVerse?.slug ?? ""}
                      onChange={(e) => setSelectedVerse(e.target.value)}
                    >
                      {verses.map((v) => (
                        <option key={v.slug} value={v.slug}>
                          {v.title || v.slug}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeChapter && activeVerse && (
            <section className="greek-editor__section greek-verse">
              <h2 className="greek-editor__section-title">
                Words · {activeVerse.title || activeVerse.slug}
              </h2>
              <form className="greek-editor__row" onSubmit={onAddWord}>
                <div className="greek-build__field">
                  <label htmlFor="greek-w-slug">Slug</label>
                  <input
                    id="greek-w-slug"
                    value={wordSlug}
                    onChange={(e) => setWordSlug(e.target.value)}
                    placeholder="en-arche"
                  />
                </div>
                <div className="greek-build__field">
                  <label htmlFor="greek-w-t1">Idioma 1</label>
                  <input
                    id="greek-w-t1"
                    value={t1}
                    onChange={(e) => setT1(e.target.value)}
                    required
                  />
                </div>
                <div className="greek-build__field">
                  <label htmlFor="greek-w-t2">Idioma 2</label>
                  <input
                    id="greek-w-t2"
                    value={t2}
                    onChange={(e) => setT2(e.target.value)}
                  />
                </div>
                <div className="greek-build__field">
                  <label htmlFor="greek-w-och">n / 1000 chapter</label>
                  <input
                    id="greek-w-och"
                    type="number"
                    min={1}
                    max={1000}
                    value={ordCh}
                    onChange={(e) => setOrdCh(Number(e.target.value))}
                  />
                </div>
                <div className="greek-build__field">
                  <label htmlFor="greek-w-obk">n / 10000 book</label>
                  <input
                    id="greek-w-obk"
                    type="number"
                    min={1}
                    max={10000}
                    value={ordBk}
                    onChange={(e) => setOrdBk(Number(e.target.value))}
                  />
                </div>
                <button className="btn btn--primary" type="submit">
                  Add word
                </button>
              </form>

              {(activeVerse.words ?? []).map((word) => (
                <article key={word.slug} className="greek-word">
                  <div className="greek-word__meta">
                    <h3 className="greek-word__slug">{word.slug}</h3>
                    <span className="greek-word__ordinals">
                      {word.ordinalChapter}/1000 · {word.ordinalBook}/10000
                    </span>
                  </div>
                  <div className="greek-editor__row">
                    <div className="greek-build__field">
                      <label>Idioma 1</label>
                      <input
                        defaultValue={word.translation1}
                        onBlur={(e) => {
                          if (e.target.value !== word.translation1) {
                            void saveWordField(
                              activeChapter.slug,
                              activeVerse.slug,
                              word,
                              { translation1: e.target.value },
                            );
                          }
                        }}
                      />
                    </div>
                    <div className="greek-build__field">
                      <label>Idioma 2</label>
                      <input
                        defaultValue={word.translation2}
                        onBlur={(e) => {
                          if (e.target.value !== word.translation2) {
                            void saveWordField(
                              activeChapter.slug,
                              activeVerse.slug,
                              word,
                              { translation2: e.target.value },
                            );
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() =>
                        setCanvasTarget({
                          chapter: activeChapter.slug,
                          verse: activeVerse.slug,
                          word,
                        })
                      }
                    >
                      Add image to word
                    </button>
                  </div>
                  <div className="greek-word__letters">
                    {(word.letters ?? []).map((letter) => (
                      <LetterThumb
                        key={`${word.slug}-${letter.index}`}
                        letter={letter}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      </div>

      <LetterCanvas
        open={Boolean(canvasTarget)}
        wordLabel={canvasTarget?.word.slug ?? ""}
        onClose={() => setCanvasTarget(null)}
        onSave={async (svg) => {
          if (!slug || !canvasTarget) return;
          await addGreekLetter(
            slug,
            canvasTarget.chapter,
            canvasTarget.verse,
            canvasTarget.word.slug,
            svg,
          );
          await refresh();
        }}
      />
    </GreekGateShell>
  );
}
