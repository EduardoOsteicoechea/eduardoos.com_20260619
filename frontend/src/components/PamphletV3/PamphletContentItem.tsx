/**
 * PamphletContentItem.tsx — On-sheet view of one item; editing happens in the sidebar.
 */
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import PamphletItemView from "./PamphletItemView";
import { pxToMm, type PamphletV3ContentItem, type PamphletV3ItemType } from "./pamphletV3Content";
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
  handlers: PamphletContentItemHandlers;
}

export default function PamphletContentItem({
  item,
  editing,
  editDisabled,
  handlers,
}: PamphletContentItemProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measureNode = measureRef.current;
    const rootNode = rootRef.current;
    if (!measureNode || !rootNode || typeof ResizeObserver === "undefined") {
      return;
    }

    function publishHeight() {
      if (!measureRef.current || !rootRef.current) {
        return;
      }
      const contentPx = measureRef.current.getBoundingClientRect().height;
      const marginTopPx = Number.parseFloat(window.getComputedStyle(rootRef.current).marginTop) || 0;
      const nextMm = pxToMm(contentPx + marginTopPx);
      if (Math.abs(nextMm - item.heightMm) < 0.15) {
        return;
      }
      handlers.onHeightChange(item.id, nextMm);
    }

    const observer = new ResizeObserver(() => publishHeight());
    observer.observe(measureNode);
    publishHeight();
    return () => observer.disconnect();
  }, [
    handlers,
    item.heightMm,
    item.id,
    item.text,
    item.type,
    item.imageHeightMm,
    item.imageUrl,
    item.description,
    item.listItems,
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
      data-editing={editing ? "true" : "false"}
      data-height-mm={item.heightMm.toFixed(2)}
      style={style}
      onClick={handleSelect}
      role="presentation"
    >
      <div ref={measureRef} className="pamphlet-v3-item__measure" data-measure="view">
        <PamphletItemView item={item} />
      </div>
    </div>
  );
}
