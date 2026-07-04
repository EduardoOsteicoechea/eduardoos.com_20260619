import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAMPHLET_FONT_SETTINGS } from "../../lib/pamphletFontSettings";
import PamphletContentItem from "./PamphletContentItem";

const sampleItem = {
  id: "item-1",
  type: "paragraph" as const,
  heightMm: 4.2,
  text: "Sample paragraph",
  highlights: [],
  references: [],
  listItems: [],
  description: "",
  imageUrl: "",
  imageHeightMm: 0,
  contentRef: "0:subidea:0",
};

describe("PamphletContentItem", () => {
  it("renders full-width item with mm height data attribute", () => {
    render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={1}
        selected={false}
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
      />,
    );
    const block = screen.getByTestId("pamphlet-content-item");
    expect(block).toHaveStyle({ width: "100%" });
    expect(block).toHaveAttribute("data-height-mm", "4.20");
  });

  it("renders bottom margin container except for last items", () => {
    const { rerender } = render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={1.5}
        selected={false}
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pamphlet-content-item-gap")).toHaveAttribute("data-gap-mm", "1.5");

    rerender(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={0}
        selected={false}
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("pamphlet-content-item-gap")).toBeNull();
  });

  it("shows a negative inset dashed border in edit mode", () => {
    render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={0}
        selected
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pamphlet-content-item")).toHaveClass("is-selected");
  });

  it("shows the action bar when selected", () => {
    render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={0}
        selected
        actionPlacement="bottom"
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onSetType={vi.fn()}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Content item actions" })).toHaveClass(
      "pamphlet-content-action-bar--portal",
    );
  });

  it("calls onSelect when the item is clicked", () => {
    const onSelect = vi.fn();
    render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={0}
        selected={false}
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("pamphlet-content-item"));
    expect(onSelect).toHaveBeenCalledWith("item-1", expect.any(Number), expect.any(Number));
  });

  it("keeps typed characters in order while editing", () => {
    const onTextChange = vi.fn();
    render(
      <PamphletContentItem
        item={sampleItem}
        bottomMarginMm={0}
        selected
        fonts={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSelect={vi.fn()}
        onTextChange={onTextChange}
      />,
    );

    const editable = document.querySelector("[contenteditable='true']") as HTMLElement;
    editable.textContent = "abc";
    fireEvent.input(editable, { data: "abc" });

    expect(editable.textContent).toBe("abc");
  });
});
