/**
 * PamphletContentItem.tsx — On-sheet view of one item; editing happens in the sidebar.
 */
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import PamphletItemView from "./PamphletItemView";
import {
  pamphletV3ItemBottomMarginMm,
  pamphletV3ItemTopMarginMm,
  pxToMm,
  type PamphletV3ContentItem,
  type PamphletV3ItemType,
  type PamphletV3Stream,
} from "./pamphletV3Content";
import "./PamphletContentItem.css";

export interface PamphletContentItemHandlers {
  onSelect: (itemId: string) => void;
  onChange: (itemId: string, patch: Partial<PamphletV3ContentItem>) => void;
  onRequestSaveAndExit: (itemId: string) => void;
  onCancelEdit: (itemId: string) => void;
  onSetType: (itemId: string, type: PamphletV3ItemType) => void;
  onAddBelow: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onToggleBold: (itemId: string) => void;
  onIncreaseImageHeight: (itemId: string) => void;
  onDecreaseImageHeight: (itemId: string) => void;
  onHeightChange: (itemId: string, heightMm: number) => void;
}

interface PamphletContentItemProps {
  item: PamphletV3ContentItem;
  editing: boolean;
  editDisabled: boolean;
  stream?: PamphletV3Stream;
  /** When false, skip ResizeObserver updates (inactive mobile/desktop twin). */
  measureEnabled?: boolean;
  handlers: PamphletContentItemHandlers;
}

export default function PamphletContentItem({
  item,
  editing,
  editDisabled,
  stream = "body",
  measureEnabled = true,
  handlers,
}: PamphletContentItemProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useLayoutEffect(() => {
    const rootNode = rootRef.current;
    if (!measureEnabled || !rootNode || typeof ResizeObserver === "undefined") {
      return;
    }

    function publishHeight() {
      if (!rootRef.current) {
        return;
      }
      const root = rootRef.current;
      // Use offsetHeight (layout box) — getBoundingClientRect grows with CSS zoom/scale
      // and would fight the twin layout, causing an infinite onHeightChange loop.
      const nextMm =
        pxToMm(root.offsetHeight) +
        pamphletV3ItemTopMarginMm(item, stream) +
        pamphletV3ItemBottomMarginMm(item, stream);
      if (Math.abs(nextMm - item.heightMm) < 0.15) {
        return;
      }
      handlersRef.current.onHeightChange(item.id, nextMm);
    }

    const observer = new ResizeObserver(() => publishHeight());
    observer.observe(rootNode);
    publishHeight();
    return () => observer.disconnect();
  }, [
    measureEnabled,
    item.heightMm,
    item.id,
    item.text,
    item.type,
    item.imageHeightMm,
    item.imageUrl,
    item.description,
    item.listItems,
    stream,
  ]);

  const style = {
    "--item-image-h": `${item.imageHeightMm}mm`,
  } as CSSProperties;

  function handleSelect() {
    if (editDisabled) {
      return;
    }
    handlers.onSelect(item.id);
  }

  return (
    <div
      ref={rootRef}
      className={`pamphlet-v3-item${editing ? " is-editing" : ""}${editDisabled ? " is-disabled" : ""}`}
      data-item-id={item.id}
      data-item-type={item.type}
      data-editing={editing ? "true" : "false"}
      data-height-mm={item.heightMm.toFixed(2)}
      style={style}
      onClick={handleSelect}
      role="presentation"
    >
      <div className="pamphlet-v3-item__measure" data-measure="view">
        <PamphletItemView item={item} />
      </div>
    </div>
  );
}
