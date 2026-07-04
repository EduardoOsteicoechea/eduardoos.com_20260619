/**
 * PamphletContentItem.tsx — One full-width preview content block with mm height metadata.
 */
import { useEffect, useRef } from "react";
import type { PamphletContentItem as ContentItemModel, PamphletContentItemType } from "../../lib/pamphletContent";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import PamphletContentActionBar from "./PamphletContentActionBar";
import "./PamphletContentItem.css";

interface PamphletContentItemProps {
  item: ContentItemModel;
  bottomMarginMm: number;
  selected: boolean;
  actionPlacement?: "top" | "bottom";
  fonts: PamphletFontSettings;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onSelect: (itemId: string, elementTopPx: number, elementBottomPx: number) => void;
  onSetType?: (type: PamphletContentItemType) => void;
  onAddBelow?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  onBold?: () => void;
  onIncreaseImageHeight?: () => void;
  onDecreaseImageHeight?: () => void;
  onTextChange?: (text: string) => void;
}

function applyHighlights(text: string, highlights: ContentItemModel["highlights"]): string {
  if (!text || highlights.length === 0) {
    return text;
  }
  const sorted = [...highlights].sort((a, b) => b.start - a.start);
  let html = text;
  for (const range of sorted) {
    const start = Math.max(0, range.start);
    const end = Math.min(text.length, range.end);
    if (end <= start) {
      continue;
    }
    html = `${html.slice(0, start)}<strong>${html.slice(start, end)}</strong>${html.slice(end)}`;
  }
  return html;
}

function placeCaretAtEnd(node: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function PamphletContentItem({
  item,
  bottomMarginMm,
  selected,
  actionPlacement = "top",
  fonts: _fonts,
  canMoveUp = false,
  canMoveDown = false,
  onSelect,
  onSetType,
  onAddBelow,
  onMoveUp,
  onMoveDown,
  onRemove,
  onBold,
  onIncreaseImageHeight,
  onDecreaseImageHeight,
  onTextChange,
}: PamphletContentItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selected || !editableRef.current) {
      if (!selected) {
        activeItemRef.current = null;
      }
      return;
    }
    if (activeItemRef.current !== item.id) {
      editableRef.current.textContent = item.text;
      activeItemRef.current = item.id;
      editableRef.current.focus();
      placeCaretAtEnd(editableRef.current);
      return;
    }
    if (document.activeElement !== editableRef.current) {
      editableRef.current.textContent = item.text;
    }
  }, [item.id, item.text, selected]);

  function handleBold() {
    editableRef.current?.focus();
    document.execCommand("bold");
    onBold?.();
    if (editableRef.current && onTextChange) {
      onTextChange(editableRef.current.innerText);
    }
  }

  function renderActionBar() {
    if (!selected || !onSetType || !onAddBelow || !onMoveUp || !onMoveDown || !onRemove) {
      return null;
    }
    return (
      <PamphletContentActionBar
        itemType={item.type}
        placement={actionPlacement}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onSetType={onSetType}
        onAddBelow={onAddBelow}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
        onBold={item.type !== "image" && item.type !== "list" ? handleBold : undefined}
        onIncreaseImageHeight={onIncreaseImageHeight}
        onDecreaseImageHeight={onDecreaseImageHeight}
      />
    );
  }

  function renderEditableText(className: string) {
    if (selected) {
      return (
        <div
          ref={editableRef}
          className={className}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => onTextChange?.(event.currentTarget.innerText)}
        />
      );
    }
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: applyHighlights(item.text, item.highlights) }}
      />
    );
  }

  function renderBody() {
    switch (item.type) {
      case "list":
        return (
          <ul className="pamphlet-content-item__list">
            {(item.listItems.length > 0 ? item.listItems : [{ text: "", highlights: [] }]).map((entry, index) => (
              <li
                key={`${item.id}-li-${index}`}
                className="pamphlet-content-item__list-item"
                dangerouslySetInnerHTML={{ __html: applyHighlights(entry.text, entry.highlights) }}
              />
            ))}
          </ul>
        );
      case "image":
        return (
          <div className="pamphlet-content-item__image-wrap">
            <div
              className="pamphlet-content-item__image"
              style={{ height: `${item.imageHeightMm}mm` }}
              data-image-height-mm={item.imageHeightMm}
            >
              {item.imageUrl ? <img src={item.imageUrl} alt={item.description || "Pamphlet image"} /> : null}
            </div>
            {item.description ? (
              <div className="pamphlet-content-item__reference">{item.description}</div>
            ) : null}
          </div>
        );
      case "quote":
        return (
          <div className="pamphlet-content-item__quote">
            {renderEditableText("pamphlet-content-item__text")}
            {item.references.length > 0 ? (
              <div className="pamphlet-content-item__reference">{item.references.join(" · ")}</div>
            ) : null}
          </div>
        );
      default:
        return renderEditableText(`pamphlet-content-item__text pamphlet-content-item__text--${item.type}`);
    }
  }

  return (
    <div className="pamphlet-content-item-wrap">
      <div
        ref={itemRef}
        className={`pamphlet-content-item${selected ? " is-selected" : ""}`}
        data-testid="pamphlet-content-item"
        data-height-mm={item.heightMm.toFixed(2)}
        data-content-ref={item.contentRef}
        style={{ width: "100%", minHeight: `${item.heightMm}mm` }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelect(item.id, rect.top, rect.bottom);
        }}
      >
        {actionPlacement === "top" ? renderActionBar() : null}
        {renderBody()}
        {actionPlacement === "bottom" ? renderActionBar() : null}
      </div>
      {bottomMarginMm > 0 ? (
        <div
          className="pamphlet-content-item-gap"
          data-testid="pamphlet-content-item-gap"
          data-gap-mm={bottomMarginMm}
          style={{ height: `${bottomMarginMm}mm` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

export default PamphletContentItem;
