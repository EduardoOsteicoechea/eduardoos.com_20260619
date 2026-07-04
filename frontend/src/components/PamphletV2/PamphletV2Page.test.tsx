import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PamphletV2Page from "./PamphletV2Page";

describe("PamphletV2Page preview settings", () => {
  it("renders icon activity buttons with tooltips for margin and preview tools", () => {
    render(<PamphletV2Page />);
    const bar = screen.getByRole("toolbar", { name: "Pamphlet actions" });
    expect(within(bar).getAllByRole("button")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Page Top Margin" })).toHaveAttribute(
      "title",
      "Top safe margin in millimeters",
    );
    expect(screen.getByRole("button", { name: "Font sizes" })).toBeInTheDocument();
  });

  it("activates zoom mode with canvas border and exits on Escape", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("pamphlet-preview-viewport")).toHaveClass("is-mode-active");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Exit preview mode" })).toBeNull();
  });

  it("opens a setting panel on button click and applies saved value to the sheet", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Page Top Margin" }));
    const input = screen.getByLabelText("Page Top Margin (mm)");
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const sheet = document.querySelector(".pamphlet-sheet") as HTMLElement;
    expect(sheet.style.getPropertyValue("--pamphlet-margin-top")).toBe("18mm");
  });
});
