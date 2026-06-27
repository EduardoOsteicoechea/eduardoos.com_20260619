/**
 * PamphletEditor.tsx — Spiritual pamphlet layout editor (Astro + React).
 *
 * Workflow:
 * 1. Authenticated user loads default JSON via GET /api/pamphlets/document
 * 2. Sidebar layout fields drive GET /api/pamphlets/preview-sheets HTML fragment
 * 3. Capacity telemetry refreshes from GET /api/pamphlets/capacity
 * 4. Inline edits on data-content-ref blocks POST /api/pamphlets/content (op: update)
 * 5. Browser print exports letter-landscape sheets (CSS @media print)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthToken } from "../../lib/auth";
import {
  DEFAULT_LAYOUT,
  fetchCapacity,
  fetchPreviewSheets,
  mutatePamphletContent,
  resetPamphletDocument,
  updatePamphletContent,
  uploadPamphletImage,
  type CapacityTelemetry,
  type LayoutFields,
} from "../../lib/pamphlets";
import "./PamphletEditor.css";

const LAYOUT_FIELDS: { key: keyof LayoutFields; label: string; step?: number }[] = [
  { key: "marginLateral", label: "Margin lateral (mm)", step: 0.5 },
  { key: "marginVertical", label: "Margin vertical (mm)", step: 0.5 },
  { key: "midMargin", label: "Mid separation (mm)", step: 0.5 },
  { key: "colSep", label: "Column gap (mm)", step: 0.5 },
  { key: "hfGap", label: "Header/footer gap (mm)", step: 0.5 },
  { key: "fontSize", label: "Font size (pt)", step: 0.5 },
  { key: "lineHeight", label: "Line height", step: 0.05 },
  { key: "paragraphSep", label: "Paragraph sep", step: 0.1 },
  { key: "headingBottomMargin", label: "Heading margin (mm)", step: 0.5 },
];

const SHEET_WIDTH_IN = 11;

export default function PamphletEditor() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeRef, setActiveRef] = useState("");
  const [activeIsImage, setActiveIsImage] = useState(false);

  const [layout, setLayout] = useState<LayoutFields>(DEFAULT_LAYOUT);
  const [previewHtml, setPreviewHtml] = useState("");
  const [capacity, setCapacity] = useState<CapacityTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [scale, setScale] = useState(1);

  const editingRef = useRef<HTMLElement | null>(null);
  const authed = Boolean(getAuthToken());

  async function applyMutation(body: Record<string, unknown>) {
    setRefreshing(true);
    setError("");
    try {
      const result = await mutatePamphletContent(body, layout);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus("Content updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mutation failed");
    } finally {
      setRefreshing(false);
    }
  }

  const applyPreviewScale = useCallback(() => {
    const viewport = viewportRef.current;
    const sheets = sheetsRef.current;
    if (!viewport || !sheets) return;
    sheets.style.transform = "none";
    const naturalW = sheets.offsetWidth;
    const available = viewport.clientWidth - 24;
    const sheetPx = naturalW > 0 ? naturalW : SHEET_WIDTH_IN * 96;
    const fitScale = sheetPx > 0 ? Math.min(1, available / sheetPx) : 1;
    setScale(fitScale);
    sheets.style.transform = `scale(${fitScale.toFixed(4)})`;
    sheets.style.transformOrigin = "top center";
    if (canvasRef.current) {
      const naturalH = sheets.offsetHeight;
      canvasRef.current.style.width = `${Math.ceil(naturalW * fitScale)}px`;
      canvasRef.current.style.height = `${Math.ceil(naturalH * fitScale)}px`;
    }
  }, []);

  const refreshPreview = useCallback(
    async (nextLayout: LayoutFields) => {
      if (!getAuthToken()) return;
      setRefreshing(true);
      setError("");
      try {
        const [html, cap] = await Promise.all([
          fetchPreviewSheets(nextLayout),
          fetchCapacity(nextLayout),
        ]);
        setPreviewHtml(html);
        setCapacity(cap);
        setStatus("Preview updated");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview refresh failed");
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        await refreshPreview(DEFAULT_LAYOUT);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pamphlet editor");
      } finally {
        setLoading(false);
      }
    })();
  }, [authed, refreshPreview]);

  useEffect(() => {
    applyPreviewScale();
    window.addEventListener("resize", applyPreviewScale);
    return () => window.removeEventListener("resize", applyPreviewScale);
  }, [previewHtml, applyPreviewScale]);

  const scheduleRefresh = useCallback(
    (nextLayout: LayoutFields) => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshPreview(nextLayout);
      }, 350);
    },
    [refreshPreview],
  );

  function onLayoutChange(key: keyof LayoutFields, raw: string) {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const next = { ...layout, [key]: parsed };
    setLayout(next);
    scheduleRefresh(next);
  }

  async function handleReset() {
    setRefreshing(true);
    setError("");
    try {
      const result = await resetPamphletDocument(layout);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus("Document reset to defaults");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setRefreshing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function stripHighlightMarkup(html: string): string {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent ?? "";
  }

  function bindEditableBlocks(root: HTMLDivElement | null) {
    if (!root) return;
    const blocks = root.querySelectorAll<HTMLElement>(".editable-block[data-content-ref]");
    blocks.forEach((el) => {
      el.addEventListener("click", onBlockClick);
      el.addEventListener("keydown", onBlockKeyDown);
      el.addEventListener("blur", onBlockBlur);
    });
    return () => {
      blocks.forEach((el) => {
        el.removeEventListener("click", onBlockClick);
        el.removeEventListener("keydown", onBlockKeyDown);
        el.removeEventListener("blur", onBlockBlur);
      });
    };
  }

  function onBlockClick(event: Event) {
    const el = event.currentTarget as HTMLElement;
    const ref = el.getAttribute("data-content-ref") ?? "";
    setActiveRef(ref);
    setActiveIsImage(false);
    if (el.classList.contains("is-editing")) return;
    editingRef.current = el;
    el.classList.add("is-editing");
    el.contentEditable = "true";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function onBlockKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const el = event.currentTarget as HTMLElement;
      el.contentEditable = "false";
      el.classList.remove("is-editing");
      editingRef.current = null;
      void refreshPreview(layout);
    }
  }

  async function onBlockBlur(event: Event) {
    const el = event.currentTarget as HTMLElement;
    if (!el.classList.contains("is-editing")) return;
    const ref = el.getAttribute("data-content-ref") ?? "";
    const field = el.getAttribute("data-content-field") ?? undefined;
    const value = stripHighlightMarkup(el.innerHTML).trim();
    el.contentEditable = "false";
    el.classList.remove("is-editing");
    editingRef.current = null;
    setActiveRef("");
    if (!ref) return;
    setRefreshing(true);
    try {
      const result = await updatePamphletContent(ref, value, layout, field);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus(`Saved ${ref}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRefreshing(false);
    }
  }

  function onImageBlockClick(event: Event) {
    const el = event.currentTarget as HTMLElement;
    const ref = el.getAttribute("data-content-ref") ?? "";
    setActiveRef(ref);
    setActiveIsImage(true);
    el.classList.add("is-selected");
    sheetsRef.current
      ?.querySelectorAll<HTMLElement>(".block-image-wrap.is-selected")
      .forEach((node) => {
        if (node !== el) {
          node.classList.remove("is-selected");
        }
      });
  }

  function onImageCaptionClick(event: Event) {
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const wrap = el.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
    const ref = wrap?.getAttribute("data-content-ref") ?? "";
    if (ref) {
      setActiveRef(ref);
      setActiveIsImage(true);
    }
    if (el.classList.contains("is-editing")) return;
    editingRef.current = el;
    el.classList.add("is-editing");
    el.contentEditable = "true";
    el.focus();
  }

  function bindImageBlocks(root: HTMLDivElement | null) {
    if (!root) return;
    const blocks = root.querySelectorAll<HTMLElement>(".block-image-wrap[data-content-ref]");
    const captions = root.querySelectorAll<HTMLElement>(".block-image-ref");
    blocks.forEach((el) => {
      el.addEventListener("click", onImageBlockClick);
    });
    captions.forEach((el) => {
      el.addEventListener("click", onImageCaptionClick);
      el.addEventListener("keydown", onBlockKeyDown);
      el.addEventListener("blur", onBlockBlur);
      el.setAttribute("data-content-field", "description");
      const wrap = el.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
      if (wrap) {
        el.setAttribute("data-content-ref", wrap.getAttribute("data-content-ref") ?? "");
      }
    });
    return () => {
      blocks.forEach((el) => {
        el.removeEventListener("click", onImageBlockClick);
      });
      captions.forEach((el) => {
        el.removeEventListener("click", onImageCaptionClick);
        el.removeEventListener("keydown", onBlockKeyDown);
        el.removeEventListener("blur", onBlockBlur);
      });
    };
  }

  function openImagePicker() {
    fileInputRef.current?.click();
  }

  async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeRef) return;
    setRefreshing(true);
    setError("");
    try {
      const result = await uploadPamphletImage(activeRef, file, layout);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus(`Image uploaded for ${activeRef}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleToolbarAction(op: string) {
    if (!activeRef) return;
    if (op === "toggle_highlight") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const el =
        editingRef.current ??
        sheetsRef.current?.querySelector<HTMLElement>(`[data-content-ref="${activeRef}"]`);
      if (!el || !el.contains(range.commonAncestorContainer)) return;
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const end = start + range.toString().length;
      await applyMutation({ op: "toggle_highlight", ref: activeRef, start, end });
      return;
    }
    await applyMutation({ op, ref: activeRef });
  }

  useEffect(() => {
    const cleanupText = bindEditableBlocks(sheetsRef.current);
    const cleanupImages = bindImageBlocks(sheetsRef.current);
    return () => {
      cleanupText?.();
      cleanupImages?.();
    };
  }, [previewHtml, layout]);

  if (!authed) {
    return (
      <section className="pamphlet-editor pamphlet-editor--gate">
        <h1>Pamphlet Generator</h1>
        <p className="pamphlet-editor__lead">
          Sign in to edit spiritual pamphlet layouts and export print-ready sheets.
        </p>
        <p>
          <a className="pamphlet-editor__auth-link" href={APP_ROUTES.login}>
            Log in
          </a>
          {" · "}
          <a className="pamphlet-editor__auth-link" href={APP_ROUTES.register}>
            Register
          </a>
        </p>
      </section>
    );
  }

  return (
    <section className="pamphlet-editor">
      <aside className="pamphlet-editor__sidebar" aria-label="Layout controls">
        <header className="pamphlet-editor__sidebar-head">
          <h1>Pamphlet</h1>
          <p className="pamphlet-editor__sidebar-sub">11×8.5 in · 8-column flow</p>
        </header>

        <div className="pamphlet-editor__toolbar">
          <button type="button" className="pamphlet-editor__btn pamphlet-editor__btn--reset" onClick={() => void handleReset()} disabled={refreshing}>
            Reset JSON
          </button>
          <button type="button" className="pamphlet-editor__btn pamphlet-editor__btn--print" onClick={handlePrint}>
            Print PDF
          </button>
        </div>

        <div className="pamphlet-editor__fields" role="group" aria-label="Layout parameters">
          {LAYOUT_FIELDS.map((field) => (
            <label key={field.key} className="pamphlet-editor__field">
              <span>{field.label}</span>
              <input
                type="number"
                className="pamphlet-editor__input"
                value={layout[field.key]}
                step={field.step ?? 1}
                onChange={(e) => onLayoutChange(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        {capacity && (
          <div
            className="pamphlet-editor__capacity"
            dangerouslySetInnerHTML={{ __html: capacity.readout_html }}
          />
        )}
        {capacity?.warning ? (
          <p className="pamphlet-editor__overflow" role="alert">
            {capacity.warning}
          </p>
        ) : null}
        {capacity?.column_summary ? (
          <p className="pamphlet-editor__columns">{capacity.column_summary}</p>
        ) : null}

        <p className="pamphlet-editor__status" aria-live="polite">
          {loading ? "Loading…" : refreshing ? "Refreshing…" : status}
          {scale < 1 ? ` · Fit ${Math.round(scale * 100)}%` : ""}
        </p>
        {error ? (
          <p className="pamphlet-editor__error" role="alert">
            {error}
          </p>
        ) : null}
      </aside>

      <main className="pamphlet-editor__main">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="pamphlet-editor__file-input"
          onChange={(e) => void handleImageSelected(e)}
          tabIndex={-1}
          aria-hidden
        />
        {activeRef ? (
          <div className="pamphlet-editor__block-toolbar" role="toolbar" aria-label="Block tools">
            {activeIsImage ? (
              <button type="button" title="Upload image" onClick={openImagePicker}>
                Img
              </button>
            ) : (
              <button type="button" title="Toggle bold" onClick={() => void handleToolbarAction("toggle_highlight")}>
                B
              </button>
            )}
            <button type="button" title="Move up" onClick={() => void handleToolbarAction("move_up")}>↑</button>
            <button type="button" title="Move down" onClick={() => void handleToolbarAction("move_down")}>↓</button>
            <button type="button" title="Insert below" onClick={() => void handleToolbarAction("insert_below")}>+</button>
            <button type="button" title="Delete" onClick={() => void handleToolbarAction("delete")}>✕</button>
          </div>
        ) : null}
        <div className="pamphlet-editor__viewport" ref={viewportRef}>
          <div className="pamphlet-editor__canvas" ref={canvasRef}>
            <div
              className="pamphlet-editor__sheets"
              ref={sheetsRef}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      </main>

      {refreshing ? (
        <div className="pamphlet-editor__loading" aria-hidden={!refreshing}>
          <div className="pamphlet-editor__spinner" />
        </div>
      ) : null}
    </section>
  );
}
