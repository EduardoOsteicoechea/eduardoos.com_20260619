/**
 * PamphletEditor.tsx — Spiritual pamphlet layout editor (Astro + React).
 *
 * Workflow:
 * 1. Authenticated user loads persisted layout via GET /api/pamphlets/layout
 * 2. Bottom activity bar drives layout fields, capacity, registry, pages, zoom
 * 3. Live preview from GET /api/pamphlets/preview-sheets HTML fragment
 * 4. Event delegation on sheets container for inline edits and image tools
 * 5. Browser print exports letter-landscape sheets (CSS @media print)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthToken } from "../../lib/auth";
import { pamphletDebug, pamphletDebugError } from "../../lib/pamphletDebug";
import {
  DEFAULT_LAYOUT,
  fetchCapacity,
  fetchPamphletLayout,
  fetchPamphletRegistry,
  fetchPreviewSheets,
  mutatePamphletContent,
  resetPamphletDocument,
  savePamphletLayout,
  updatePamphletContent,
  uploadPamphletImage,
  type CapacityTelemetry,
  type LayoutFields,
  type PamphletRegistryItem,
} from "../../lib/pamphlets";
import PamphletActivityBar, { type ActivityPanel } from "./PamphletActivityBar";
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
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const MOBILE_STREAM_MAX = 899;
const DESKTOP_MIN = 1024;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function stripHighlightMarkup(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? "";
}

export default function PamphletEditor() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutFields>(DEFAULT_LAYOUT);
  const editingRef = useRef<HTMLElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const suppressBlurRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const saveLayoutTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [layout, setLayout] = useState<LayoutFields>(DEFAULT_LAYOUT);
  const [previewHtml, setPreviewHtml] = useState("");
  const [capacity, setCapacity] = useState<CapacityTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [userZoom, setUserZoom] = useState(1);
  const [activeRef, setActiveRef] = useState("");
  const [activeIsImage, setActiveIsImage] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivityPanel>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pamphlets, setPamphlets] = useState<PamphletRegistryItem[]>([]);
  const [sortBy, setSortBy] = useState<"alpha" | "date">("alpha");
  const [isMobileStream, setIsMobileStream] = useState(false);

  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getAuthToken()));
    setIsMobileStream(window.innerWidth <= MOBILE_STREAM_MAX);
  }, []);

  layoutRef.current = layout;

  const applyMutation = useCallback(async (body: Record<string, unknown>) => {
    setRefreshing(true);
    setError("");
    pamphletDebug("mutation", { op: String(body.op ?? ""), ref: body.ref });
    try {
      const result = await mutatePamphletContent(body, layoutRef.current);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus("Content updated");
    } catch (err) {
      pamphletDebugError("mutation_failed", err, body);
      setError(err instanceof Error ? err.message : "Mutation failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const refreshPreview = useCallback(async (nextLayout: LayoutFields) => {
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
      pamphletDebugError("preview_refresh_failed", err);
      setError(err instanceof Error ? err.message : "Preview refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const applySheetScale = useCallback(() => {
    const viewport = viewportRef.current;
    const sheets = sheetsRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !sheets) return;

    const isDesktop = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`).matches;
    sheets.style.transform = "none";

    const naturalW = sheets.offsetWidth;
    const naturalH = sheets.offsetHeight;
    const sheetPx = naturalW > 0 ? naturalW : SHEET_WIDTH_IN * 96;

    let scale = userZoom;
    if (!isDesktop) {
      const available = viewport.clientWidth - 24;
      const fitScale = sheetPx > 0 ? available / sheetPx : 1;
      if (fitScale < userZoom) {
        scale = fitScale;
      }
    }

    sheets.style.transform = `scale(${scale.toFixed(4)})`;
    sheets.style.transformOrigin = "top center";

    if (canvas) {
      canvas.style.width = `${Math.ceil(sheetPx * scale)}px`;
      canvas.style.height = `${Math.ceil(naturalH * scale)}px`;
    }
  }, [userZoom]);

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

  const scheduleLayoutSave = useCallback((nextLayout: LayoutFields) => {
    if (saveLayoutTimerRef.current !== null) {
      window.clearTimeout(saveLayoutTimerRef.current);
    }
    saveLayoutTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await savePamphletLayout(nextLayout);
          pamphletDebug("layout_saved", { debounced: true });
          setStatus("Layout saved");
        } catch (err) {
          pamphletDebugError("layout_save_failed", err);
          setError(err instanceof Error ? err.message : "Layout save failed");
        }
      })();
    }, 800);
  }, []);

  const onLayoutChange = useCallback(
    (key: keyof LayoutFields, raw: string) => {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      const next = { ...layoutRef.current, [key]: parsed };
      setLayout(next);
      scheduleRefresh(next);
      scheduleLayoutSave(next);
    },
    [scheduleRefresh, scheduleLayoutSave],
  );

  const handleSaveLayout = useCallback(async () => {
    setError("");
    try {
      await savePamphletLayout(layoutRef.current);
      pamphletDebug("layout_saved", { manual: true });
      setStatus("Layout settings saved");
    } catch (err) {
      pamphletDebugError("layout_save_failed", err);
      setError(err instanceof Error ? err.message : "Layout save failed");
    }
  }, []);

  const handleReset = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const result = await resetPamphletDocument(layoutRef.current);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus("Document reset to defaults");
      pamphletDebug("document_reset");
    } catch (err) {
      pamphletDebugError("reset_failed", err);
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleZoomChange = useCallback((next: number) => {
    setUserZoom(clampZoom(next));
  }, []);

  const onJumpToPage = useCallback((index: number) => {
    const sheets = sheetsRef.current?.querySelectorAll(".sheet");
    const sheet = sheets?.[index];
    if (sheet) {
      sheet.scrollIntoView({ behavior: "smooth", block: "start" });
      pamphletDebug("jump_to_page", { index });
    }
  }, []);

  const loadRegistry = useCallback(async (sort: "alpha" | "date") => {
    try {
      const items = await fetchPamphletRegistry(sort);
      setPamphlets(items);
    } catch (err) {
      pamphletDebugError("registry_load_failed", err);
    }
  }, []);

  const onSelectPamphlet = useCallback(
    async (id: string) => {
      setRefreshing(true);
      setError("");
      try {
        const nextLayout = await fetchPamphletLayout(id);
        setLayout(nextLayout);
        await refreshPreview(nextLayout);
        setStatus(`Loaded ${id}`);
        pamphletDebug("pamphlet_selected", { pamphletId: id });
      } catch (err) {
        pamphletDebugError("pamphlet_select_failed", err, { pamphletId: id });
        setError(err instanceof Error ? err.message : "Failed to load pamphlet");
      } finally {
        setRefreshing(false);
      }
    },
    [refreshPreview],
  );

  const enterEditMode = useCallback((el: HTMLElement) => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    suppressBlurRef.current = true;
    window.setTimeout(() => {
      suppressBlurRef.current = false;
    }, 250);

    const ref = el.getAttribute("data-content-ref") ?? "";
    setActiveRef(ref);
    setActiveIsImage(el.classList.contains("block-image-ref"));
    if (el.classList.contains("is-editing")) return;

    pamphletDebug("edit_click", { ref, field: el.getAttribute("data-content-field") ?? undefined });

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
  }, []);

  const selectImageWrap = useCallback((wrap: HTMLElement) => {
    const ref = wrap.getAttribute("data-content-ref") ?? "";
    setActiveRef(ref);
    setActiveIsImage(true);
    wrap.classList.add("is-selected");
    sheetsRef.current
      ?.querySelectorAll<HTMLElement>(".block-image-wrap.is-selected")
      .forEach((node) => {
        if (node !== wrap) {
          node.classList.remove("is-selected");
        }
      });
    pamphletDebug("image_select", { ref });
  }, []);

  const finishEditing = useCallback(async (el: HTMLElement) => {
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
    pamphletDebug("content_save", { ref, field });
    try {
      const result = await updatePamphletContent(ref, value, layoutRef.current, field);
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      setStatus(`Saved ${ref}`);
    } catch (err) {
      pamphletDebugError("content_save_failed", err, { ref, field });
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSheetsClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const root = sheetsRef.current;
      if (!root || !root.contains(target)) return;

      const clearBtn = target.closest<HTMLElement>("[data-image-clear]");
      if (clearBtn) {
        event.preventDefault();
        event.stopPropagation();
        const wrap = clearBtn.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
        const ref = wrap?.getAttribute("data-content-ref") ?? "";
        if (ref) {
          if (editingRef.current) {
            const editing = editingRef.current;
            editing.contentEditable = "false";
            editing.classList.remove("is-editing");
            editingRef.current = null;
          }
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
          setActiveRef("");
          setActiveIsImage(false);
          suppressBlurRef.current = true;
          void applyMutation({ op: "clear_image", ref }).finally(() => {
            window.setTimeout(() => {
              suppressBlurRef.current = false;
            }, 150);
          });
        }
        return;
      }

      const caption = target.closest<HTMLElement>(".block-image-ref");
      if (caption) {
        event.stopPropagation();
        const wrap = caption.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
        const ref = wrap?.getAttribute("data-content-ref") ?? "";
        if (ref) {
          setActiveRef(ref);
          setActiveIsImage(true);
        }
        if (!caption.hasAttribute("data-content-ref") && wrap) {
          caption.setAttribute("data-content-ref", ref);
        }
        if (!caption.hasAttribute("data-content-field")) {
          caption.setAttribute("data-content-field", "description");
        }
        enterEditMode(caption);
        return;
      }

      const imageWrap = target.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
      if (imageWrap) {
        selectImageWrap(imageWrap);
        return;
      }

      const block = target.closest<HTMLElement>(".editable-block[data-content-ref]");
      if (block) {
        enterEditMode(block);
      }
    },
    [applyMutation, enterEditMode, selectImageWrap],
  );

  const handleSheetsKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains("is-editing")) return;

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        target.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        target.contentEditable = "false";
        target.classList.remove("is-editing");
        editingRef.current = null;
        void refreshPreview(layoutRef.current);
      }
    },
    [refreshPreview],
  );

  const handleSheetsMouseDown = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const root = sheetsRef.current;
    if (!root || !root.contains(target)) return;
    if (target.closest("[data-image-clear]")) return;

    const editable = target.closest<HTMLElement>(
      ".editable-block[data-content-ref], .block-image-ref",
    );
    if (editable && !editable.classList.contains("is-editing")) {
      event.preventDefault();
    }
  }, []);

  const handleSheetsFocusOut = useCallback(
    (event: FocusEvent) => {
      const root = sheetsRef.current;
      const target = event.target as HTMLElement;
      if (!root || !target.classList.contains("is-editing")) return;
      if (suppressBlurRef.current) return;

      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null;
        if (suppressBlurRef.current) return;
        if (!target.isConnected || !target.classList.contains("is-editing")) return;
        const active = document.activeElement;
        if (active === target || target.contains(active)) return;
        void finishEditing(target);
      }, 120);
    },
    [finishEditing],
  );

  const openImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !activeRef) return;
      setRefreshing(true);
      setError("");
      try {
        const result = await uploadPamphletImage(activeRef, file, layoutRef.current);
        setPreviewHtml(result.html);
        setCapacity(result.capacity);
        setStatus(`Image uploaded for ${activeRef}`);
        pamphletDebug("image_upload", { ref: activeRef });
      } catch (err) {
        pamphletDebugError("image_upload_failed", err, { ref: activeRef });
        setError(err instanceof Error ? err.message : "Image upload failed");
      } finally {
        setRefreshing(false);
      }
    },
    [activeRef],
  );

  const handleToolbarAction = useCallback(
    async (op: string) => {
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
    },
    [activeRef, applyMutation],
  );

  useEffect(() => {
    if (!authed) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const savedLayout = await fetchPamphletLayout();
        setLayout(savedLayout);
        await refreshPreview(savedLayout);
      } catch (err) {
        pamphletDebugError("initial_load_failed", err);
        setError(err instanceof Error ? err.message : "Failed to load pamphlet editor");
      } finally {
        setLoading(false);
      }
    })();
  }, [authed, refreshPreview]);

  useEffect(() => {
    if (!authed) return;
    void loadRegistry(sortBy);
  }, [authed, loadRegistry, sortBy]);

  useEffect(() => {
    applySheetScale();
    window.addEventListener("resize", applySheetScale);
    return () => window.removeEventListener("resize", applySheetScale);
  }, [previewHtml, userZoom, applySheetScale]);

  useEffect(() => {
    const syncMobileStream = () => {
      setIsMobileStream(window.innerWidth <= MOBILE_STREAM_MAX);
    };
    syncMobileStream();
    window.addEventListener("resize", syncMobileStream);
    return () => window.removeEventListener("resize", syncMobileStream);
  }, []);

  useEffect(() => {
    const root = sheetsRef.current;
    if (!root) return;

    const editing = editingRef.current;
    if (editing?.isConnected && editing.classList.contains("is-editing")) {
      return;
    }

    root.innerHTML = previewHtml;
    setPageCount(previewHtml ? root.querySelectorAll(".sheet").length : 0);
  }, [previewHtml]);

  useEffect(() => {
    const root = sheetsRef.current;
    if (!root) return;

    root.addEventListener("mousedown", handleSheetsMouseDown);
    root.addEventListener("click", handleSheetsClick);
    root.addEventListener("keydown", handleSheetsKeyDown);
    root.addEventListener("focusout", handleSheetsFocusOut);

    return () => {
      root.removeEventListener("mousedown", handleSheetsMouseDown);
      root.removeEventListener("click", handleSheetsClick);
      root.removeEventListener("keydown", handleSheetsKeyDown);
      root.removeEventListener("focusout", handleSheetsFocusOut);
    };
  }, [previewHtml, handleSheetsMouseDown, handleSheetsClick, handleSheetsKeyDown, handleSheetsFocusOut]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      if (saveLayoutTimerRef.current !== null) {
        window.clearTimeout(saveLayoutTimerRef.current);
      }
    };
  }, []);

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

  const editorClass = [
    "pamphlet-editor",
    isMobileStream ? "pamphlet-editor--mobile-stream" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={editorClass}>
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
              <button
                type="button"
                title="Toggle bold"
                onClick={() => void handleToolbarAction("toggle_highlight")}
              >
                B
              </button>
            )}
            <button type="button" title="Move up" onClick={() => void handleToolbarAction("move_up")}>
              ↑
            </button>
            <button type="button" title="Move down" onClick={() => void handleToolbarAction("move_down")}>
              ↓
            </button>
            <button type="button" title="Insert below" onClick={() => void handleToolbarAction("insert_below")}>
              +
            </button>
            <button type="button" title="Delete" onClick={() => void handleToolbarAction("delete")}>
              ✕
            </button>
          </div>
        ) : null}
        <div className="pamphlet-editor__viewport" ref={viewportRef}>
          <div className="pamphlet-editor__canvas" ref={canvasRef}>
            <div className="pamphlet-editor__sheets" ref={sheetsRef} />
          </div>
        </div>
      </main>

      <PamphletActivityBar
        activePanel={activePanel}
        onPanelToggle={setActivePanel}
        layout={layout}
        layoutFields={LAYOUT_FIELDS}
        onLayoutChange={onLayoutChange}
        capacity={capacity}
        pamphlets={pamphlets}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onSelectPamphlet={(id) => void onSelectPamphlet(id)}
        onSaveLayout={() => void handleSaveLayout()}
        pageCount={pageCount}
        onJumpToPage={onJumpToPage}
        userZoom={userZoom}
        onZoomChange={handleZoomChange}
        onReset={() => void handleReset()}
        onPrint={handlePrint}
        refreshing={refreshing || loading}
        status={loading ? "Loading…" : status}
        error={error}
      />

      {refreshing ? (
        <div className="pamphlet-editor__loading" aria-hidden={!refreshing}>
          <div className="pamphlet-editor__spinner" />
        </div>
      ) : null}
    </section>
  );
}
