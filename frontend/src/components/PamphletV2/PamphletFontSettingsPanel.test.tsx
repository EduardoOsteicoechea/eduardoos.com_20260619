import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PAMPHLET_FONT_SETTINGS } from "../../lib/pamphletFontSettings";
import PamphletFontSettingsPanel from "./PamphletFontSettingsPanel";

describe("PamphletFontSettingsPanel", () => {
  it("renders four mm font inputs with labels", () => {
    render(
      <PamphletFontSettingsPanel
        open
        settings={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Main heading font size (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Regular heading font size (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Regular font size (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Reference font size (mm)")).toBeInTheDocument();
  });

  it("calls onSave with parsed values", () => {
    const onSave = vi.fn();
    render(
      <PamphletFontSettingsPanel
        open
        settings={DEFAULT_PAMPHLET_FONT_SETTINGS}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Regular font size (mm)"), { target: { value: "4.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ regularFontSizeMm: 4.1 }));
  });
});
