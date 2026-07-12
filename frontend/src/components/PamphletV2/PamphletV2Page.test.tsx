import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/pamphletPersistence", () => ({
  bootstrapPamphletFromCloud: vi.fn().mockResolvedValue(null),
  loadPamphletBundle: vi.fn(),
  savePamphletBundle: vi.fn(),
  persistActivePamphletId: vi.fn(),
  readStoredPamphletId: vi.fn(() => null),
}));

vi.mock("../../lib/auth", () => ({
  isAuthenticated: vi.fn(() => false),
  getAuthToken: vi.fn(() => ""),
  getAuthEmailFromToken: vi.fn(() => null),
}));

import PamphletV2Page from "./PamphletV2Page";
import { isAuthenticated } from "../../lib/auth";

describe("PamphletV2Page preview settings", () => {
  it("renders icon activity buttons with tooltips for margin and preview tools", () => {
    render(<PamphletV2Page />);
    const bar = screen.getByRole("toolbar", { name: "Pamphlet actions" });
    expect(within(bar).getAllByRole("button")).toHaveLength(16);
    expect(screen.getByRole("button", { name: "Pamphlet view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Column view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page Top Margin" })).toHaveAttribute(
      "title",
      "Top safe margin in millimeters",
    );
    expect(screen.getByRole("button", { name: "Font sizes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to cloud" })).toBeInTheDocument();
  });

  it("activates zoom mode with canvas border and exits on Escape", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("pamphlet-preview-viewport")).toHaveClass("is-mode-active");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Exit preview mode" })).toBeNull();
  });

  it("keeps zoom mode active across multiple canvas clicks", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const viewport = screen.getByTestId("pamphlet-preview-viewport");
    expect(viewport).toHaveClass("is-mode-active");

    const stage = screen.getByTestId("pamphlet-preview-stage");
    fireEvent.click(stage);
    fireEvent.click(stage);
    expect(viewport).toHaveClass("is-mode-active");
    expect(screen.getByRole("button", { name: "Exit preview mode" })).toBeInTheDocument();
  });

  it("opens a setting panel on button click and applies saved value to the sheet", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Pamphlet view" }));
    fireEvent.click(screen.getByRole("button", { name: "Page Top Margin" }));
    const input = screen.getByLabelText("Page Top Margin (mm)");
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const sheet = document.querySelector(".pamphlet-sheet") as HTMLElement;
    expect(sheet.style.getPropertyValue("--pamphlet-margin-top")).toBe("18mm");
  });

  it("shows a login error instead of opening cloud modals when signed out", () => {
    render(<PamphletV2Page />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Sign in to open and save pamphlets from the cloud.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save to cloud" }));
    expect(screen.getByText("Sign in to open and save pamphlets from the cloud.")).toBeInTheDocument();
    expect(isAuthenticated).toHaveBeenCalled();
  });
});
