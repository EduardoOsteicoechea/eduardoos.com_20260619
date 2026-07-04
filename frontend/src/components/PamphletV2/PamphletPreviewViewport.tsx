/**
 * PamphletPreviewViewport.tsx — Interactive preview canvas wrapper (zoom / pan modes).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { PreviewInteractionMode, PreviewPan } from "../../lib/pamphletPreviewInteraction";
import "./PamphletPreviewViewport.css";

interface PamphletPreviewViewportProps {
  mode: PreviewInteractionMode | null;
  zoomScale: number;
  pan: PreviewPan;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanChange: (x: number, y: number) => void;
  onExitMode: () => void;
  children: ReactNode;
}

export function PamphletPreviewViewport({
  mode,
  zoomScale,
  pan,
  onZoomIn,
  onZoomOut,
  onPanChange,
  onExitMode,
  children,
}: PamphletPreviewViewportProps) {
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (!mode) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onExitMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, onExitMode]);

  useEffect(() => {
    if (mode !== "drag") {
      return;
    }
    function handleMouseMove(event: MouseEvent) {
      const start = dragStartRef.current;
      if (!start) {
        return;
      }
      onPanChange(start.panX + (event.clientX - start.x), start.panY + (event.clientY - start.y));
    }
    function handleMouseUp() {
      dragStartRef.current = null;
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mode, onPanChange]);

  function handleStageClick() {
    if (mode === "zoom-in") {
      onZoomIn();
    }
    if (mode === "zoom-out") {
      onZoomOut();
    }
  }

  function handleStageMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "drag") {
      return;
    }
    event.preventDefault();
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  const stageStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`,
  } as CSSProperties;

  const viewportClass = [
    "pamphlet-preview-viewport",
    mode ? "is-mode-active" : "",
    mode ? `is-mode-${mode}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={viewportClass} data-testid="pamphlet-preview-viewport">
      {mode ? (
        <button
          type="button"
          className="pamphlet-preview-viewport__exit pamphlet-no-print"
          aria-label="Exit preview mode"
          onClick={(event) => {
            event.stopPropagation();
            onExitMode();
          }}
        >
          ✕
        </button>
      ) : null}
      <div
        className="pamphlet-preview-viewport__stage"
        data-testid="pamphlet-preview-stage"
        style={stageStyle}
        onClick={mode === "zoom-in" || mode === "zoom-out" ? handleStageClick : undefined}
        onMouseDown={handleStageMouseDown}
        role={mode === "zoom-in" || mode === "zoom-out" ? "button" : undefined}
        aria-label={
          mode === "zoom-in"
            ? "Click to zoom in"
            : mode === "zoom-out"
              ? "Click to zoom out"
              : mode === "drag"
                ? "Drag to move preview"
                : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export default PamphletPreviewViewport;
