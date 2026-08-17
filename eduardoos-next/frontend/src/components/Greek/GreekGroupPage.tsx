/**
 * Greek group detail — top gallery of letter images; bottom hierarchy editor.
 * Words are composed of ordered letter-image slots (SVG + slug + alphabet #).
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  addGreekGalleryGlyph,
  addGreekLetter,
  createGreekChapter,
  createGreekVerse,
  createGreekWord,
  fetchGreekGroup,
  fetchLetterBlobUrl,
  flattenLetterUrls,
  formatAlphabetNumber,
  greekAlphabetNumberOptions,
  listGreekGallery,
  resolveGroupSlugFromLocation,
  sanitizeGreekSlug,
  updateGreekLetter,
  updateGreekWord,
  type GreekGalleryGlyph,
  type GreekGroupTree,
  type GreekLetterRef,
  type GreekWord,
} from "../../lib/greek";
import LetterCanvas, { type LetterCanvasSave } from "./LetterCanvas";
import { GreekGateShell, useGreekAdminGate } from "./GreekHubPage";
import "./Greek.css";

function LetterThumb({
  letter,
  className = "greek-gallery__letter",
}: {
  letter: { url: string };
  className?: string;
}) {
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
    return <span className={className} aria-hidden="true" />;
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={32}
      height={64}
      decoding="async"
    />
  );
}

function nextAlphabetSuggestion(letters: GreekLetterRef[] | undefined): number {
  const used = (letters ?? []).map((l) => l.alphabetNumber || 0);
  const max = used.length ? Math.max(...used) : 0;
  const next = Math.min(30, Math.round((max + 1) * 10) / 10);
  return next < 1 ? 1 : next;
}

function GalleryPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (glyph: GreekGalleryGlyph, slug: string, alphabetNumber: number) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [glyphs, setGlyphs] = useState<GreekGalleryGlyph[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GreekGalleryGlyph | null>(null);
  const [slug, setSlug] = useState("");
  const [alphabetNumber, setAlphabetNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const alphabetOpts = useMemo(() => greekAlphabetNumberOptions(), []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSlug("");
    setAlphabetNumber(1);
    setLoading(true);
    void (async () => {
      try {
        const items = await listGreekGallery();
        setGlyphs(items);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function confirm() {
    if (!selected || busy) return;
    const clean = sanitizeGreekSlug(slug) || selected.slug;
    setBusy(true);
    try {
      await onPick(selected, clean, alphabetNumber);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="greek-canvas-modal greek-gallery-picker"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="greek-canvas-modal__body">
        <h2 className="greek-canvas-modal__title" id={titleId}>
          Pick letter from gallery
        </h2>
        <p className="greek-canvas-modal__hint">
          Reuse a saved letter-image glyph, then set slug and alphabet # for this word.
        </p>
        {loading ? (
          <p className="greek-gallery__empty">Loading gallery…</p>
        ) : glyphs.length === 0 ? (
          <p className="greek-gallery__empty">
            Gallery empty — draw a letter and check “Also save to letter gallery”.
          </p>
        ) : (
          <ul className="greek-gallery-picker__grid">
            {glyphs.map((g) => (
              <li key={g.slug}>
                <button
                  type="button"
                  className={
                    selected?.slug === g.slug
                      ? "greek-gallery-picker__item is-selected"
                      : "greek-gallery-picker__item"
                  }
                  onClick={() => {
                    setSelected(g);
                    setSlug(g.slug);
                    setAlphabetNumber(g.alphabetNumber || 1);
                  }}
                >
                  <LetterThumb letter={g} />
                  <span className="greek-gallery-picker__meta">
                    {g.slug}
                    <br />#{formatAlphabetNumber(g.alphabetNumber || 1)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <div className="greek-editor__row">
            <div className="greek-build__field">
              <label htmlFor="greek-pick-slug">Letter slug</label>
              <input
                id="greek-pick-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
            <div className="greek-build__field">
              <label htmlFor="greek-pick-alphabet">Alphabet #</label>
              <select
                id="greek-pick-alphabet"
                value={String(alphabetNumber)}
                onChange={(e) => setAlphabetNumber(Number(e.target.value))}
              >
                {alphabetOpts.map((n) => (
                  <option key={n} value={String(n)}>
                    {Number.isInteger(n) ? String(n) : n.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="greek-canvas-modal__actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!selected || busy}
            onClick={() => void confirm()}
          >
            {busy ? "Adding…" : "Add letter"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function LetterSlotRow({
  letter,
  groupSlug,
  chapterSlug,
  verseSlug,
  wordSlug,
  onChanged,
}: {
  letter: GreekLetterRef;
  groupSlug: string;
  chapterSlug: string;
  verseSlug: string;
  wordSlug: string;
  onChanged: () => Promise<void>;
}) {
  const alphabetOpts = useMemo(() => greekAlphabetNumberOptions(), []);
  const [slug, setSlug] = useState(letter.slug || "");
  const [alphabetNumber, setAlphabetNumber] = useState(letter.alphabetNumber || letter.index || 1);

  useEffect(() => {
    setSlug(letter.slug || "");
    setAlphabetNumber(letter.alphabetNumber || letter.index || 1);
  }, [letter.slug, letter.alphabetNumber, letter.index]);

  async function persistSlug() {
    const clean = sanitizeGreekSlug(slug);
    if (!clean || clean === letter.slug) return;
    await updateGreekLetter(groupSlug, chapterSlug, verseSlug, wordSlug, letter.index, {
      slug: clean,
    });
    await onChanged();
  }

  async function persistAlphabet(n: number) {
    setAlphabetNumber(n);
    if (n === letter.alphabetNumber) return;
    await updateGreekLetter(groupSlug, chapterSlug, verseSlug, wordSlug, letter.index, {
      alphabetNumber: n,
    });
    await onChanged();
  }

  return (
    <li className="greek-letter-slot">
      <LetterThumb letter={letter} className="greek-letter-slot__img" />
      <div className="greek-build__field">
        <label>Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => void persistSlug()}
        />
      </div>
      <div className="greek-build__field">
        <label>Alphabet #</label>
        <select
          value={String(alphabetNumber)}
          onChange={(e) => void persistAlphabet(Number(e.target.value))}
        >
          {alphabetOpts.map((n) => (
            <option key={n} value={String(n)}>
              {Number.isInteger(n) ? String(n) : n.toFixed(1)}
            </option>
          ))}
        </select>
      </div>
    </li>
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
  const [galleryTarget, setGalleryTarget] = useState<{
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

  async function onCanvasSave(payload: LetterCanvasSave) {
    if (!slug || !canvasTarget) return;
    await addGreekLetter(
      slug,
      canvasTarget.chapter,
      canvasTarget.verse,
      canvasTarget.word.slug,
      {
        svg: payload.svg,
        slug: payload.slug,
        alphabetNumber: payload.alphabetNumber,
      },
    );
    if (payload.alsoSaveToGallery) {
      await addGreekGalleryGlyph({
        svg: payload.svg,
        slug: payload.slug,
        alphabetNumber: payload.alphabetNumber,
      });
    }
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
          composed of letter slots (draw or pick from gallery).
        </p>

        <section className="greek-gallery" aria-label="Grouped letter images">
          {loading && !tree ? (
            <p className="greek-gallery__empty">Loading…</p>
          ) : letters.length === 0 ? (
            <p className="greek-gallery__empty">
              No letters yet — add a word and add letter-images below.
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
                      Draw letter
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setGalleryTarget({
                          chapter: activeChapter.slug,
                          verse: activeVerse.slug,
                          word,
                        })
                      }
                    >
                      Pick from gallery
                    </button>
                  </div>
                  <h4 className="greek-word__letters-title">
                    Letters (by alphabet #)
                  </h4>
                  {(word.letters ?? []).length === 0 ? (
                    <p className="greek-gallery__empty">
                      No letter-images yet — draw or pick one.
                    </p>
                  ) : (
                    <ol className="greek-letter-slots">
                      {(word.letters ?? []).map((letter) => (
                        <LetterSlotRow
                          key={`${word.slug}-${letter.index}`}
                          letter={letter}
                          groupSlug={slug}
                          chapterSlug={activeChapter.slug}
                          verseSlug={activeVerse.slug}
                          wordSlug={word.slug}
                          onChanged={refresh}
                        />
                      ))}
                    </ol>
                  )}
                </article>
              ))}
            </section>
          )}
        </div>
      </div>

      <LetterCanvas
        open={Boolean(canvasTarget)}
        wordLabel={canvasTarget?.word.slug ?? ""}
        defaultAlphabet={nextAlphabetSuggestion(canvasTarget?.word.letters)}
        onClose={() => setCanvasTarget(null)}
        onSave={onCanvasSave}
      />

      <GalleryPicker
        open={Boolean(galleryTarget)}
        onClose={() => setGalleryTarget(null)}
        onPick={async (glyph, letterSlug, alphabetNumber) => {
          if (!slug || !galleryTarget) return;
          await addGreekLetter(
            slug,
            galleryTarget.chapter,
            galleryTarget.verse,
            galleryTarget.word.slug,
            {
              gallerySlug: glyph.slug,
              slug: letterSlug,
              alphabetNumber,
            },
          );
          await refresh();
        }}
      />
    </GreekGateShell>
  );
}
