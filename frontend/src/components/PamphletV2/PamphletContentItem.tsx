/**
 * PamphletContentItem.tsx — One full-width preview content block with mm height metadata.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  resolvePamphletImageUrl,
  type PamphletContentItem as ContentItemModel,
  type PamphletContentItemType,
} from "../../lib/pamphletContent";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import PamphletContentActionBar from "./PamphletContentActionBar";
import { usePamphletImageContext } from "./PamphletImageContext";
import "./PamphletContentItem.css";

interface PamphletContentItemProps {
  item: ContentItemModel;
  bottomMarginMm: number;
  selected: boolean;
  actionPlacement?: "top" | "bottom";
  fonts: PamphletFontSettings;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  imageUploading?: boolean;
  imageUploadError?: string;
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
  onImageUpload?: (file: File) => void;
  onImageReferenceChange?: (value: string) => void;
  onQuoteReferenceChange?: (value: string) => void;
  onListHeaderChange?: (value: string) => void;
  onListItemChange?: (index: number, value: string) => void;
  onAddListItem?: () => void;
  onRemoveListItem?: (index: number) => void;
  readOnly?: boolean;
}

const ACTION_BAR_ICON_HEIGHT_PX = 44;
const ACTION_BAR_FIELDS_HEIGHT_PX = 132;
const SITE_HEADER_OFFSET_PX = 72;
const TEXT_SYNC_DEBOUNCE_MS = 120;

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

function actionBarHeightForType(type: PamphletContentItemType): number {
  if (type === "image" || type === "quote" || type === "list") {
    return ACTION_BAR_ICON_HEIGHT_PX + ACTION_BAR_FIELDS_HEIGHT_PX;
  }
  return ACTION_BAR_ICON_HEIGHT_PX;
}

function resolvePortalBarStyle(
  itemRect: DOMRect,
  placement: "top" | "bottom",
  barHeightPx: number,
): CSSProperties {
  const top =
    placement === "top"
      ? Math.max(SITE_HEADER_OFFSET_PX, itemRect.top - barHeightPx - 4)
      : itemRect.bottom + 4;
  return {
    position: "fixed",
    left: itemRect.left,
    width: itemRect.width,
    top,
    zIndex: 1300,
  };
}

export function PamphletContentItem({
  item,
  bottomMarginMm,
  selected,
  actionPlacement = "top",
  fonts: _fonts,
  canMoveUp = false,
  canMoveDown = false,
  imageUploading = false,
  imageUploadError = "",
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
  onImageUpload,
  onImageReferenceChange,
  onQuoteReferenceChange,
  onListHeaderChange,
  onListItemChange,
  onAddListItem,
  onRemoveListItem,
  readOnly = false,
}: PamphletContentItemProps) {
  const imageContext = usePamphletImageContext();
  const itemRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<string | null>(null);
  const textDebounceRef = useRef<number | null>(null);
  const [portalBarStyle, setPortalBarStyle] = useState<CSSProperties | null>(null);
  const barHeightPx = actionBarHeightForType(item.type);

  useLayoutEffect(() => {
    if (!selected || !itemRef.current) {
      setPortalBarStyle(null);
      return;
    }

    function updateBarPosition() {
      if (!itemRef.current) {
        return;
      }
      const rect = itemRef.current.getBoundingClientRect();
      setPortalBarStyle(resolvePortalBarStyle(rect, actionPlacement, barHeightPx));
    }

    updateBarPosition();
    window.addEventListener("scroll", updateBarPosition, true);
    window.addEventListener("resize", updateBarPosition);
    return () => {
      window.removeEventListener("scroll", updateBarPosition, true);
      window.removeEventListener("resize", updateBarPosition);
    };
  }, [actionPlacement, barHeightPx, selected, item.id, item.heightMm, item.type]);

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
    }
  }, [item.id, selected]);

  useEffect(
    () => () => {
      if (textDebounceRef.current !== null) {
        window.clearTimeout(textDebounceRef.current);
      }
    },
    [],
  );

  function flushTextChange(text: string) {
    onTextChange?.(text);
  }

  function scheduleTextChange(text: string) {
    if (textDebounceRef.current !== null) {
      window.clearTimeout(textDebounceRef.current);
    }
    textDebounceRef.current = window.setTimeout(() => {
      flushTextChange(text);
      textDebounceRef.current = null;
    }, TEXT_SYNC_DEBOUNCE_MS);
  }

  function handleBold() {
    editableRef.current?.focus();
    document.execCommand("bold");
    onBold?.();
    if (editableRef.current) {
      flushTextChange(editableRef.current.innerText);
    }
  }

  function renderActionBar() {
    if (readOnly || !selected || !portalBarStyle || !onSetType || !onAddBelow || !onMoveUp || !onMoveDown || !onRemove) {
      return null;
    }

    const bar = (
      <PamphletContentActionBar
        itemType={item.type}
        placement={actionPlacement}
        portal
        style={portalBarStyle}
        imageReference={item.description}
        quoteReference={item.references[0] ?? ""}
        listHeader={item.text}
        listItems={item.listItems}
        imageUploading={imageUploading}
        imageUploadError={imageUploadError}
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
        onImageUpload={onImageUpload}
        onImageReferenceChange={onImageReferenceChange}
        onQuoteReferenceChange={onQuoteReferenceChange}
        onListHeaderChange={onListHeaderChange}
        onListItemChange={onListItemChange}
        onAddListItem={onAddListItem}
        onRemoveListItem={onRemoveListItem}
      />
    );

    return typeof document !== "undefined" ? createPortal(bar, document.body) : bar;
  }

  function renderEditableText(className: string) {
    if (selected && !readOnly) {
      return (
        <div
          ref={editableRef}
          className={className}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => scheduleTextChange(event.currentTarget.innerText)}
          onBlur={(event) => {
            if (textDebounceRef.current !== null) {
              window.clearTimeout(textDebounceRef.current);
              textDebounceRef.current = null;
            }
            flushTextChange(event.currentTarget.innerText);
          }}
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
          <>
            {item.text.trim() ? (
              <div className="pamphlet-content-item__list-header">{item.text}</div>
            ) : null}
            <ul className="pamphlet-content-item__list">
              {(item.listItems.length > 0 ? item.listItems : [{ text: "", highlights: [] }]).map((entry, index) => (
                <li
                  key={`${item.id}-li-${index}`}
                  className="pamphlet-content-item__list-item"
                  dangerouslySetInnerHTML={{ __html: applyHighlights(entry.text, entry.highlights) }}
                />
              ))}
            </ul>
          </>
        );
      case "image": {
        const imageSrc = resolvePamphletImageUrl(item.imageUrl, {
          userEmail: imageContext.userEmail,
          pamphletId: imageContext.pamphletId,
        });
        return (
          <div className="pamphlet-content-item__image-wrap">
            <div
              className="pamphlet-content-item__image"
              style={{ height: `${item.imageHeightMm}mm` }}
              data-image-height-mm={item.imageHeightMm}
            >
              {imageSrc ? <img src={imageSrc} alt={item.description || "Pamphlet image"} /> : null}
            </div>
            {item.description ? (
              <div className="pamphlet-content-item__reference">{item.description}</div>
            ) : null}
          </div>
        );
      }
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
        onClick={
          readOnly
            ? undefined
            : (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onSelect(item.id, rect.top, rect.bottom);
              }
        }
      >
        {renderBody()}
      </div>
      {renderActionBar()}
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
