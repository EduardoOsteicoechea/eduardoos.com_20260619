/**
 * PamphletItemView.tsx — Final printed/view presentation for one content item.
 */
import type { CSSProperties, ReactNode } from "react";
import { pamphletV3ItemHasContent, type PamphletV3ContentItem } from "./pamphletV3Content";
import "./PamphletContentItem.css";

interface PamphletItemViewProps {
  item: PamphletV3ContentItem;
  className?: string;
}

/** Renders the on-sheet / preview appearance of an item (no edit chrome). */
export default function PamphletItemView({ item, className }: PamphletItemViewProps) {
  const style = {
    "--item-image-h": `${item.imageHeightMm}mm`,
  } as CSSProperties;

  let body: ReactNode;

  if (item.type === "list") {
    body = (
      <div className="pamphlet-v3-item__list">
        {item.text.trim() ? <p className="pamphlet-v3-item__list-header-view">{item.text}</p> : null}
        <ul>
          {(item.listItems.length > 0 ? item.listItems : [{ id: "empty", text: "" }]).map((row) => (
            <li key={row.id}>{row.text || "\u00a0"}</li>
          ))}
        </ul>
      </div>
    );
  } else if (item.type === "image") {
    body = (
      <div className="pamphlet-v3-item__image">
        <div className="pamphlet-v3-item__image-frame">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.description || "Pamphlet image"} /> : null}
        </div>
        {item.description ? <p className="pamphlet-v3-item__description">{item.description}</p> : null}
      </div>
    );
  } else {
    const textClass =
      item.type === "key_idea"
        ? "pamphlet-v3-item__text pamphlet-v3-item__text--key-idea"
        : item.type === "heading"
          ? "pamphlet-v3-item__text pamphlet-v3-item__text--heading"
          : "pamphlet-v3-item__text";

    body = !pamphletV3ItemHasContent(item) ? (
      <p className={textClass}>{"\u00a0"}</p>
    ) : (
      <p
        className={textClass}
        dangerouslySetInnerHTML={{ __html: item.text.trim() ? item.text : "&nbsp;" }}
      />
    );
  }

  return (
    <div className={className} style={style} data-item-view-type={item.type}>
      {body}
    </div>
  );
}
