import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PamphletContentActionBar from "./PamphletContentActionBar";

describe("PamphletContentActionBar", () => {
  it("renders type, add, move, and remove icon buttons with tooltips", () => {
    render(
      <PamphletContentActionBar
        itemType="paragraph"
        canMoveUp
        canMoveDown
        placement="top"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Content type" })).toHaveAttribute("title", "Content type");
    expect(screen.getByRole("button", { name: "Add item below" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move down" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove item" })).toBeInTheDocument();
  });

  it("shows bold for text types and image size controls for images", () => {
    const { rerender } = render(
      <PamphletContentActionBar
        itemType="paragraph"
        canMoveUp={false}
        canMoveDown={false}
        placement="top"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onBold={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();

    rerender(
      <PamphletContentActionBar
        itemType="image"
        canMoveUp={false}
        canMoveDown={false}
        placement="bottom"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onIncreaseImageHeight={vi.fn()}
        onDecreaseImageHeight={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Increase image height" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease image height" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
  });

  it("uses a full-width wrapping toolbar container", () => {
    render(
      <PamphletContentActionBar
        itemType="paragraph"
        canMoveUp
        canMoveDown
        placement="top"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Content item actions" })).toHaveClass(
      "pamphlet-content-action-bar",
    );
  });

  it("opens the type menu and selects a content type", () => {
    const onSetType = vi.fn();
    render(
      <PamphletContentActionBar
        itemType="paragraph"
        canMoveUp={false}
        canMoveDown={false}
        placement="top"
        onSetType={onSetType}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Content type" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "List" }));
    expect(onSetType).toHaveBeenCalledWith("list");
  });

  it("renders image upload and reference fields for image blocks", () => {
    render(
      <PamphletContentActionBar
        itemType="image"
        canMoveUp={false}
        canMoveDown={false}
        placement="top"
        imageReference="Caption"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onIncreaseImageHeight={vi.fn()}
        onDecreaseImageHeight={vi.fn()}
        onImageReferenceChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Upload image")).toBeInTheDocument();
    expect(screen.getByLabelText("Image reference")).toHaveValue("Caption");
  });

  it("renders quote reference and list editing fields", () => {
    render(
      <PamphletContentActionBar
        itemType="quote"
        canMoveUp={false}
        canMoveDown={false}
        placement="top"
        quoteReference="Romanos 12:2"
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onQuoteReferenceChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Quote reference")).toHaveValue("Romanos 12:2");

    render(
      <PamphletContentActionBar
        itemType="list"
        canMoveUp={false}
        canMoveDown={false}
        placement="top"
        listHeader="Steps"
        listItems={[{ text: "Pray", highlights: [] }]}
        onSetType={vi.fn()}
        onAddBelow={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onListHeaderChange={vi.fn()}
        onListItemChange={vi.fn()}
        onAddListItem={vi.fn()}
        onRemoveListItem={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("List header")).toHaveValue("Steps");
    expect(screen.getByLabelText("List item 1")).toHaveValue("Pray");
    expect(screen.getByRole("button", { name: "+ Add item" })).toBeInTheDocument();
  });
});
