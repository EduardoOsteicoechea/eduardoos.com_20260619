import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityBar } from "./ActivityBar";

const cssSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "ActivityBar.css"),
  "utf8",
);

describe("ActivityBar", () => {
  it("renders an empty toolbar when no buttons are provided", () => {
    render(<ActivityBar buttons={[]} ariaLabel="Pamphlet actions" />);
    const bar = screen.getByRole("toolbar", { name: "Pamphlet actions" });
    expect(bar).toHaveClass("site-activity-bar");
    expect(bar.querySelectorAll("button")).toHaveLength(0);
  });

  it("renders buttons and invokes each handler independently", () => {
    const onSave = vi.fn();
    const onPreview = vi.fn();
    render(
      <ActivityBar
        buttons={[
          { id: "save", label: "Save", onClick: onSave },
          { id: "preview", label: "Preview", onClick: onPreview, active: true },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Preview" })).toHaveClass("is-active");
  });

  it("uses header height for mobile bottom bar sizing", () => {
    expect(cssSource).toContain("height: var(--header_height)");
    expect(cssSource).toContain("bottom: 0");
  });

  it("uses left rail layout from tablet breakpoint", () => {
    expect(cssSource).toContain("@media (min-width: 768px)");
    expect(cssSource).toContain("width: var(--header_height)");
    expect(cssSource).toContain("top: var(--header_height)");
  });
});
