/**
 * Letter drawing canvas — finger / mouse / stylus → 32×64 SVG letter-image.
 *
 * Modes:
 * - catalog: draw/override a catalog slot (slug + alphabet # fixed from seed)
 * - edit-word-letter: redraw SVG for an existing word letter slot (same index)
 */

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  GREEK_LETTER_HEIGHT,
  GREEK_LETTER_WIDTH,
  formatAlphabetNumber,
  sanitizeGreekSlug,
  strokesToLetterSvg,
} from "../../lib/greek";
import "./Greek.css";

type Point = { x: number; y: number };

export type LetterCanvasSave = {
  svg: string;
  slug: string;
  alphabetNumber: number;
};

interface LetterCanvasProps {
  open: boolean;
  title?: string;
  hint?: string;
  /** Pre-filled slug (catalog / edit); locked when lockMeta is true. */
  defaultSlug?: string;
  defaultAlphabet?: number;
  /** When true, slug and alphabet # are read-only (catalog fixed numbers). */
  lockMeta?: boolean;
  onClose: () => void;
  onSave: (payload: LetterCanvasSave) => Promise<void>;
}

export default function LetterCanvas({
  open,
  title = "Draw letter",
  hint,
  defaultSlug = "",
  defaultAlphabet = 1,
  lockMeta = false,
  onClose,
  onSave,
}: LetterCanvasProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokesRef = useRef<Point[][]>([]);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [alphabetNumber, setAlphabetNumber] = useState(1);
  const titleId = useId();
  /** Internal buffer (4× of 32×64) — display CSS locks to 128×256 so the pad is not a skyscraper. */
  const canvasBufW = 128;
  const canvasBufH = 256;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    strokesRef.current = [];
    setSlug(defaultSlug);
    setAlphabetNumber(defaultAlphabet);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(canvas).color || "#141820";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open, defaultAlphabet, defaultSlug]);

  function pointerPos(e: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pointerPos(e);
    strokesRef.current.push([p]);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = pointerPos(e);
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    stroke?.push(p);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  function clear() {
    strokesRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function save() {
    if (busy) return;
    const svg = strokesToLetterSvg(
      strokesRef.current,
      canvasRef.current?.width ?? canvasBufW,
      canvasRef.current?.height ?? canvasBufH,
    );
    if (!strokesRef.current.some((s) => s.length > 1)) return;
    const cleanSlug =
      sanitizeGreekSlug(slug) ||
      sanitizeGreekSlug(defaultSlug) ||
      sanitizeGreekSlug(`letter-${alphabetNumber}`);
    if (!cleanSlug) return;
    setBusy(true);
    try {
      await onSave({
        svg,
        slug: cleanSlug,
        alphabetNumber,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="greek-canvas-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="greek-canvas-modal__body">
        <h2 className="greek-canvas-modal__title" id={titleId}>
          {title}
        </h2>
        <p className="greek-canvas-modal__hint">
          {hint ?? (
            <>
              Draw at 1:2 (pad 128×256). Saved as {GREEK_LETTER_WIDTH}×
              {GREEK_LETTER_HEIGHT} SVG. New strokes override the previous SVG for
              this slot.
            </>
          )}
        </p>
        <div className="greek-editor__row">
          <div className="greek-build__field">
            <label htmlFor="greek-letter-slug">Letter slug</label>
            <input
              id="greek-letter-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="alpha-lower"
              readOnly={lockMeta}
              disabled={lockMeta}
            />
          </div>
          <div className="greek-build__field">
            <label htmlFor="greek-letter-alphabet">Alphabet #</label>
            <input
              id="greek-letter-alphabet"
              value={formatAlphabetNumber(alphabetNumber)}
              readOnly
              disabled
            />
          </div>
        </div>
        <div className="greek-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={canvasBufW}
            height={canvasBufH}
            aria-label="Letter drawing surface (1:2, displays 128×256 → exports 32×64 SVG)"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="greek-canvas-modal__actions">
          <button type="button" className="btn" onClick={clear} disabled={busy}>
            Clear
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save SVG"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
