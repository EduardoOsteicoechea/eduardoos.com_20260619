/**
 * PamphletItemEditSidebar.tsx — Fixed right editor: live preview above, controls below.
 * On narrow viewports becomes a padded modal over a blurred backdrop.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { PamphletContentItemHandlers } from "./PamphletContentItem";
import PamphletItemView from "./PamphletItemView";
import type { PamphletV3ContentItem, PamphletV3ItemType } from "./pamphletV3Content";
import "./PamphletItemEditSidebar.css";
import "./PamphletContentItem.css";

interface PamphletItemEditSidebarProps {
  item: PamphletV3ContentItem;
  handlers: PamphletContentItemHandlers;
  onDismiss: () => void;
}

export default function PamphletItemEditSidebar({
  item,
  handlers,
  onDismiss,
}: PamphletItemEditSidebarProps) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
    if (textRef.current) {
      const length = textRef.current.value.length;
      textRef.current.setSelectionRange(length, length);
    }
  }, [item.id, item.type]);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handlers.onCancelEdit(item.id);
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      item.type !== "list" &&
      item.type !== "image" &&
      (event.target as HTMLElement).tagName === "TEXTAREA"
    ) {
      event.preventDefault();
      handlers.onAddBelow(item.id);
    }
  }

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onDismiss();
    }
  }

  function renderToolbar() {
    return (
      <div className="pamphlet-v3-item__toolbar" role="toolbar" aria-label="Item actions">
        <select
          aria-label="Item type"
          value={item.type}
          onChange={(event) => handlers.onSetType(item.id, event.target.value as PamphletV3ItemType)}
        >
          <option value="paragraph">Paragraph</option>
          <option value="key_idea">Key idea</option>
          <option value="list">List</option>
          <option value="image">Image</option>
        </select>
        <button type="button" onClick={() => handlers.onAddBelow(item.id)} title="Add below (Enter)">
          +
        </button>
        {(item.type === "paragraph" || item.type === "key_idea" || item.type === "list") && (
          <button type="button" onClick={() => handlers.onToggleBold(item.id)} title="Bold">
            B
          </button>
        )}
        {item.type === "image" && (
          <>
            <button type="button" onClick={() => handlers.onIncreaseImageHeight(item.id)} title="Taller image">
              ↕+
            </button>
            <button type="button" onClick={() => handlers.onDecreaseImageHeight(item.id)} title="Shorter image">
              ↕−
            </button>
          </>
        )}
        <button type="button" onClick={() => handlers.onRemove(item.id)} title="Remove">
          ⌫
        </button>
        <button type="button" onClick={onDismiss} title="Done">
          Done
        </button>
      </div>
    );
  }

  function renderControls() {
    if (item.type === "list") {
      return (
        <div className="pamphlet-v3-item__list-edit">
          <input
            className="pamphlet-v3-item__input pamphlet-v3-item__list-header"
            value={item.text}
            placeholder="List header"
            onChange={(event) => handlers.onChange(item.id, { text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handlers.onAddBelow(item.id);
              }
            }}
          />
          {item.listItems.map((row, index) => (
            <div key={row.id} className="pamphlet-v3-item__list-row">
              <input
                className="pamphlet-v3-item__input"
                value={row.text}
                placeholder={`Item ${index + 1}`}
                onChange={(event) => {
                  const listItems = item.listItems.map((entry) =>
                    entry.id === row.id ? { ...entry, text: event.target.value } : entry,
                  );
                  handlers.onChange(item.id, { listItems });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handlers.onAddBelow(item.id);
                  }
                }}
              />
              <button
                type="button"
                className="pamphlet-v3-item__list-remove"
                onClick={() =>
                  handlers.onChange(item.id, {
                    listItems: item.listItems.filter((entry) => entry.id !== row.id),
                  })
                }
              >
                −
              </button>
            </div>
          ))}
          <button
            type="button"
            className="pamphlet-v3-item__list-add"
            onClick={() =>
              handlers.onChange(item.id, {
                listItems: [...item.listItems, { id: `li-${Date.now()}`, text: "" }],
              })
            }
          >
            + Add item
          </button>
        </div>
      );
    }

    if (item.type === "image") {
      return (
        <div className="pamphlet-v3-item__image-edit">
          <input
            type="file"
            accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              handlers.onChange(item.id, { imageUrl: URL.createObjectURL(file) });
            }}
          />
          <input
            className="pamphlet-v3-item__input"
            value={item.description}
            placeholder="Image description"
            onChange={(event) => handlers.onChange(item.id, { description: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handlers.onAddBelow(item.id);
              }
            }}
          />
        </div>
      );
    }

    const textClass =
      item.type === "key_idea"
        ? "pamphlet-v3-item__text pamphlet-v3-item__text--key-idea"
        : "pamphlet-v3-item__text";

    return (
      <textarea
        ref={textRef}
        className={`pamphlet-v3-item__input ${textClass}`}
        value={item.text}
        placeholder={item.type === "key_idea" ? "Key idea" : "Paragraph"}
        rows={6}
        onChange={(event) => handlers.onChange(item.id, { text: event.target.value })}
      />
    );
  }

  return (
    <div
      className="pamphlet_item_edit_backdrop pamphlet-no-print"
      data-pamphlet-edit-backdrop="true"
      onPointerDown={handleBackdropPointerDown}
    >
      <aside
        className="pamphlet_item_edit_sidebar"
        data-pamphlet-edit-sidebar="true"
        data-editing-item-id={item.id}
        aria-label="Edit pamphlet item"
        onKeyDown={handleKeyDown}
      >
        <div className="pamphlet_item_edit_sidebar__preview">
          <p className="pamphlet_item_edit_sidebar__section_label">Preview</p>
          <div className="pamphlet_item_edit_sidebar__preview_frame">
            <PamphletItemView item={item} className="pamphlet_item_edit_sidebar__preview_item" />
          </div>
        </div>
        <div className="pamphlet_item_edit_sidebar__controls">
          <p className="pamphlet_item_edit_sidebar__section_label">Controls</p>
          {renderToolbar()}
          {renderControls()}
        </div>
      </aside>
    </div>
  );
}
