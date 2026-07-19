/**
 * PamphletContentItem.tsx — One editable pamphlet block with measured mm height.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import {
  pamphletV3ItemHasContent,
  pxToMm,
  type PamphletV3ContentItem,
  type PamphletV3ItemType,
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
  handlers: PamphletContentItemHandlers;
}

export default function PamphletContentItem({
  item,
  editing,
  editDisabled,
  handlers,
}: PamphletContentItemProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
      const length = textRef.current.value.length;
      textRef.current.setSelectionRange(length, length);
    }
  }, [editing, item.id]);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    function publishHeight() {
      if (!rootRef.current || editing) {
        return;
      }
      const nextMm = pxToMm(rootRef.current.getBoundingClientRect().height);
      if (Math.abs(nextMm - item.heightMm) < 0.15) {
        return;
      }
      handlers.onHeightChange(item.id, nextMm);
    }

    const observer = new ResizeObserver(() => publishHeight());
    observer.observe(node);
    publishHeight();
    return () => observer.disconnect();
  }, [
    handlers,
    item.heightMm,
    item.id,
    editing,
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

  function handleKeyDown(event: KeyboardEvent) {
    if (!editing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handlers.onCancelEdit(item.id);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && item.type !== "list") {
      event.preventDefault();
      handlers.onAddBelow(item.id);
    }
  }

  function renderToolbar() {
    if (!editing) {
      return null;
    }
    return (
      <div className="pamphlet-v3-item__toolbar pamphlet-no-print" role="toolbar" aria-label="Item actions">
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
          <button type="button" onClick={() => handlers.onToggleBold(item.id)} title="Bold selection">
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
      </div>
    );
  }

  function renderBody() {
    if (item.type === "list") {
      if (editing) {
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
      return (
        <div className="pamphlet-v3-item__list">
          {item.text.trim() ? <p className="pamphlet-v3-item__list-header-view">{item.text}</p> : null}
          <ul>
            {(item.listItems.length > 0 ? item.listItems : [{ id: "empty", text: "" }]).map((row) => (
              <li key={row.id}>{row.text || "\u00a0"}</li>
            ))}
          </ul>
        </div>
      );
    }

    if (item.type === "image") {
      if (editing) {
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
      return (
        <div className="pamphlet-v3-item__image">
          <div className="pamphlet-v3-item__image-frame">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.description || "Pamphlet image"} /> : null}
          </div>
          {item.description ? <p className="pamphlet-v3-item__description">{item.description}</p> : null}
        </div>
      );
    }

    const textClass =
      item.type === "key_idea"
        ? "pamphlet-v3-item__text pamphlet-v3-item__text--key-idea"
        : "pamphlet-v3-item__text";

    if (editing) {
      return (
        <textarea
          ref={textRef}
          className={`pamphlet-v3-item__input ${textClass}`}
          value={item.text}
          placeholder={item.type === "key_idea" ? "Key idea" : "Paragraph"}
          rows={2}
          onChange={(event) => handlers.onChange(item.id, { text: event.target.value })}
        />
      );
    }

    if (!pamphletV3ItemHasContent(item)) {
      return <p className={textClass}>{"\u00a0"}</p>;
    }

    return (
      <p
        className={textClass}
        dangerouslySetInnerHTML={{ __html: item.text.trim() ? item.text : "&nbsp;" }}
      />
    );
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
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      {renderToolbar()}
      {renderBody()}
    </div>
  );
}
