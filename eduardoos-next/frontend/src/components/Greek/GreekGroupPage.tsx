/**
 * Greek group detail — top gallery of letter images; bottom hierarchy editor.
 * Words are composed of ordered letter-image slots picked from the Koine catalog.
 * Drawing / SVG override happens in the letter catalog (or Edit on a word slot).
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  addGreekLetter,
  createGreekChapter,
  createGreekVerse,
  createGreekWord,
  fetchGreekGroup,
  fetchLetterBlobUrl,
  flattenLetterUrls,
  formatAlphabetNumber,
  listGreekGallery,
  resolveGroupSlugFromLocation,
  updateGreekLetter,
  updateGreekWord,
  type GreekGalleryGlyph,
  type GreekGroupTree,
  type GreekLetterRef,
  type GreekWord,
} from "../../lib/greek";
import LetterCanvas, { type LetterCanvasSave } from "./LetterCanvas";
import LetterCatalog from "./LetterCatalog";
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

function CatalogPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (glyph: GreekGalleryGlyph) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [glyphs, setGlyphs] = useState<GreekGalleryGlyph[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GreekGalleryGlyph | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setFilter("");
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
    setBusy(true);
    try {
      await onPick(selected);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const q = filter.trim().toLowerCase();
  const visible = q
    ? glyphs.filter(
        (g) =>
          g.slug.includes(q) ||
          (g.name ?? "").toLowerCase().includes(q) ||
          (g.label ?? "").includes(filter.trim()) ||
          formatAlphabetNumber(g.alphabetNumber).includes(q),
      )
    : glyphs;

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
          Pick letter from catalog
        </h2>
        <p className="greek-canvas-modal__hint">
          Choose a Koine catalog glyph. Slug and alphabet # come from the catalog
          (fixed numbering). Draw missing glyphs in Letter catalog first.
        </p>
        <div className="greek-build__field">
          <label htmlFor="greek-pick-filter">Filter</label>
          <input
            id="greek-pick-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="alpha, 1.2, ἀ…"
          />
        </div>
        {loading ? (
          <p className="greek-gallery__empty">Loading catalog…</p>
        ) : glyphs.length === 0 ? (
          <p className="greek-gallery__empty">
            Catalog empty — open Letter catalog and generate Koine slots.
          </p>
        ) : (
          <ul className="greek-gallery-picker__grid">
            {visible.map((g) => (
              <li key={g.slug}>
                <button
                  type="button"
                  className={
                    selected?.slug === g.slug
                      ? "greek-gallery-picker__item is-selected"
                      : "greek-gallery-picker__item"
                  }
                  onClick={() => setSelected(g)}
                >
                  {g.drawn ? (
                    <LetterThumb letter={g} />
                  ) : (
                    <span className="greek-catalog__thumb greek-catalog__thumb--empty">
                      {g.label || "·"}
                    </span>
                  )}
                  <span className="greek-gallery-picker__meta">
                    {g.label || g.slug}
                    <br />#{formatAlphabetNumber(g.alphabetNumber || 1)}
                    {!g.drawn ? " · undrawn" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
  onEditSvg,
}: {
  letter: GreekLetterRef;
  groupSlug: string;
  chapterSlug: string;
  verseSlug: string;
  wordSlug: string;
  onChanged: () => Promise<void>;
  onEditSvg: () => void;
}) {
  const [slug, setSlug] = useState(letter.slug || "");

  useEffect(() => {
    setSlug(letter.slug || "");
  }, [letter.slug]);

  async function persistSlug() {
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!clean || clean === letter.slug) return;
    await updateGreekLetter(groupSlug, chapterSlug, verseSlug, wordSlug, letter.index, {
      slug: clean,
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
        <input
          value={formatAlphabetNumber(letter.alphabetNumber || letter.index || 1)}
          readOnly
          disabled
          title="Fixed by Koine catalog"
        />
      </div>
      <button type="button" className="btn" onClick={onEditSvg}>
        Edit SVG
      </button>
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
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState<{
    chapter: string;
    verse: string;
    word: GreekWord;
  } | null>(null);
  const [editLetter, setEditLetter] = useState<{
    chapter: string;
    verse: string;
    wordSlug: string;
    letter: GreekLetterRef;
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

  async function onEditLetterSave(payload: LetterCanvasSave) {
    if (!slug || !editLetter) return;
    await updateGreekLetter(
      slug,
      editLetter.chapter,
      editLetter.verse,
      editLetter.wordSlug,
      editLetter.letter.index,
      { svg: payload.svg },
    );
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
        <div className="greek-page__toolbar">
          <h1 className="greek-page__title">{tree?.group.title ?? slug}</h1>
          <button type="button" className="btn btn--primary" onClick={() => setCatalogOpen(true)}>
            Letter catalog
          </button>
        </div>
        <p className="greek-page__lead">
          Top: letter images for this book. Bottom: chapters → verses → words.
          Draw glyphs in the letter catalog; add letters to a word by picking from
          the catalog only.
        </p>

        <section className="greek-gallery" aria-label="Grouped letter images">
          {loading && !tree ? (
            <p className="greek-gallery__empty">Loading…</p>
          ) : letters.length === 0 ? (
            <p className="greek-gallery__empty">
              No letters yet — seed the catalog, then pick letters onto a word.
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
                        setPickTarget({
                          chapter: activeChapter.slug,
                          verse: activeVerse.slug,
                          word,
                        })
                      }
                    >
                      Pick from catalog
                    </button>
                  </div>
                  <h4 className="greek-word__letters-title">
                    Letters (by alphabet #)
                  </h4>
                  {(word.letters ?? []).length === 0 ? (
                    <p className="greek-gallery__empty">
                      No letter-images yet — pick from the catalog.
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
                          onEditSvg={() =>
                            setEditLetter({
                              chapter: activeChapter.slug,
                              verse: activeVerse.slug,
                              wordSlug: word.slug,
                              letter,
                            })
                          }
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

      <LetterCatalog open={catalogOpen} onClose={() => setCatalogOpen(false)} />

      <CatalogPicker
        open={Boolean(pickTarget)}
        onClose={() => setPickTarget(null)}
        onPick={async (glyph) => {
          if (!slug || !pickTarget) return;
          await addGreekLetter(
            slug,
            pickTarget.chapter,
            pickTarget.verse,
            pickTarget.word.slug,
            {
              gallerySlug: glyph.slug,
              slug: glyph.slug,
              alphabetNumber: glyph.alphabetNumber,
            },
          );
          await refresh();
        }}
      />

      <LetterCanvas
        open={Boolean(editLetter)}
        title="Edit letter SVG"
        hint={
          editLetter
            ? `Redraw overrides the SVG for slot #${editLetter.letter.index} (${editLetter.letter.slug}). Alphabet # stays ${formatAlphabetNumber(editLetter.letter.alphabetNumber)}.`
            : undefined
        }
        defaultSlug={editLetter?.letter.slug ?? ""}
        defaultAlphabet={editLetter?.letter.alphabetNumber ?? 1}
        lockMeta
        onClose={() => setEditLetter(null)}
        onSave={onEditLetterSave}
      />
    </GreekGateShell>
  );
}
