/**
 * PamphletContentZone.tsx — Renders placed content items inside one sheet zone.
 */
import type { PamphletContentItemType, PamphletPlacedItem, PamphletZoneId } from "../../lib/pamphletContent";
import type { PamphletFontSettings } from "../../lib/pamphletFontSettings";
import PamphletContentItem from "./PamphletContentItem";
import "./PamphletContentZone.css";

export interface PamphletContentZoneHandlers {
  onSelectItem: (itemId: string, zoneId: PamphletZoneId, elementTopPx: number, elementBottomPx: number) => void;
  onSetType: (itemId: string, zoneId: PamphletZoneId, type: PamphletContentItemType) => void;
  onAddBelow: (itemId: string, zoneId: PamphletZoneId) => void;
  onMoveUp: (itemId: string, zoneId: PamphletZoneId) => void;
  onMoveDown: (itemId: string, zoneId: PamphletZoneId) => void;
  onRemove: (itemId: string, zoneId: PamphletZoneId) => void;
  onBold: (itemId: string, zoneId: PamphletZoneId) => void;
  onIncreaseImageHeight: (itemId: string, zoneId: PamphletZoneId) => void;
  onDecreaseImageHeight: (itemId: string, zoneId: PamphletZoneId) => void;
  onTextChange: (itemId: string, zoneId: PamphletZoneId, text: string) => void;
  onImageUpload: (itemId: string, zoneId: PamphletZoneId, file: File) => void;
  onImageReferenceChange: (itemId: string, zoneId: PamphletZoneId, value: string) => void;
  onQuoteReferenceChange: (itemId: string, zoneId: PamphletZoneId, value: string) => void;
  onListHeaderChange: (itemId: string, zoneId: PamphletZoneId, value: string) => void;
  onListItemChange: (itemId: string, zoneId: PamphletZoneId, index: number, value: string) => void;
  onAddListItem: (itemId: string, zoneId: PamphletZoneId) => void;
  onRemoveListItem: (itemId: string, zoneId: PamphletZoneId, index: number) => void;
}

interface PamphletContentZoneProps {
  zoneId: PamphletZoneId;
  items: PamphletPlacedItem[];
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  fonts: PamphletFontSettings;
  imageUploadingItemId: string | null;
  imageUploadError: string;
  handlers: PamphletContentZoneHandlers;
  allowEmpty?: boolean;
  readOnly?: boolean;
  emptyHint?: string;
  onEmptyActivate?: () => void;
}

export function PamphletContentZone({
  zoneId,
  items,
  selectedItemId,
  actionPlacement,
  fonts,
  imageUploadingItemId,
  imageUploadError,
  handlers,
  allowEmpty = false,
  readOnly = false,
  emptyHint = "Click to add content",
  onEmptyActivate,
}: PamphletContentZoneProps) {
  if (items.length === 0 && !allowEmpty) {
    return null;
  }

  if (items.length === 0 && allowEmpty) {
    return (
      <div
        className="pamphlet-content-zone pamphlet-content-zone--empty"
        data-zone-id={zoneId}
        role="button"
        tabIndex={readOnly ? -1 : 0}
        aria-label={`Empty ${zoneId} zone`}
        onClick={readOnly ? undefined : onEmptyActivate}
        onKeyDown={
          readOnly || !onEmptyActivate
            ? undefined
            : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEmptyActivate();
                }
              }
        }
      >
        <span className="pamphlet-content-zone__empty-hint">{emptyHint}</span>
      </div>
    );
  }

  return (
    <div className="pamphlet-content-zone" data-zone-id={zoneId}>
      {items.map((placed, index) => {
        const selected = !readOnly && selectedItemId === placed.item.id;
        return (
          <PamphletContentItem
            key={placed.item.id}
            item={placed.item}
            bottomMarginMm={placed.bottomMarginMm}
            selected={selected}
            readOnly={readOnly}
            actionPlacement={selected ? actionPlacement : "top"}
            fonts={fonts}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            imageUploading={imageUploadingItemId === placed.item.id}
            imageUploadError={selected ? imageUploadError : ""}
            onSelect={(itemId, elementTopPx, elementBottomPx) =>
              handlers.onSelectItem(itemId, zoneId, elementTopPx, elementBottomPx)
            }
            onSetType={(type) => handlers.onSetType(placed.item.id, zoneId, type)}
            onAddBelow={() => handlers.onAddBelow(placed.item.id, zoneId)}
            onMoveUp={() => handlers.onMoveUp(placed.item.id, zoneId)}
            onMoveDown={() => handlers.onMoveDown(placed.item.id, zoneId)}
            onRemove={() => handlers.onRemove(placed.item.id, zoneId)}
            onBold={() => handlers.onBold(placed.item.id, zoneId)}
            onIncreaseImageHeight={() => handlers.onIncreaseImageHeight(placed.item.id, zoneId)}
            onDecreaseImageHeight={() => handlers.onDecreaseImageHeight(placed.item.id, zoneId)}
            onTextChange={(text) => handlers.onTextChange(placed.item.id, zoneId, text)}
            onImageUpload={(file) => handlers.onImageUpload(placed.item.id, zoneId, file)}
            onImageReferenceChange={(value) => handlers.onImageReferenceChange(placed.item.id, zoneId, value)}
            onQuoteReferenceChange={(value) => handlers.onQuoteReferenceChange(placed.item.id, zoneId, value)}
            onListHeaderChange={(value) => handlers.onListHeaderChange(placed.item.id, zoneId, value)}
            onListItemChange={(itemIndex, value) => handlers.onListItemChange(placed.item.id, zoneId, itemIndex, value)}
            onAddListItem={() => handlers.onAddListItem(placed.item.id, zoneId)}
            onRemoveListItem={(itemIndex) => handlers.onRemoveListItem(placed.item.id, zoneId, itemIndex)}
          />
        );
      })}
    </div>
  );
}

export default PamphletContentZone;
