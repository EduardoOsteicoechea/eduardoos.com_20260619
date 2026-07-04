/**
 * PamphletContentItem.tsx — One full-width preview content block with mm height metadata.
 */
import { useRef } from "react";
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

export function PamphletContentItem({
  item,
  bottomMarginMm,
  selected,
  actionPlacement = "top",
  fonts,
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
  const editableRef = useRef<HTMLDivElement>(null);

  function handleBold() {
    editableRef.current?.focus();
    document.execCommand("bold");
    onBold?.();
    if (editableRef.current && onTextChange) {
      onTextChange(editableRef.current.innerText);
    }
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
            <div
              ref={editableRef}
              className="pamphlet-content-item__text"
              contentEditable={selected}
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: applyHighlights(item.text, item.highlights) }}
              onInput={(event) => onTextChange?.(event.currentTarget.innerText)}
            />
            {item.references.length > 0 ? (
              <div className="pamphlet-content-item__reference">{item.references.join(" · ")}</div>
            ) : null}
          </div>
        );
      default:
        return (
          <div
            ref={editableRef}
            className={`pamphlet-content-item__text pamphlet-content-item__text--${item.type}`}
            contentEditable={selected}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: applyHighlights(item.text, item.highlights) }}
            onInput={(event) => onTextChange?.(event.currentTarget.innerText)}
          />
        );
    }
  }

  return (
    <div className="pamphlet-content-item-wrap">
      <div
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
        {selected && onSetType && onAddBelow && onMoveUp && onMoveDown && onRemove ? (
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
            onBold={item.type !== "image" ? handleBold : undefined}
            onIncreaseImageHeight={onIncreaseImageHeight}
            onDecreaseImageHeight={onDecreaseImageHeight}
          />
        ) : null}
        {renderBody()}
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
