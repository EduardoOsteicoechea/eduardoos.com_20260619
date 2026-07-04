import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PamphletPreviewViewport from "./PamphletPreviewViewport";

describe("PamphletPreviewViewport", () => {
  it("shows mode border and exit control when a preview mode is active", () => {
    render(
      <PamphletPreviewViewport
        mode="zoom-in"
        zoomScale={1}
        pan={{ x: 0, y: 0 }}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onPanChange={vi.fn()}
        onExitMode={vi.fn()}
      >
        <div data-testid="preview-content">Preview</div>
      </PamphletPreviewViewport>,
    );

    expect(screen.getByTestId("pamphlet-preview-viewport")).toHaveClass("is-mode-active");
    expect(screen.getByRole("button", { name: "Exit preview mode" })).toBeInTheDocument();
  });

  it("zooms in when the canvas is clicked in zoom-in mode", () => {
    const onZoomIn = vi.fn();
    render(
      <PamphletPreviewViewport
        mode="zoom-in"
        zoomScale={1}
        pan={{ x: 0, y: 0 }}
        onZoomIn={onZoomIn}
        onZoomOut={vi.fn()}
        onPanChange={vi.fn()}
        onExitMode={vi.fn()}
      >
        <div>Preview</div>
      </PamphletPreviewViewport>,
    );

    fireEvent.click(screen.getByTestId("pamphlet-preview-stage"));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it("exits mode on Escape or exit button", () => {
    const onExitMode = vi.fn();
    render(
      <PamphletPreviewViewport
        mode="drag"
        zoomScale={1}
        pan={{ x: 0, y: 0 }}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onPanChange={vi.fn()}
        onExitMode={onExitMode}
      >
        <div>Preview</div>
      </PamphletPreviewViewport>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Exit preview mode" }));
    expect(onExitMode).toHaveBeenCalledTimes(2);
  });

  it("pans the canvas while dragging in drag mode", () => {
    const onPanChange = vi.fn();
    render(
      <PamphletPreviewViewport
        mode="drag"
        zoomScale={1}
        pan={{ x: 0, y: 0 }}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onPanChange={onPanChange}
        onExitMode={vi.fn()}
      >
        <div>Preview</div>
      </PamphletPreviewViewport>,
    );

    const stage = screen.getByTestId("pamphlet-preview-stage");
    fireEvent.mouseDown(stage, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 130, clientY: 120 });
    fireEvent.mouseUp(window);

    expect(onPanChange).toHaveBeenCalledWith(30, 20);
  });
});
