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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthToken } from "../../lib/auth";
import {
  pamphletAuditBlockSpacing,
  pamphletDebug,
  pamphletDebugError,
  pamphletDomSummary,
  pamphletLogMobileStream,
  pamphletLogPrintSource,
  pamphletResetTrace,
  pamphletTrace,
} from "../../lib/pamphletDebug";
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
/** Mobile + tablet: column stream UI; desktop (1024+) shows scaled sheet preview. */
const STREAM_BREAKPOINT = 1023;
const DESKTOP_MIN = 1024;

const EDITABLE_SELECTOR =
  ".editable-block[data-content-ref], .editable-type-block[data-content-ref]";

const SHEET_SPACING_VARS = ["--para-sep-mm", "--heading-gap-mm"] as const;

function copySheetSpacingVars(sourceNode: HTMLElement, target: HTMLElement): void {
  const sheet = sourceNode.closest<HTMLElement>(".sheet");
  if (!sheet) {
    pamphletTrace("spacing_vars_missing_sheet", { sourceId: sourceNode.id || undefined });
    return;
  }
  for (const name of SHEET_SPACING_VARS) {
    const value = sheet.style.getPropertyValue(name);
    if (value) {
      target.style.setProperty(name, value);
    }
  }
  pamphletTrace("spacing_vars_copied", {
    sourceId: sourceNode.id || undefined,
    paraSep: target.style.getPropertyValue("--para-sep-mm") || undefined,
    headingGap: target.style.getPropertyValue("--heading-gap-mm") || undefined,
  });
}

function syncMobileStreamCards(source: HTMLElement, target: HTMLElement): number {
  target.innerHTML = "";
  const ordered = [...source.querySelectorAll<HTMLElement>("[data-mobile-order]")].sort(
    (a, b) =>
      Number(a.getAttribute("data-mobile-order") ?? 0) -
      Number(b.getAttribute("data-mobile-order") ?? 0),
  );

  for (const node of ordered) {
    const card = document.createElement("article");
    card.className = "pamphlet-mobile-card";
    card.setAttribute("data-mobile-order", node.getAttribute("data-mobile-order") ?? "");
    if (node.id) {
      card.setAttribute("data-stream-source-id", node.id);
    }
    copySheetSpacingVars(node, card);
    card.appendChild(node.cloneNode(true));
    target.appendChild(card);
  }

  return ordered.length;
}

function describeClickTarget(target: HTMLElement): Record<string, unknown> {
  return {
    target: pamphletDomSummary(target),
    editable: pamphletDomSummary(target.closest<HTMLElement>(EDITABLE_SELECTOR)),
    imageWrap: pamphletDomSummary(target.closest<HTMLElement>(".block-image-wrap[data-content-ref]")),
    caption: pamphletDomSummary(target.closest<HTMLElement>(".block-image-ref")),
    clearBtn: Boolean(target.closest("[data-image-clear]")),
  };
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function findActiveBlockElement(
  root: HTMLElement | null,
  ref: string,
  isImage: boolean,
): HTMLElement | null {
  if (!root || !ref) return null;
  if (isImage) {
    return root.querySelector<HTMLElement>(`.block-image-wrap[data-content-ref="${ref}"]`);
  }
  const editing = root.querySelector<HTMLElement>(`.is-editing[data-content-ref="${ref}"]`);
  if (editing) return editing;
  return root.querySelector<HTMLElement>(`[data-content-ref="${ref}"]`);
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
  const mobileStreamRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const viewportScrollRef = useRef(0);
  const preserveScrollRef = useRef(false);
  const resetScrollOnPreviewRef = useRef(false);
  const pendingEditRef = useRef("");
  const layoutRef = useRef<LayoutFields>(DEFAULT_LAYOUT);
  const editingRef = useRef<HTMLElement | null>(null);
  const editOriginalRef = useRef("");
  const blurTimerRef = useRef<number | null>(null);
  const suppressBlurRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const saveLayoutTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetHandlersRef = useRef({
    click: (_event: MouseEvent) => {},
    keydown: (_event: KeyboardEvent) => {},
    focusout: (_event: FocusEvent) => {},
  });

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
  const [isMobileStream, setIsMobileStream] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= STREAM_BREAKPOINT,
  );

  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(getAuthToken()));
    const stream = window.innerWidth <= STREAM_BREAKPOINT;
    setIsMobileStream(stream);
    pamphletTrace("mount", {
      innerWidth: window.innerWidth,
      streamBreakpoint: STREAM_BREAKPOINT,
      isMobileStream: stream,
      debug: localStorage.getItem("eduardoos-pamphlet-debug") ?? "off",
    });
  }, []);

  layoutRef.current = layout;

  const getInteractionRoot = useCallback((): HTMLElement | null => {
    if (isMobileStream && mobileStreamRef.current) {
      return mobileStreamRef.current;
    }
    return sheetsRef.current;
  }, [isMobileStream]);

  const updateToolbarPosition = useCallback(() => {
    const toolbar = toolbarRef.current;
    const canvas = canvasRef.current;
    const root = getInteractionRoot();
    if (!toolbar || !canvas || !root || !activeRef) {
      return;
    }

    const target = findActiveBlockElement(root, activeRef, activeIsImage);
    if (!target) {
      pamphletTrace("toolbar_position_missing_target", { ref: activeRef });
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const gap = 8;
    const top = targetRect.top - canvasRect.top - toolbar.offsetHeight - gap;
    const left = targetRect.left - canvasRect.left + targetRect.width / 2;

    toolbar.style.top = `${Math.max(4, top)}px`;
    toolbar.style.left = `${left}px`;
  }, [activeIsImage, activeRef, getInteractionRoot]);

  const resetCanvasMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    const sheets = sheetsRef.current;
    if (canvas) {
      canvas.style.width = "";
      canvas.style.height = "";
    }
    if (sheets) {
      sheets.style.transform = "none";
    }
  }, []);

  const applyMutation = useCallback(async (body: Record<string, unknown>) => {
    const viewport = viewportRef.current;
    const op = String(body.op ?? "");
    const ref = String(body.ref ?? "");
    pamphletTrace("mutation_step_1_prepare", { op, ref, layout: layoutRef.current });
    const shouldPreserveScroll =
      op !== "delete" && op !== "clear_image" && window.innerWidth <= STREAM_BREAKPOINT;
    if (viewport && shouldPreserveScroll) {
      viewportScrollRef.current = viewport.scrollTop;
      preserveScrollRef.current = true;
      pamphletTrace("mutation_step_2_scroll_preserve", { scrollTop: viewportScrollRef.current });
    } else {
      preserveScrollRef.current = false;
      if (window.innerWidth > STREAM_BREAKPOINT && (op === "delete" || op === "clear_image")) {
        resetScrollOnPreviewRef.current = true;
        pamphletTrace("mutation_step_2_scroll_reset_scheduled", { op });
      }
    }
    setRefreshing(true);
    setError("");
    pamphletTrace("mutation_step_3_request_start", body);
    pamphletDebug("mutation", { op, ref });
    try {
      const result = await mutatePamphletContent(body, layoutRef.current);
      pamphletTrace("mutation_step_4_response_received", {
        op,
        ref,
        htmlLen: result.html.length,
        newRef: result.newRef,
        capacityChars: result.capacity.characters,
      });
      setPreviewHtml(result.html);
      setCapacity(result.capacity);
      if (result.newRef) {
        pendingEditRef.current = result.newRef;
        pamphletTrace("mutation_step_5_pending_edit_ref", { newRef: result.newRef });
      }
      setStatus(op === "insert_below" ? `Inserted ${result.newRef ?? ref}` : "Content updated");
      pamphletTrace("mutation_step_6_state_updated", { op, ref, newRef: result.newRef });
    } catch (err) {
      pamphletDebugError("mutation_failed", err, body);
      setError(err instanceof Error ? err.message : "Mutation failed");
    } finally {
      setRefreshing(false);
      pamphletTrace("mutation_step_7_done", { op, ref });
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
      pamphletTrace("preview_refreshed", { htmlLen: html.length, sheetCount: (html.match(/class="sheet"/g) ?? []).length });
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
    const isStream = window.innerWidth <= STREAM_BREAKPOINT;

    if (isStream) {
      sheets.style.transform = "none";
      if (canvas) {
        canvas.style.width = "";
        canvas.style.height = "";
      }
      pamphletTrace("scale_step_stream_mode", { innerWidth: window.innerWidth });
      updateToolbarPosition();
      return;
    }

    if (canvas) {
      canvas.style.width = "";
      canvas.style.height = "";
    }
    sheets.style.transform = "none";

    const naturalW = sheets.offsetWidth;
    const naturalH = sheets.offsetHeight;
    const sheetPx = naturalW > 0 ? naturalW : SHEET_WIDTH_IN * 96;
    pamphletTrace("scale_step_measured", { naturalW, naturalH, sheetPx, userZoom });

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

    const canvasW = Math.ceil(sheetPx * scale);
    const canvasH = Math.ceil(Math.max(naturalH, sheets.scrollHeight) * scale);
    if (canvas) {
      canvas.style.width = `${canvasW}px`;
      canvas.style.height = `${canvasH}px`;
    }

    pamphletTrace("scale_step_applied", {
      scale,
      canvasW,
      canvasH,
      scrollHeight: sheets.scrollHeight,
    });

    updateToolbarPosition();
  }, [userZoom, updateToolbarPosition]);

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
    }, 500);

    const ref = el.getAttribute("data-content-ref") ?? "";
    const field = el.getAttribute("data-content-field") ?? undefined;
    const kind = [
      el.classList.contains("block-heading") ? "heading" : "",
      el.classList.contains("block-paragraph") ? "paragraph" : "",
      el.classList.contains("block-list") ? "list" : "",
      el.classList.contains("block-quote") ? "quote" : "",
      el.classList.contains("block-image-ref") ? "image_caption" : "",
      el.classList.contains("pamphlet-header-title") ? "header_title" : "",
      el.classList.contains("pamphlet-footer-title") ? "footer_title" : "",
    ]
      .filter(Boolean)
      .join("|") || el.className;

    if (el.classList.contains("is-editing")) {
      pamphletTrace("enter_edit_skipped", { ref, reason: "already_editing", kind });
      return;
    }

    pamphletTrace("enter_edit_start", { ref, field, kind, el: pamphletDomSummary(el) });
    pamphletDebug("edit_click", { ref, field, kind });

    editOriginalRef.current = stripHighlightMarkup(el.innerHTML).trim();
    editingRef.current = el;
    el.classList.add("is-editing");
    el.contentEditable = "true";

    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      pamphletTrace("enter_edit_focused", {
        ref,
        activeElement: document.activeElement?.tagName?.toLowerCase(),
        selectionLen: sel?.toString().length ?? 0,
      });
    });

    setActiveRef(ref);
    setActiveIsImage(el.classList.contains("block-image-ref"));
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
    pamphletTrace("image_select", { ref, wrap: pamphletDomSummary(wrap) });
    pamphletDebug("image_select", { ref });
  }, []);

  const finishEditing = useCallback(async (el: HTMLElement) => {
    if (!el.classList.contains("is-editing")) {
      pamphletTrace("finish_edit_skipped", { reason: "not_editing", el: pamphletDomSummary(el) });
      return;
    }

    const ref = el.getAttribute("data-content-ref") ?? "";
    const field = el.getAttribute("data-content-field") ?? undefined;
    const value = stripHighlightMarkup(el.innerHTML).trim();

    pamphletTrace("finish_edit_start", {
      ref,
      field,
      valueLen: value.length,
      originalLen: editOriginalRef.current.length,
      changed: value !== editOriginalRef.current,
    });

    el.contentEditable = "false";
    el.classList.remove("is-editing");
    editingRef.current = null;

    if (!ref) {
      setActiveRef("");
      pamphletTrace("finish_edit_aborted", { reason: "missing_ref" });
      return;
    }

    if (value === editOriginalRef.current) {
      pamphletTrace("finish_edit_unchanged", { ref, field });
      pamphletDebug("content_save_skipped", { ref, field, reason: "unchanged" });
      setActiveRef("");
      return;
    }

    setActiveRef("");
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
      const root = getInteractionRoot();
      if (!root || !root.contains(target)) return;

      pamphletTrace("click", {
        ...describeClickTarget(target),
        mobileStream: isMobileStream,
      });

      const clearBtn = target.closest<HTMLElement>("[data-image-clear]");
      if (clearBtn) {
        event.preventDefault();
        event.stopPropagation();
        const wrap = clearBtn.closest<HTMLElement>(".block-image-wrap[data-content-ref]");
        const ref = wrap?.getAttribute("data-content-ref") ?? "";
        pamphletTrace("click_clear_image", { ref });
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
      if (imageWrap && !target.closest(".block-image-ref")) {
        selectImageWrap(imageWrap);
        return;
      }

      const block = target.closest<HTMLElement>(EDITABLE_SELECTOR);
      if (block) {
        enterEditMode(block);
        return;
      }

      pamphletTrace("click_unhandled", describeClickTarget(target));
    },
    [applyMutation, enterEditMode, getInteractionRoot, isMobileStream, selectImageWrap],
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

  const handleSheetsFocusOut = useCallback(
    (event: FocusEvent) => {
      const root = getInteractionRoot();
      const target = event.target as HTMLElement;
      if (!root || !target.classList.contains("is-editing")) return;
      if (suppressBlurRef.current) {
        pamphletTrace("focusout_suppressed", { ref: target.getAttribute("data-content-ref") });
        return;
      }

      const related = event.relatedTarget as HTMLElement | null;
      pamphletTrace("focusout_scheduled", {
        ref: target.getAttribute("data-content-ref"),
        related: related ? pamphletDomSummary(related) : null,
        activeElement: pamphletDomSummary(document.activeElement),
      });

      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null;
        if (suppressBlurRef.current) {
          pamphletTrace("focusout_timer_suppressed");
          return;
        }
        if (!target.isConnected || !target.classList.contains("is-editing")) {
          pamphletTrace("focusout_timer_aborted", { reason: "no_longer_editing" });
          return;
        }
        const active = document.activeElement;
        if (active === target || target.contains(active)) {
          pamphletTrace("focusout_timer_aborted", { reason: "still_focused" });
          return;
        }
        if (related?.closest?.(".pamphlet-editor__block-toolbar")) {
          pamphletTrace("focusout_timer_aborted", { reason: "toolbar_focus" });
          return;
        }
        void finishEditing(target);
      }, 250);
    },
    [finishEditing, getInteractionRoot],
  );

  sheetHandlersRef.current = {
    click: handleSheetsClick,
    keydown: handleSheetsKeyDown,
    focusout: handleSheetsFocusOut,
  };

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
      if (!activeRef) {
        pamphletTrace("toolbar_action_skipped", { op, reason: "no_active_ref" });
        return;
      }
      const ref = activeRef;
      pamphletTrace("toolbar_action_start", { op, ref, editing: Boolean(editingRef.current) });

      if (op === "toggle_highlight") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        const el =
          editingRef.current ??
          getInteractionRoot()?.querySelector<HTMLElement>(`[data-content-ref="${activeRef}"]`);
        if (!el || !el.contains(range.commonAncestorContainer)) return;
        const pre = document.createRange();
        pre.selectNodeContents(el);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        const end = start + range.toString().length;
        await applyMutation({ op: "toggle_highlight", ref: activeRef, start, end });
        return;
      }
      if (op === "insert_below") {
        if (editingRef.current) {
          pamphletTrace("toolbar_insert_finish_edit_first", { ref });
          await finishEditing(editingRef.current);
        }
        if (!ref) {
          pamphletTrace("toolbar_insert_aborted", { reason: "missing_ref_after_save" });
          return;
        }
        setActiveRef("");
        setActiveIsImage(false);
        pamphletTrace("toolbar_insert_request", { ref });
        await applyMutation({ op: "insert_below", ref });
        return;
      }
      if (op === "delete") {
        const deleteRef = ref;
        if (editingRef.current) {
          editingRef.current.contentEditable = "false";
          editingRef.current.classList.remove("is-editing");
          editingRef.current = null;
        }
        setActiveRef("");
        setActiveIsImage(false);
        pamphletTrace("delete_block", { ref: deleteRef });
        await applyMutation({ op: "delete", ref: deleteRef });
        return;
      }
      if (editingRef.current && (op === "move_up" || op === "move_down")) {
        await finishEditing(editingRef.current);
      }
      await applyMutation({ op, ref });
      pamphletTrace("toolbar_action_done", { op, ref });
    },
    [activeRef, applyMutation, finishEditing, getInteractionRoot],
  );

  const blockToolbar = activeRef ? (
    <div
      ref={toolbarRef}
      className="pamphlet-editor__block-toolbar pamphlet-editor__block-toolbar--anchored"
      role="toolbar"
      aria-label="Block tools"
      onMouseDown={(event) => event.preventDefault()}
    >
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
      <button
        type="button"
        title="Delete"
        onClick={(event) => {
          event.preventDefault();
          void handleToolbarAction("delete");
        }}
      >
        ✕
      </button>
    </div>
  ) : null;

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
      const stream = window.innerWidth <= STREAM_BREAKPOINT;
      setIsMobileStream(stream);
      pamphletTrace("resize", { innerWidth: window.innerWidth, isMobileStream: stream });
    };
    syncMobileStream();
    window.addEventListener("resize", syncMobileStream);
    return () => window.removeEventListener("resize", syncMobileStream);
  }, []);

  useEffect(() => {
    applySheetScale();
  }, [isMobileStream, applySheetScale]);

  useEffect(() => {
    const source = sheetsRef.current;
    if (!source) return;

    const editing = editingRef.current;
    if (editing?.isConnected && editing.classList.contains("is-editing")) {
      pamphletTrace("preview_dom_skipped", { reason: "editing_in_progress" });
      return;
    }

    pamphletResetTrace();
    pamphletTrace("preview_step_1_reset_canvas", { htmlLen: previewHtml.length });
    resetCanvasMetrics();
    source.innerHTML = previewHtml;
    const sheetCount = previewHtml ? source.querySelectorAll(".sheet").length : 0;
    setPageCount(sheetCount);
    pamphletTrace("preview_step_2_dom_painted", { sheetCount });
    pamphletLogPrintSource(source);
    pamphletAuditBlockSpacing(source, "print_source");

    const mobileTarget = mobileStreamRef.current;
    if (isMobileStream && mobileTarget) {
      const cardCount = syncMobileStreamCards(source, mobileTarget);
      pamphletTrace("preview_step_3_mobile_stream_built", { cardCount, sheetCount });
      pamphletLogMobileStream(mobileTarget);
      pamphletAuditBlockSpacing(mobileTarget, "mobile_stream");
    } else if (mobileTarget) {
      mobileTarget.innerHTML = "";
      pamphletTrace("preview_step_3_mobile_stream_cleared", { reason: "desktop_mode" });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pamphletTrace("preview_step_4_scale_start");
        applySheetScale();
        if (preserveScrollRef.current && viewportRef.current) {
          viewportRef.current.scrollTop = viewportScrollRef.current;
          preserveScrollRef.current = false;
          pamphletTrace("preview_step_5_scroll_restored", { scrollTop: viewportScrollRef.current });
        } else if (resetScrollOnPreviewRef.current && viewportRef.current && !isMobileStream) {
          viewportRef.current.scrollTop = 0;
          resetScrollOnPreviewRef.current = false;
          pamphletTrace("preview_step_5_scroll_reset", { scrollTop: 0 });
        }
        updateToolbarPosition();

        const nextEditRef = pendingEditRef.current;
        if (nextEditRef) {
          pendingEditRef.current = "";
          const root = isMobileStream ? mobileStreamRef.current : sheetsRef.current;
          const nextEl = root?.querySelector<HTMLElement>(`[data-content-ref="${nextEditRef}"]`);
          pamphletTrace("preview_step_6_pending_edit_lookup", {
            newRef: nextEditRef,
            found: Boolean(nextEl),
            root: isMobileStream ? "mobile_stream" : "print_source",
          });
          if (nextEl) {
            setActiveRef(nextEditRef);
            setActiveIsImage(nextEl.classList.contains("block-image-ref"));
            enterEditMode(nextEl);
          } else {
            pamphletTrace("preview_step_6_pending_edit_missing", { newRef: nextEditRef });
          }
        }

        pamphletTrace("preview_step_7_complete", { sheetCount, isMobileStream });
      });
    });
  }, [previewHtml, applySheetScale, isMobileStream, resetCanvasMetrics, updateToolbarPosition, enterEditMode]);

  useLayoutEffect(() => {
    updateToolbarPosition();
  }, [activeRef, activeIsImage, previewHtml, userZoom, isMobileStream, updateToolbarPosition]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScroll = () => updateToolbarPosition();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [updateToolbarPosition]);

  useEffect(() => {
    if (!authed) return;
    const root = interactionRef.current;
    if (!root) return;

    pamphletTrace("handlers_attached", { mobileStream: isMobileStream });

    const onClick = (event: MouseEvent) => sheetHandlersRef.current.click(event);
    const onKeyDown = (event: KeyboardEvent) => sheetHandlersRef.current.keydown(event);
    const onFocusOut = (event: FocusEvent) => sheetHandlersRef.current.focusout(event);

    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusout", onFocusOut, true);

    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusout", onFocusOut, true);
    };
  }, [authed, isMobileStream]);

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
        <div className="pamphlet-editor__viewport" ref={viewportRef}>
          <div className="pamphlet-editor__canvas" ref={canvasRef}>
            {blockToolbar}
            <div className="pamphlet-editor__interaction" ref={interactionRef}>
              <div
                className="pamphlet-editor__sheets pamphlet-editor__sheets--print-source"
                ref={sheetsRef}
                aria-hidden={isMobileStream}
              />
              {isMobileStream ? (
                <div className="pamphlet-editor__mobile-stream" ref={mobileStreamRef} />
              ) : null}
            </div>
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
