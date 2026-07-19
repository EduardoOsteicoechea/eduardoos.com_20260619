/**
 * PamphletV3Page.tsx — US Letter landscape pamphlet editor (V3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import contentDistribution, {
  distributionToContentJson,
  type PamphletMeasuredCapacities,
} from "./ContentDistribution";
import PamphletContentJsonPanel from "./PamphletContentJsonPanel";
import { PamphletContentItemsContainer } from "./PamphletContentItemsContainer";
import type { PamphletContentItemHandlers } from "./PamphletContentItem";
import {
  buildEmptyPamphletV3Document,
  createPamphletV3Item,
  measurePamphletV3ItemHeight,
  pamphletV3ItemHasContent,
  PAMPHLET_V3_COLUMN_WIDTH_MM,
  PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM,
  type PamphletV3ColumnZoneId,
  type PamphletV3ContentItem,
  type PamphletV3Document,
  type PamphletV3ItemType,
  type PamphletV3Stream,
} from "./pamphletV3Content";
import "./PamphletV3Page.css";
import "./PamphletPages.css";

function findStream(document: PamphletV3Document, itemId: string): PamphletV3Stream | null {
  if (document.headerItems.some((item) => item.id === itemId)) {
    return "header";
  }
  if (document.footerItems.some((item) => item.id === itemId)) {
    return "footer";
  }
  if (document.bodyItems.some((item) => item.id === itemId)) {
    return "body";
  }
  return null;
}

function getStreamItems(document: PamphletV3Document, stream: PamphletV3Stream): PamphletV3ContentItem[] {
  if (stream === "header") {
    return document.headerItems;
  }
  if (stream === "footer") {
    return document.footerItems;
  }
  return document.bodyItems;
}

function setStreamItems(
  document: PamphletV3Document,
  stream: PamphletV3Stream,
  items: PamphletV3ContentItem[],
): PamphletV3Document {
  if (stream === "header") {
    return { ...document, headerItems: items };
  }
  if (stream === "footer") {
    return { ...document, footerItems: items };
  }
  return { ...document, bodyItems: items };
}

function widthForStream(stream: PamphletV3Stream): number {
  return stream === "body" ? PAMPHLET_V3_COLUMN_WIDTH_MM : PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM;
}

function withEstimatedHeight(item: PamphletV3ContentItem, stream: PamphletV3Stream): PamphletV3ContentItem {
  return {
    ...item,
    heightMm: measurePamphletV3ItemHeight(item, widthForStream(stream)),
  };
}

function cloneItem(item: PamphletV3ContentItem): PamphletV3ContentItem {
  return {
    ...item,
    listItems: item.listItems.map((row) => ({ ...row })),
  };
}

export default function PamphletV3Page() {
  const [documentState, setDocumentState] = useState<PamphletV3Document>(() => buildEmptyPamphletV3Document());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [measuredCapacities, setMeasuredCapacities] = useState<PamphletMeasuredCapacities>({});
  const editSnapshotRef = useRef<PamphletV3ContentItem | null>(null);
  const documentStateRef = useRef(documentState);
  const editingItemIdRef = useRef(editingItemId);

  documentStateRef.current = documentState;
  editingItemIdRef.current = editingItemId;

  const handleCapacityChange = useCallback((capacityKey: string, capacityMm: number) => {
    setMeasuredCapacities((current) => {
      const previous = current[capacityKey as keyof PamphletMeasuredCapacities] ?? 0;
      if (Math.abs(previous - capacityMm) < 0.4) {
        return current;
      }
      return { ...current, [capacityKey]: capacityMm };
    });
  }, []);

  const distribution = useMemo(
    () => contentDistribution(documentState, measuredCapacities),
    [documentState, measuredCapacities],
  );
  const contentJson = useMemo(() => distributionToContentJson(distribution), [distribution]);

  /** Applies a document update and keeps the ref in sync for outside-click / Enter handlers. */
  const commitDocument = useCallback((next: PamphletV3Document) => {
    documentStateRef.current = next;
    setDocumentState(next);
  }, []);

  const updateItem = useCallback(
    (itemId: string, patch: Partial<PamphletV3ContentItem>) => {
      const current = documentStateRef.current;
      const stream = findStream(current, itemId);
      if (!stream) {
        return;
      }
      const nextItems = getStreamItems(current, stream).map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        return withEstimatedHeight({ ...item, ...patch }, stream);
      });
      commitDocument(setStreamItems(current, stream, nextItems));
    },
    [commitDocument],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      const current = documentStateRef.current;
      const stream = findStream(current, itemId);
      if (!stream) {
        return;
      }
      commitDocument(
        setStreamItems(
          current,
          stream,
          getStreamItems(current, stream).filter((item) => item.id !== itemId),
        ),
      );
      editSnapshotRef.current = null;
      setEditingItemId((currentId) => (currentId === itemId ? null : currentId));
      if (editingItemIdRef.current === itemId) {
        editingItemIdRef.current = null;
      }
    },
    [commitDocument],
  );

  const saveAndExit = useCallback(
    (itemId: string) => {
      const current = documentStateRef.current;
      const stream = findStream(current, itemId);
      if (!stream) {
        editingItemIdRef.current = null;
        setEditingItemId(null);
        return;
      }
      const item = getStreamItems(current, stream).find((entry) => entry.id === itemId);
      if (!item) {
        editingItemIdRef.current = null;
        setEditingItemId(null);
        return;
      }
      if (!pamphletV3ItemHasContent(item)) {
        removeItem(itemId);
        return;
      }
      editSnapshotRef.current = null;
      editingItemIdRef.current = null;
      setEditingItemId(null);
    },
    [removeItem],
  );

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const editingId = editingItemIdRef.current;
      if (!editingId) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const editingNode = window.document.querySelector(
        `[data-item-id="${CSS.escape(editingId)}"][data-editing="true"]`,
      );
      if (editingNode?.contains(target)) {
        return;
      }
      saveAndExit(editingId);
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [saveAndExit]);

  const handlers = useMemo<PamphletContentItemHandlers>(
    () => ({
      onSelect: (itemId) => {
        const currentEditing = editingItemIdRef.current;
        if (currentEditing && currentEditing !== itemId) {
          saveAndExit(currentEditing);
        }
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const item = getStreamItems(current, stream).find((entry) => entry.id === itemId);
        if (!item) {
          return;
        }
        editSnapshotRef.current = cloneItem(item);
        editingItemIdRef.current = itemId;
        setEditingItemId(itemId);
      },
      onChange: (itemId, patch) => updateItem(itemId, patch),
      onRequestSaveAndExit: (itemId) => saveAndExit(itemId),
      onCancelEdit: (itemId) => {
        const snapshot = editSnapshotRef.current;
        if (snapshot && snapshot.id === itemId) {
          if (!pamphletV3ItemHasContent(snapshot)) {
            removeItem(itemId);
            return;
          }
          const current = documentStateRef.current;
          const stream = findStream(current, itemId);
          if (stream) {
            const nextItems = getStreamItems(current, stream).map((item) =>
              item.id === itemId ? cloneItem(snapshot) : item,
            );
            commitDocument(setStreamItems(current, stream, nextItems));
          }
        } else {
          const current = documentStateRef.current;
          const stream = findStream(current, itemId);
          const item = stream
            ? getStreamItems(current, stream).find((entry) => entry.id === itemId)
            : undefined;
          if (item && !pamphletV3ItemHasContent(item)) {
            removeItem(itemId);
            return;
          }
        }
        editSnapshotRef.current = null;
        editingItemIdRef.current = null;
        setEditingItemId(null);
      },
      onSetType: (itemId, type: PamphletV3ItemType) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const nextItems = getStreamItems(current, stream).map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const next = createPamphletV3Item(type, {
            ...item,
            type,
            listItems:
              type === "list"
                ? item.listItems.length
                  ? item.listItems
                  : [{ id: `li-${Date.now()}`, text: "" }]
                : [],
            imageHeightMm: type === "image" ? item.imageHeightMm || PAMPHLET_V3_COLUMN_WIDTH_MM * 0.75 : 0,
          });
          return withEstimatedHeight(next, stream);
        });
        commitDocument(setStreamItems(current, stream, nextItems));
      },
      onAddBelow: (itemId) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        let items = getStreamItems(current, stream);
        const currentItem = items.find((entry) => entry.id === itemId);
        if (currentItem && !pamphletV3ItemHasContent(currentItem)) {
          return;
        }
        const index = items.findIndex((item) => item.id === itemId);
        const fresh = withEstimatedHeight(createPamphletV3Item("paragraph"), stream);
        items =
          index < 0 ? [...items, fresh] : [...items.slice(0, index + 1), fresh, ...items.slice(index + 1)];
        editSnapshotRef.current = cloneItem(fresh);
        editingItemIdRef.current = fresh.id;
        setEditingItemId(fresh.id);
        commitDocument(setStreamItems(current, stream, items));
      },
      onRemove: (itemId) => removeItem(itemId),
      onToggleBold: (itemId) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const nextItems = getStreamItems(current, stream).map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const wrapped = item.text.includes("<b>")
            ? item.text.replace(/<\/?b>/g, "")
            : `<b>${item.text}</b>`;
          return withEstimatedHeight({ ...item, text: wrapped }, stream);
        });
        commitDocument(setStreamItems(current, stream, nextItems));
      },
      onIncreaseImageHeight: (itemId) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const nextItems = getStreamItems(current, stream).map((item) => {
          if (item.id !== itemId || item.type !== "image") {
            return item;
          }
          return withEstimatedHeight({ ...item, imageHeightMm: item.imageHeightMm + 4 }, stream);
        });
        commitDocument(setStreamItems(current, stream, nextItems));
      },
      onDecreaseImageHeight: (itemId) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const nextItems = getStreamItems(current, stream).map((item) => {
          if (item.id !== itemId || item.type !== "image") {
            return item;
          }
          return withEstimatedHeight(
            { ...item, imageHeightMm: Math.max(16, item.imageHeightMm - 4) },
            stream,
          );
        });
        commitDocument(setStreamItems(current, stream, nextItems));
      },
      onHeightChange: (itemId, heightMm) => {
        const current = documentStateRef.current;
        const stream = findStream(current, itemId);
        if (!stream) {
          return;
        }
        const existing = getStreamItems(current, stream).find((item) => item.id === itemId);
        if (!existing || Math.abs(existing.heightMm - heightMm) < 0.15) {
          return;
        }
        const nextItems = getStreamItems(current, stream).map((item) =>
          item.id === itemId ? { ...item, heightMm } : item,
        );
        commitDocument(setStreamItems(current, stream, nextItems));
      },
    }),
    [commitDocument, removeItem, saveAndExit, updateItem],
  );

  const appendToStream = useCallback(
    (stream: PamphletV3Stream) => {
      const editingId = editingItemIdRef.current;
      if (editingId) {
        saveAndExit(editingId);
      }
      const current = documentStateRef.current;
      const fresh = withEstimatedHeight(createPamphletV3Item("paragraph"), stream);
      editSnapshotRef.current = cloneItem(fresh);
      editingItemIdRef.current = fresh.id;
      commitDocument(setStreamItems(current, stream, [...getStreamItems(current, stream), fresh]));
      setEditingItemId(fresh.id);
    },
    [commitDocument, saveAndExit],
  );

  /**
   * Activates add-item in a zone that already has content: save any open edit,
   * then insert a fresh paragraph after the last item currently in that zone.
   */
  const addInZone = useCallback(
    (stream: PamphletV3Stream, zoneItemIds: string[]) => {
      const editingId = editingItemIdRef.current;
      if (editingId) {
        saveAndExit(editingId);
      }
      const current = documentStateRef.current;
      let items = getStreamItems(current, stream);
      const fresh = withEstimatedHeight(createPamphletV3Item("paragraph"), stream);

      let insertAt = items.length;
      for (let index = zoneItemIds.length - 1; index >= 0; index -= 1) {
        const zoneItemId = zoneItemIds[index];
        const found = items.findIndex((item) => item.id === zoneItemId);
        if (found >= 0) {
          insertAt = found + 1;
          break;
        }
      }

      items = [...items.slice(0, insertAt), fresh, ...items.slice(insertAt)];
      editSnapshotRef.current = cloneItem(fresh);
      editingItemIdRef.current = fresh.id;
      commitDocument(setStreamItems(current, stream, items));
      setEditingItemId(fresh.id);
    },
    [commitDocument, saveAndExit],
  );

  function zoneProps(
    type: "header" | "column" | "footer",
    label: string,
    gridArea: "header" | "footer" | "col-a" | "col-b",
    content: PamphletV3ContentItem[],
    occupation: { percent: number; usedMm: number; capacityMm: number },
    stream: PamphletV3Stream,
    capacityKey: PamphletV3ColumnZoneId | "header" | "footer",
  ) {
    const zoneItemIds = content.map((item) => item.id);
    return {
      type,
      label,
      gridArea,
      capacityKey,
      content,
      editingItemId,
      itemGapMm: documentState.itemGapMm,
      occupationPercent: occupation.percent,
      usedMm: occupation.usedMm,
      capacityMm: occupation.capacityMm,
      handlers,
      onEmptyActivate: () => appendToStream(stream),
      onZoneBackgroundActivate: () => addInZone(stream, zoneItemIds),
      onCapacityChange: handleCapacityChange,
    } as const;
  }

  return (
    <div className="pamphlet_v3_page">
      <div className="pamphlet_v3_workspace">
        <div className="pamphlet_v3_sheets">
          <div className="pamphlet_sheet pamphlet_first_sheet">
            <div className="pamphlet_half pamphlet_back_page">
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 7",
                  "col-a",
                  distribution.columns.seventh,
                  distribution.occupation.columns.seventh,
                  "body",
                  "seventh",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 8",
                  "col-b",
                  distribution.columns.eighth,
                  distribution.occupation.columns.eighth,
                  "body",
                  "eighth",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "footer",
                  "Footer",
                  "footer",
                  distribution.footer,
                  distribution.occupation.footer,
                  "footer",
                  "footer",
                )}
              />
            </div>
            <div className="pamphlet_half pamphlet_front_page">
              <PamphletContentItemsContainer
                {...zoneProps(
                  "header",
                  "Header",
                  "header",
                  distribution.header,
                  distribution.occupation.header,
                  "header",
                  "header",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 1",
                  "col-a",
                  distribution.columns.first,
                  distribution.occupation.columns.first,
                  "body",
                  "first",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 2",
                  "col-b",
                  distribution.columns.second,
                  distribution.occupation.columns.second,
                  "body",
                  "second",
                )}
              />
            </div>
          </div>

          <div className="pamphlet_sheet pamphlet_inner_sheet">
            <div className="pamphlet_half pamphlet_inner_page pamphlet_inner_left_page">
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 3",
                  "col-a",
                  distribution.columns.third,
                  distribution.occupation.columns.third,
                  "body",
                  "third",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 4",
                  "col-b",
                  distribution.columns.fourth,
                  distribution.occupation.columns.fourth,
                  "body",
                  "fourth",
                )}
              />
            </div>
            <div className="pamphlet_half pamphlet_inner_page pamphlet_inner_right_page">
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 5",
                  "col-a",
                  distribution.columns.fifth,
                  distribution.occupation.columns.fifth,
                  "body",
                  "fifth",
                )}
              />
              <PamphletContentItemsContainer
                {...zoneProps(
                  "column",
                  "Column 6",
                  "col-b",
                  distribution.columns.sixth,
                  distribution.occupation.columns.sixth,
                  "body",
                  "sixth",
                )}
              />
            </div>
          </div>
        </div>

        <PamphletContentJsonPanel contentJson={contentJson} />
      </div>
    </div>
  );
}
