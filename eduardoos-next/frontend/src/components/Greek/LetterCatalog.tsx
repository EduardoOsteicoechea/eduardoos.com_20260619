/**
 * Letter catalog modal — Koine Greek slots (upper/lower + accents).
 * Admin seeds structure, then draws/overrides SVG one-by-one.
 * Storage: greek/{user}/gallery/ (catalog UI over gallery prefix).
 *
 * Drawn rows show the SVG preview beside the letter label, plus a trash
 * control that clears the drawing (confirm first) while keeping the slot.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  clearGreekCatalogGlyph,
  fetchLetterBlobUrl,
  formatAlphabetNumber,
  listGreekGallery,
  seedGreekCatalog,
  updateGreekCatalogGlyph,
  type GreekGalleryGlyph,
} from "../../lib/greek";
import LetterCanvas, { type LetterCanvasSave } from "./LetterCanvas";
import "./Greek.css";

/** Trash can glyph — fill currentColor for light/dark chrome. */
function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7z"
      />
    </svg>
  );
}

function CatalogThumb({ glyph }: { glyph: GreekGalleryGlyph }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!glyph.drawn) {
      setSrc(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      const url = await fetchLetterBlobUrl(glyph.url);
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
  }, [glyph.url, glyph.drawn, glyph.updatedAt]);

  if (!glyph.drawn || !src) {
    return (
      <span className="greek-catalog__thumb greek-catalog__thumb--empty" aria-hidden="true">
        {glyph.label || "·"}
      </span>
    );
  }
  return (
    <img
      className="greek-catalog__thumb"
      src={src}
      alt=""
      width={32}
      height={64}
      decoding="async"
    />
  );
}

interface LetterCatalogProps {
  open: boolean;
  onClose: () => void;
}

export default function LetterCatalog({ open, onClose }: LetterCatalogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [glyphs, setGlyphs] = useState<GreekGalleryGlyph[]>([]);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [clearingSlug, setClearingSlug] = useState<string | null>(null);
  const [drawTarget, setDrawTarget] = useState<GreekGalleryGlyph | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function refresh() {
    setLoading(true);
    try {
      const items = await listGreekGallery();
      setGlyphs(items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setFilter("");
    setDrawTarget(null);
    setClearingSlug(null);
    void refresh();
  }, [open]);

  async function onSeed() {
    if (seeding) return;
    setSeeding(true);
    try {
      const result = await seedGreekCatalog();
      if (result?.glyphs) setGlyphs(result.glyphs);
      else await refresh();
    } finally {
      setSeeding(false);
    }
  }

  async function onDrawSave(payload: LetterCanvasSave) {
    if (!drawTarget) return;
    await updateGreekCatalogGlyph(drawTarget.slug, { svg: payload.svg });
    await refresh();
  }

  async function onClearDrawing(g: GreekGalleryGlyph) {
    if (!g.drawn || clearingSlug) return;
    const label = g.label || g.slug;
    const ok = window.confirm(
      `Delete the drawing for “${label}” (#${formatAlphabetNumber(g.alphabetNumber)})?\n\nThis clears the SVG in S3 (gallery/). The catalog slot and seed metadata are kept.`,
    );
    if (!ok) return;
    setClearingSlug(g.slug);
    try {
      const cleared = await clearGreekCatalogGlyph(g.slug);
      if (cleared) {
        setGlyphs((prev) =>
          prev.map((item) => (item.slug === cleared.slug ? cleared : item)),
        );
      } else {
        await refresh();
      }
    } finally {
      setClearingSlug(null);
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

  const drawnCount = glyphs.filter((g) => g.drawn).length;

  return (
    <>
      <dialog
        ref={dialogRef}
        className="greek-canvas-modal greek-catalog-modal"
        aria-labelledby={titleId}
        onClose={onClose}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <div className="greek-canvas-modal__body">
          <h2 className="greek-canvas-modal__title" id={titleId}>
            Letter catalog
          </h2>
          <p className="greek-canvas-modal__hint">
            Koine Greek Αα…Ωω with fixed alphabet # (n = upper, n.1 = lower,
            n.2… = accents). Seed slots, then draw/override each SVG. Words pick
            from this catalog only.
          </p>
          <div className="greek-editor__row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void onSeed()}
              disabled={seeding || loading}
            >
              {seeding
                ? "Seeding…"
                : glyphs.length
                  ? "Re-seed / refresh slots"
                  : "Generate Koine catalog"}
            </button>
            <div className="greek-build__field">
              <label htmlFor="greek-catalog-filter">Filter</label>
              <input
                id="greek-catalog-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="nu, 13.1, ἀ…"
              />
            </div>
          </div>
          <p className="greek-catalog__stats">
            {loading
              ? "Loading…"
              : `${glyphs.length} slots · ${drawnCount} drawn · S3: greek/{user}/gallery/`}
          </p>
          {glyphs.length === 0 && !loading ? (
            <p className="greek-gallery__empty">
              Catalog empty — generate the Koine letter slots, then draw each glyph.
            </p>
          ) : (
            <ul className="greek-catalog__list">
              {visible.map((g) => (
                <li key={g.slug} className="greek-catalog__row">
                  <div className="greek-catalog__meta">
                    <span className="greek-catalog__label" title={g.name}>
                      {g.label || "—"}{" "}
                      <span className="greek-catalog__slug">{g.slug}</span>
                    </span>
                    <span className="greek-catalog__num">
                      #{formatAlphabetNumber(g.alphabetNumber)}
                      {g.drawn ? "" : " · undrawn"}
                    </span>
                  </div>
                  <div className="greek-catalog__preview">
                    <CatalogThumb glyph={g} />
                    {g.drawn ? (
                      <button
                        type="button"
                        className="greek-catalog__trash"
                        title="Delete drawing"
                        aria-label={`Delete drawing for ${g.label || g.slug}`}
                        disabled={clearingSlug === g.slug}
                        onClick={() => void onClearDrawing(g)}
                      >
                        <IconTrash className="greek-catalog__trash-icon" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setDrawTarget(g)}
                  >
                    {g.drawn ? "Edit SVG" : "Draw"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="greek-canvas-modal__actions">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </dialog>

      <LetterCanvas
        open={Boolean(drawTarget)}
        title={drawTarget?.drawn ? "Edit catalog letter" : "Draw catalog letter"}
        hint={
          drawTarget
            ? `Override SVG for ${drawTarget.label || drawTarget.slug} (#${formatAlphabetNumber(drawTarget.alphabetNumber)}). Same catalog slot/id.`
            : undefined
        }
        defaultSlug={drawTarget?.slug ?? ""}
        defaultAlphabet={drawTarget?.alphabetNumber ?? 1}
        lockMeta
        onClose={() => setDrawTarget(null)}
        onSave={onDrawSave}
      />
    </>
  );
}
