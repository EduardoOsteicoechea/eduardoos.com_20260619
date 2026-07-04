import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PamphletModal from "./PamphletModal";

describe("PamphletModal", () => {
  it("closes when clicking the backdrop or the top-right close button", () => {
    const onClose = vi.fn();
    render(
      <PamphletModal open title="Test modal" onClose={onClose}>
        <p>Modal body</p>
      </PamphletModal>,
    );

    fireEvent.click(screen.getByRole("dialog", { name: "Test modal" }).parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog body", () => {
    const onClose = vi.fn();
    render(
      <PamphletModal open title="Test modal" onClose={onClose}>
        <p>Modal body</p>
      </PamphletModal>,
    );

    fireEvent.click(screen.getByText("Modal body"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
