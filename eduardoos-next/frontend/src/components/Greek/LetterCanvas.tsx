/**
 * Letter drawing canvas — finger / mouse / stylus → 32×64 SVG.
 */

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  GREEK_LETTER_HEIGHT,
  GREEK_LETTER_WIDTH,
  strokesToLetterSvg,
} from "../../lib/greek";
import "./Greek.css";

type Point = { x: number; y: number };

interface LetterCanvasProps {
  open: boolean;
  wordLabel: string;
  onClose: () => void;
  onSave: (svg: string) => Promise<void>;
}

export default function LetterCanvas({
  open,
  wordLabel,
  onClose,
  onSave,
}: LetterCanvasProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokesRef = useRef<Point[][]>([]);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const canvasCssW = 256;
  const canvasCssH = 512;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    strokesRef.current = [];
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
  }, [open]);

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
      canvasRef.current?.width ?? canvasCssW,
      canvasRef.current?.height ?? canvasCssH,
    );
    if (!strokesRef.current.some((s) => s.length > 1)) return;
    setBusy(true);
    try {
      await onSave(svg);
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
          Add letter
        </h2>
        <p className="greek-canvas-modal__hint">
          Draw one glyph for <strong>{wordLabel}</strong> — saved as{" "}
          {GREEK_LETTER_WIDTH}×{GREEK_LETTER_HEIGHT} SVG.
        </p>
        <div className="greek-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={canvasCssW}
            height={canvasCssH}
            aria-label="Letter drawing surface"
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
            {busy ? "Saving…" : "Save letter"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
