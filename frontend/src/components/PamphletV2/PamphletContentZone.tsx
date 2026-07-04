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
}

interface PamphletContentZoneProps {
  zoneId: PamphletZoneId;
  items: PamphletPlacedItem[];
  selectedItemId: string | null;
  actionPlacement: "top" | "bottom";
  fonts: PamphletFontSettings;
  handlers: PamphletContentZoneHandlers;
}

export function PamphletContentZone({
  zoneId,
  items,
  selectedItemId,
  actionPlacement,
  fonts,
  handlers,
}: PamphletContentZoneProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pamphlet-content-zone" data-zone-id={zoneId}>
      {items.map((placed, index) => {
        const selected = selectedItemId === placed.item.id;
        return (
          <PamphletContentItem
            key={placed.item.id}
            item={placed.item}
            bottomMarginMm={placed.bottomMarginMm}
            selected={selected}
            actionPlacement={selected ? actionPlacement : "top"}
            fonts={fonts}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
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
          />
        );
      })}
    </div>
  );
}

export default PamphletContentZone;
