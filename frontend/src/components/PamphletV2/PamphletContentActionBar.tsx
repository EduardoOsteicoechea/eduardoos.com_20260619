/**
 * PamphletContentActionBar.tsx — Inner icon toolbar and typed field editors for one content item.
 */
import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import type { PamphletContentItemType, PamphletListItem } from "../../lib/pamphletContent";
import {
  IconAddBelow,
  IconBold,
  IconContentType,
  IconImageShorter,
  IconImageTaller,
  IconMoveDown,
  IconMoveUp,
  IconRemoveItem,
} from "./PamphletContentIcons";
import "./PamphletContentActionBar.css";

const TYPE_OPTIONS: Array<{ id: PamphletContentItemType; label: string }> = [
  { id: "paragraph", label: "Paragraph" },
  { id: "key_idea", label: "Key idea" },
  { id: "quote", label: "Biblical quote" },
  { id: "list", label: "List" },
  { id: "image", label: "Image" },
];

interface PamphletContentActionBarProps {
  itemType: PamphletContentItemType;
  placement: "top" | "bottom";
  style?: CSSProperties;
  portal?: boolean;
  imageReference?: string;
  quoteReference?: string;
  listHeader?: string;
  listItems?: PamphletListItem[];
  imageUploading?: boolean;
  imageUploadError?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSetType: (type: PamphletContentItemType) => void;
  onAddBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onBold?: () => void;
  onIncreaseImageHeight?: () => void;
  onDecreaseImageHeight?: () => void;
  onImageUpload?: (file: File) => void;
  onImageReferenceChange?: (value: string) => void;
  onQuoteReferenceChange?: (value: string) => void;
  onListHeaderChange?: (value: string) => void;
  onListItemChange?: (index: number, value: string) => void;
  onAddListItem?: () => void;
  onRemoveListItem?: (index: number) => void;
}

export function PamphletContentActionBar({
  itemType,
  placement,
  style,
  portal = false,
  imageReference = "",
  quoteReference = "",
  listHeader = "",
  listItems = [],
  imageUploading = false,
  imageUploadError = "",
  canMoveUp,
  canMoveDown,
  onSetType,
  onAddBelow,
  onMoveUp,
  onMoveDown,
  onRemove,
  onBold,
  onIncreaseImageHeight,
  onDecreaseImageHeight,
  onImageUpload,
  onImageReferenceChange,
  onQuoteReferenceChange,
  onListHeaderChange,
  onListItemChange,
  onAddListItem,
  onRemoveListItem,
}: PamphletContentActionBarProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textType = itemType === "paragraph" || itemType === "key_idea" || itemType === "quote";
  const editableListItems = listItems.length > 0 ? listItems : [{ text: "", highlights: [] }];

  function handleImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && onImageUpload) {
      onImageUpload(file);
    }
  }

  function renderFields() {
    if (itemType === "image") {
      return (
        <div className="pamphlet-content-action-bar__fields">
          <label className="pamphlet-content-action-bar__field">
            <span className="pamphlet-content-action-bar__field-label">Image</span>
            <button
              type="button"
              className="pamphlet-content-action-bar__upload-btn"
              disabled={imageUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {imageUploading ? "Uploading…" : "Upload image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="pamphlet-content-action-bar__file-input"
              onChange={handleImageSelected}
            />
          </label>
          <label className="pamphlet-content-action-bar__field">
            <span className="pamphlet-content-action-bar__field-label">Reference</span>
            <input
              type="text"
              className="pamphlet-content-action-bar__input"
              value={imageReference}
              placeholder="Image caption or source"
              aria-label="Image reference"
              onChange={(event) => onImageReferenceChange?.(event.target.value)}
            />
          </label>
          {imageUploadError ? <p className="pamphlet-content-action-bar__error">{imageUploadError}</p> : null}
        </div>
      );
    }

    if (itemType === "quote") {
      return (
        <div className="pamphlet-content-action-bar__fields">
          <label className="pamphlet-content-action-bar__field">
            <span className="pamphlet-content-action-bar__field-label">Reference</span>
            <input
              type="text"
              className="pamphlet-content-action-bar__input"
              value={quoteReference}
              placeholder="e.g. Romanos 12:2"
              aria-label="Quote reference"
              onChange={(event) => onQuoteReferenceChange?.(event.target.value)}
            />
          </label>
        </div>
      );
    }

    if (itemType === "list") {
      return (
        <div className="pamphlet-content-action-bar__fields">
          <label className="pamphlet-content-action-bar__field">
            <span className="pamphlet-content-action-bar__field-label">Header</span>
            <input
              type="text"
              className="pamphlet-content-action-bar__input"
              value={listHeader}
              placeholder="List heading"
              aria-label="List header"
              onChange={(event) => onListHeaderChange?.(event.target.value)}
            />
          </label>
          <div className="pamphlet-content-action-bar__list-items">
            {editableListItems.map((entry, index) => (
              <div key={`list-item-${index}`} className="pamphlet-content-action-bar__list-row">
                <input
                  type="text"
                  className="pamphlet-content-action-bar__input"
                  value={entry.text}
                  placeholder={`Item ${index + 1}`}
                  aria-label={`List item ${index + 1}`}
                  onChange={(event) => onListItemChange?.(index, event.target.value)}
                />
                <button
                  type="button"
                  className="pamphlet-content-action-bar__mini-btn"
                  title="Remove list item"
                  aria-label={`Remove list item ${index + 1}`}
                  disabled={editableListItems.length <= 1}
                  onClick={() => onRemoveListItem?.(index)}
                >
                  −
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="pamphlet-content-action-bar__mini-btn" onClick={() => onAddListItem?.()}>
            + Add item
          </button>
        </div>
      );
    }

    return null;
  }

  const fields = renderFields();

  return (
    <div
      className={`pamphlet-content-action-bar${
        portal ? " pamphlet-content-action-bar--portal" : ` pamphlet-content-action-bar--${placement}`
      }${fields ? " pamphlet-content-action-bar--with-fields" : ""} pamphlet-no-print`}
      style={style}
      role="toolbar"
      aria-label="Content item actions"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pamphlet-content-action-bar__icons">
        <div className="pamphlet-content-action-bar__group">
          <button
            type="button"
            className="pamphlet-content-action-bar__btn"
            title="Content type"
            aria-label="Content type"
            aria-haspopup="menu"
            aria-expanded={typeOpen}
            onClick={() => setTypeOpen((open) => !open)}
          >
            <IconContentType />
          </button>
          {typeOpen ? (
            <div className="pamphlet-content-action-bar__menu" role="menu">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={`pamphlet-content-action-bar__menu-item${itemType === option.id ? " is-active" : ""}`}
                  onClick={() => {
                    onSetType(option.id);
                    setTypeOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="pamphlet-content-action-bar__btn" title="Add item below" aria-label="Add item below" onClick={onAddBelow}>
          <IconAddBelow />
        </button>
        <button
          type="button"
          className="pamphlet-content-action-bar__btn"
          title="Move up"
          aria-label="Move up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <IconMoveUp />
        </button>
        <button
          type="button"
          className="pamphlet-content-action-bar__btn"
          title="Move down"
          aria-label="Move down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <IconMoveDown />
        </button>
        {textType && onBold ? (
          <button type="button" className="pamphlet-content-action-bar__btn" title="Bold" aria-label="Bold" onClick={onBold}>
            <IconBold />
          </button>
        ) : null}
        {itemType === "image" && onIncreaseImageHeight ? (
          <button
            type="button"
            className="pamphlet-content-action-bar__btn"
            title="Increase image height"
            aria-label="Increase image height"
            onClick={onIncreaseImageHeight}
          >
            <IconImageTaller />
          </button>
        ) : null}
        {itemType === "image" && onDecreaseImageHeight ? (
          <button
            type="button"
            className="pamphlet-content-action-bar__btn"
            title="Decrease image height"
            aria-label="Decrease image height"
            onClick={onDecreaseImageHeight}
          >
            <IconImageShorter />
          </button>
        ) : null}
        <button type="button" className="pamphlet-content-action-bar__btn" title="Remove item" aria-label="Remove item" onClick={onRemove}>
          <IconRemoveItem />
        </button>
      </div>
      {fields}
    </div>
  );
}

export default PamphletContentActionBar;
