import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAMPHLET_LAYOUT_SETTINGS } from "../../lib/pamphletLayout";
import { PamphletSettingPanel } from "./PamphletSettingPanel";

describe("PamphletSettingPanel", () => {
  it("shows label and mm input when open", () => {
    render(
      <PamphletSettingPanel
        open
        label="Page Top Margin"
        valueMm={DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageTopMarginMm}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Page Top Margin")).toBeInTheDocument();
    expect(screen.getByLabelText("Page Top Margin (mm)")).toHaveValue(
      DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageTopMarginMm,
    );
  });

  it("calls onSave with parsed mm value and onClose when Save is pressed", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <PamphletSettingPanel
        open
        label="Page Top Margin"
        valueMm={10}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText("Page Top Margin (mm)"), { target: { value: "14.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(14.5);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose without saving when Close is pressed", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <PamphletSettingPanel
        open
        label="Page Top Margin"
        valueMm={10}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <PamphletSettingPanel
        open={false}
        label="Page Top Margin"
        valueMm={10}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector(".pamphlet-setting-panel")).toBeNull();
  });
});
