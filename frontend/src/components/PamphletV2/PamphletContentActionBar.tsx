/**
 * PamphletContentActionBar.tsx — Inner icon toolbar for one content item.
 */
import { useState } from "react";
import type { PamphletContentItemType } from "../../lib/pamphletContent";
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
  { id: "list", label: "List" },
  { id: "image", label: "Image" },
];

interface PamphletContentActionBarProps {
  itemType: PamphletContentItemType;
  placement: "top" | "bottom";
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
}

export function PamphletContentActionBar({
  itemType,
  placement,
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
}: PamphletContentActionBarProps) {
  const [typeOpen, setTypeOpen] = useState(false);
  const textType = itemType === "paragraph" || itemType === "key_idea" || itemType === "list" || itemType === "quote";

  return (
    <div
      className={`pamphlet-content-action-bar pamphlet-content-action-bar--${placement} pamphlet-no-print`}
      role="toolbar"
      aria-label="Content item actions"
      onClick={(event) => event.stopPropagation()}
    >
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
  );
}

export default PamphletContentActionBar;
