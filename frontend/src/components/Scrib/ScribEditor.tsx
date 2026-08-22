/**
 * Scrib sheet editor — portrait US Letter (215.9×279.4 mm) with ruled background
 * and six SVG layers. Zoom is the safe default; stylus-only drawing and erasing
 * update one authoritative snapshot and save serially after each completed action.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import ServiceGate from "../ServiceGate/ServiceGate";
import ScribHeaderMenu, { type ScribToolMode } from "./ScribHeaderMenu";
import {
  fetchScribSheet,
  resolveScribSheetFromLocation,
  saveScribSheet,
  SCRIB_BG_SRC,
  SCRIB_LAYER_IDS,
  SCRIB_LAYER_LABELS,
  SCRIB_PAGE_HEIGHT_MM,
  SCRIB_PAGE_WIDTH_MM,
  type ScribLayer,
  type ScribLayerId,
  type ScribSheet,
  type StrokePath,
  scribSheetPrettyPath,
} from "../../lib/scrib";
import "./Scrib.css";

const STROKE_MIN = 0.1;
const STROKE_MAX = 2.5;
const STROKE_STEP = 0.05;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const INK = "#141820";

type UndoEntry = {
  layerId: string;
  pathsBefore: StrokePath[];
};

function clonePaths(paths: StrokePath[]): StrokePath[] {
  return paths.map((p) => ({ ...p }));
}

function ensureLayers(sheet: ScribSheet): ScribSheet {
  const byId = new Map(sheet.layers.map((l) => [l.id, l]));
  const layers: ScribLayer[] = SCRIB_LAYER_IDS.map((id) => {
    const existing = byId.get(id);
    return {
      id,
      opacity: existing?.opacity ?? 1,
      paths: existing?.paths ?? [],
    };
  });
  return { ...sheet, layers };
}

/** Sample points from an SVG path `d` built as M/L segments. */
function pathPoints(d: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const re = /[ML]\s*([-\d.]+)\s+([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    pts.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return pts;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Remove strokes on the active layer that intersect the eraser polyline. */
function erasePaths(
  paths: StrokePath[],
  eraser: { x: number; y: number }[],
  radiusMm: number,
): StrokePath[] {
  if (eraser.length === 0) return paths;
  return paths.filter((path) => {
    const pts = pathPoints(path.d);
    if (pts.length === 0) return true;
    const hitR = radiusMm + path.strokeWidth * 0.5;
    for (const p of pts) {
      for (const e of eraser) {
        if (dist(p, e) <= hitR) return false;
      }
    }
    return true;
  });
}

export default function ScribEditor() {
  const [ids, setIds] = useState<{
    userSafe: string;
    bookId: string;
    sheetId: string;
  } | null>(null);
  const [sheet, setSheet] = useState<ScribSheet | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ScribToolMode>("zoom");
  const [layersOpen, setLayersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const [draftPath, setDraftPath] = useState("");
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const sheetSnapshotRef = useRef<ScribSheet | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSaveCountRef = useRef(0);

  /**
   * React state is asynchronous, but strokes may finish back-to-back. Keep this
   * reference current before scheduling React's render so the next stroke always
   * starts from the sheet that already includes the prior completed stroke.
   */
  const commitSheet = useCallback((next: ScribSheet) => {
    sheetSnapshotRef.current = next;
    setSheet(next);
  }, []);

  useEffect(() => {
    const resolved = resolveScribSheetFromLocation();
    setIds(resolved);
    if (resolved) {
      const pretty = scribSheetPrettyPath(
        resolved.userSafe,
        resolved.bookId,
        resolved.sheetId,
      );
      if (window.location.pathname !== pretty) {
        window.history.replaceState(null, "", pretty);
      }
    }
  }, []);

  useEffect(() => {
    if (!ids) {
      if (typeof window !== "undefined") {
        // Still resolving on first paint, or truly missing.
        const resolved = resolveScribSheetFromLocation();
        if (!resolved) {
          setError("Ruta de hoja inválida.");
          setLoading(false);
        }
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetchScribSheet(ids.bookId, ids.sheetId);
      if (cancelled) return;
      if (res.error || !res.sheet) {
        setError(res.error ?? "Hoja no encontrada");
        setLoading(false);
        return;
      }
      commitSheet(ensureLayers(res.sheet));
      setError("");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids?.bookId, ids?.sheetId]);

  /** Fit sheet into viewport without scroll on first load. */
  useEffect(() => {
    if (!sheet || !viewportRef.current) return;
    const fit = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const pad = 16;
      const availW = Math.max(120, vp.clientWidth - pad * 2);
      const availH = Math.max(120, vp.clientHeight - pad * 2);
      const sx = availW / SCRIB_PAGE_WIDTH_MM;
      const sy = availH / SCRIB_PAGE_HEIGHT_MM;
      const next = Math.min(sx, sy, 1.5);
      setScale(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
      setPan({ x: 0, y: 0 });
    };
    fit();
    // The user controls scale and pan after the initial fit. In particular,
    // fullscreen changes dispatch resize events; never use those to reset zoom.
    return undefined;
  }, [sheet?.id]);

  /**
   * Sheet writes replace the complete S3 JSON object. Chain them so a slow first
   * response cannot finish after a newer write and erase later strokes. Server
   * responses are intentionally not copied into React state: the local snapshot
   * can already contain actions queued after the response's request body.
   */
  const persist = useCallback((next: ScribSheet) => {
    queuedSaveCountRef.current += 1;
    setSaving(true);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const res = await saveScribSheet(next);
        if (res.error) setError(res.error);
      })
      .finally(() => {
        queuedSaveCountRef.current -= 1;
        setSaving(queuedSaveCountRef.current > 0);
      });
  }, []);

  function mmFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = sheetRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * SCRIB_PAGE_WIDTH_MM;
    const y = ((clientY - rect.top) / rect.height) * SCRIB_PAGE_HEIGHT_MM;
    return { x, y };
  }

  function acceptsStylus(e: React.PointerEvent): boolean {
    // Drawing and erasing are deliberately stylus-only for palm rejection.
    return e.pointerType === "pen";
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!sheet) return;
    if (mode === "zoom") {
      panDragRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (!acceptsStylus(e)) return;
    const pt = mmFromClient(e.clientX, e.clientY);
    if (!pt) return;
    drawingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    pointsRef.current = [pt];
    setDraftPath("");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (mode === "zoom" && panDragRef.current) {
      const dx = e.clientX - panDragRef.current.x;
      const dy = e.clientY - panDragRef.current.y;
      setPan({
        x: panDragRef.current.panX + dx,
        y: panDragRef.current.panY + dy,
      });
      return;
    }
    if (!drawingRef.current) return;
    if (
      activePointerIdRef.current !== null &&
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }
    if (e.pointerType !== "pen") return;
    const pt = mmFromClient(e.clientX, e.clientY);
    if (!pt) return;
    pointsRef.current.push(pt);
    if (mode === "draw") {
      setDraftPath(
        pointsRef.current
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`)
          .join(" "),
      );
    }
  }

  async function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = pointsRef.current;
    pointsRef.current = [];
    setDraftPath("");
    const current = sheetSnapshotRef.current;
    if (!current || pts.length < 2) return;

    const activeId = current.activeLayerId;
    let pathsBefore: StrokePath[] = [];
    const layers = current.layers.map((layer) => {
      if (layer.id !== activeId) return layer;
      pathsBefore = clonePaths(layer.paths);
      if (mode === "erase") {
        return {
          ...layer,
          paths: erasePaths(layer.paths, pts, current.strokeWidthMm),
        };
      }
      const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`)
        .join(" ");
      return {
        ...layer,
        paths: [...layer.paths, { d, strokeWidth: current.strokeWidthMm }],
      };
    });
    setUndoStack((stack) => [
      ...stack,
      { layerId: activeId, pathsBefore },
    ]);
    const next: ScribSheet = { ...current, layers };
    commitSheet(next);
    persist(next);
  }

  const modeRef = useRef(mode);
  const scaleRef = useRef(scale);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === document.documentElement;
      setIsFullscreen(active);
      if (!active) {
        document.documentElement.classList.remove("scrib-fullscreen--header-hidden");
        setIsHeaderVisible(true);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /** Native non-passive wheel/touch so preventDefault is allowed (React listeners are passive). */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      if (modeRef.current !== "zoom") return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s * delta)));
    };

    const onTouchStartNative = (e: TouchEvent) => {
      if (modeRef.current !== "zoom" || e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { dist: dist0, scale: scaleRef.current };
    };

    const onTouchMoveNative = (e: TouchEvent) => {
      if (modeRef.current !== "zoom" || !pinchRef.current || e.touches.length !== 2) {
        return;
      }
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist1 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist1 / Math.max(1, pinchRef.current.dist);
      setScale(
        Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, pinchRef.current.scale * ratio),
        ),
      );
    };

    const onTouchEndNative = () => {
      pinchRef.current = null;
    };

    el.addEventListener("wheel", onWheelNative, { passive: false });
    el.addEventListener("touchstart", onTouchStartNative, { passive: true });
    el.addEventListener("touchmove", onTouchMoveNative, { passive: false });
    el.addEventListener("touchend", onTouchEndNative);
    el.addEventListener("touchcancel", onTouchEndNative);
    return () => {
      el.removeEventListener("wheel", onWheelNative);
      el.removeEventListener("touchstart", onTouchStartNative);
      el.removeEventListener("touchmove", onTouchMoveNative);
      el.removeEventListener("touchend", onTouchEndNative);
      el.removeEventListener("touchcancel", onTouchEndNative);
    };
  }, [sheet?.id]);

  function onPointerUp(e: React.PointerEvent) {
    if (mode === "zoom") {
      panDragRef.current = null;
      return;
    }
    if (
      activePointerIdRef.current !== null &&
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }
    activePointerIdRef.current = null;
    void finishStroke();
  }

  async function onUndo() {
    const current = sheetSnapshotRef.current;
    if (!current || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    const next: ScribSheet = {
      ...current,
      layers: current.layers.map((l) =>
        l.id === entry.layerId ? { ...l, paths: clonePaths(entry.pathsBefore) } : l,
      ),
    };
    commitSheet(next);
    persist(next);
  }

  async function enterFullscreen() {
    if (!document.fullscreenEnabled) return;
    try {
      setIsHeaderVisible(true);
      document.documentElement.classList.remove("scrib-fullscreen--header-hidden");
      await document.documentElement.requestFullscreen();
    } catch {
      setError("No se pudo abrir la pantalla completa.");
    }
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      setError("No se pudo cerrar la pantalla completa.");
    }
  }

  function toggleFullscreenHeader() {
    setIsHeaderVisible((visible) => {
      const nextVisible = !visible;
      document.documentElement.classList.toggle(
        "scrib-fullscreen--header-hidden",
        !nextVisible,
      );
      return nextVisible;
    });
  }

  if (!ids && error) {
    return (
      <ServiceGate serviceId="scrib" serviceLabel="Scrib" requireSubscription>
        <p className="scrib-dashboard__error">Ruta inválida. <a href={APP_ROUTES.scrib}>Volver</a></p>
      </ServiceGate>
    );
  }

  return (
    <ServiceGate serviceId="scrib" serviceLabel="Scrib" requireSubscription>
      <ScribHeaderMenu
        mode={mode}
        strokeWidthMm={sheet?.strokeWidthMm ?? 0.35}
        canUndo={undoStack.length > 0}
        saving={saving}
        isFullscreen={isFullscreen}
        onDashboard={() => {
          window.location.href = APP_ROUTES.scrib;
        }}
        onSelectZoom={() => setMode("zoom")}
        onSelectDraw={() => setMode("draw")}
        onStrokePlus={() => {
          const current = sheetSnapshotRef.current;
          if (!current) return;
          commitSheet({
            ...current,
            strokeWidthMm: Math.min(
              STROKE_MAX,
              +(current.strokeWidthMm + STROKE_STEP).toFixed(2),
            ),
          });
        }}
        onStrokeMinus={() => {
          const current = sheetSnapshotRef.current;
          if (!current) return;
          commitSheet({
            ...current,
            strokeWidthMm: Math.max(
              STROKE_MIN,
              +(current.strokeWidthMm - STROKE_STEP).toFixed(2),
            ),
          });
        }}
        onSelectErase={() => setMode("erase")}
        onEnterFullscreen={() => void enterFullscreen()}
        onOpenLayers={() => setLayersOpen(true)}
        onUndo={() => void onUndo()}
      />

      {loading ? <p className="scrib-dashboard__empty">Cargando hoja…</p> : null}
      {error ? <p className="scrib-dashboard__error">{error}</p> : null}

      {sheet ? (
        <div
          ref={viewportRef}
          className={`scrib-viewport${mode === "zoom" ? " scrib-viewport--zoom" : ""}`}
        >
          <div
            className="scrib-stage"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            }}
          >
            <div
              ref={sheetRef}
              className="scrib-page"
              style={{
                width: `${SCRIB_PAGE_WIDTH_MM}mm`,
                height: `${SCRIB_PAGE_HEIGHT_MM}mm`,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                className="scrib-page__bg"
                src={SCRIB_BG_SRC}
                alt=""
                draggable={false}
              />
              {sheet.layers.map((layer, index) => (
                <svg
                  key={layer.id}
                  className="scrib-layer"
                  viewBox={`0 0 ${SCRIB_PAGE_WIDTH_MM} ${SCRIB_PAGE_HEIGHT_MM}`}
                  width={`${SCRIB_PAGE_WIDTH_MM}mm`}
                  height={`${SCRIB_PAGE_HEIGHT_MM}mm`}
                  style={{
                    zIndex: index + 1,
                    opacity: layer.opacity,
                  }}
                  aria-hidden
                >
                  {layer.paths.map((path, i) => (
                    <path
                      key={`${layer.id}-${i}`}
                      d={path.d}
                      fill="none"
                      stroke={INK}
                      strokeWidth={path.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {layer.id === sheet.activeLayerId && draftPath && mode === "draw" ? (
                    <path
                      d={draftPath}
                      fill="none"
                      stroke={INK}
                      strokeWidth={sheet.strokeWidthMm}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.85}
                    />
                  ) : null}
                </svg>
              ))}
            </div>
          </div>
          {isFullscreen ? (
            <div className="scrib-fullscreen-controls">
              <button
                type="button"
                className="scrib-fullscreen-toggle-header"
                onClick={toggleFullscreenHeader}
                aria-label={isHeaderVisible ? "Ocultar barra lateral" : "Mostrar barra lateral"}
                title={isHeaderVisible ? "Ocultar barra lateral" : "Mostrar barra lateral"}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 4h16v16H4zM9 4v16M13 8l3 4-3 4" />
                </svg>
              </button>
              <button
                type="button"
                className="scrib-fullscreen-close"
                onClick={() => void exitFullscreen()}
                aria-label="Cerrar pantalla completa"
                title="Cerrar pantalla completa"
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {layersOpen && sheet ? (
        <div
          className="scrib-layers-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Capas"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setLayersOpen(false);
            const latest = sheetSnapshotRef.current;
            if (latest) persist(latest);
          }}
        >
          <div className="scrib-layers-modal__panel">
            <header className="scrib-layers-modal__head">
              <h2>Capas</h2>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setLayersOpen(false);
                  const latest = sheetSnapshotRef.current;
                  if (latest) persist(latest);
                }}
              >
                Cerrar
              </button>
            </header>
            <ul className="scrib-layers-list">
              {sheet.layers.map((layer) => {
                const id = layer.id as ScribLayerId;
                const label = SCRIB_LAYER_LABELS[id] ?? layer.id;
                return (
                  <li key={layer.id} className="scrib-layer-card">
                    <label className="scrib-layer-card__active">
                      <input
                        type="radio"
                        name="scrib-active-layer"
                        checked={sheet.activeLayerId === layer.id}
                        onChange={() =>
                          {
                            const current = sheetSnapshotRef.current;
                            if (current) commitSheet({ ...current, activeLayerId: layer.id });
                          }
                        }
                      />
                      <span>{label}</span>
                    </label>
                    <label className="scrib-layer-card__opacity">
                      Opacidad
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(e) => {
                          const opacity = Number(e.target.value);
                          const current = sheetSnapshotRef.current;
                          if (!current) return;
                          commitSheet({
                            ...current,
                            layers: current.layers.map((l) =>
                              l.id === layer.id ? { ...l, opacity } : l,
                            ),
                          });
                        }}
                      />
                      <span>{Math.round(layer.opacity * 100)}%</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </ServiceGate>
  );
}
