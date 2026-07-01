import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PamphletV2 from "./PamphletV2";

const componentDir = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(componentDir, "PamphletV2.css");
const cssSource = readFileSync(cssPath, "utf8");

function ruleBlock(selector: string): string {
  const escaped = selector.replace(/\./g, "\\.");
  const match = cssSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  return match?.[1]?.trim() ?? "";
}

describe("PamphletV2.tsx", () => {
  /** Line 5 — stylesheet is bundled with the component. */
  it("line 5 imports PamphletV2.css from the component directory", () => {
    expect(cssSource.length).toBeGreaterThan(0);
    expect(cssSource).toContain(".pamphlet-v2");
  });

  /** Line 7 — default export is a renderable component. */
  it("line 7 exports a default PamphletV2 component", () => {
    expect(typeof PamphletV2).toBe("function");
    expect(() => render(<PamphletV2 />)).not.toThrow();
  });

  /** Line 9 — root page wrapper. */
  it("line 9 renders the root .pamphlet-v2 container", () => {
    const { container } = render(<PamphletV2 />);
    const root = container.querySelector(".pamphlet-v2");
    expect(root).toBeInTheDocument();
    expect(root?.tagName).toBe("DIV");
  });

  /** Line 10 — header region. */
  it("line 10 renders a header.pamphlet-v2__header element", () => {
    const { container } = render(<PamphletV2 />);
    const header = container.querySelector("header.pamphlet-v2__header");
    expect(header).toBeInTheDocument();
  });

  /** Line 11 — title heading text. */
  it("line 11 renders the Pamphlet title inside h1.pamphlet-v2__title", () => {
    render(<PamphletV2 />);
    const title = screen.getByRole("heading", { level: 1, name: "Pamphlet" });
    expect(title).toHaveClass("pamphlet-v2__title");
  });

  /** Line 12 — header closes before main (header is not nested inside main). */
  it("line 12 keeps the header outside the main workspace", () => {
    const { container } = render(<PamphletV2 />);
    const header = container.querySelector("header.pamphlet-v2__header");
    const main = container.querySelector("main.pamphlet-v2__main");
    expect(header).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(main?.contains(header)).toBe(false);
  });

  /** Line 14 — main workspace landmark. */
  it("line 14 renders main.pamphlet-v2__main with aria-label Pamphlet workspace", () => {
    render(<PamphletV2 />);
    const main = screen.getByRole("main", { name: "Pamphlet workspace" });
    expect(main).toHaveClass("pamphlet-v2__main");
    expect(main.childElementCount).toBe(0);
  });

  /** Lines 16–18 — activity bar footer element and class. */
  it("lines 16-18 render footer.pamphlet-v2__activity", () => {
    const { container } = render(<PamphletV2 />);
    const activity = container.querySelector("footer.pamphlet-v2__activity");
    expect(activity).toBeInTheDocument();
  });

  /** Line 18 — toolbar role for the activity bar. */
  it("line 18 sets role toolbar on the activity bar", () => {
    render(<PamphletV2 />);
    expect(screen.getByRole("toolbar", { name: "Pamphlet activity bar" })).toBeInTheDocument();
  });

  /** Line 19 — accessible name for the activity bar. */
  it("line 19 sets aria-label Pamphlet activity bar", () => {
    render(<PamphletV2 />);
    const bar = screen.getByLabelText("Pamphlet activity bar");
    expect(bar.tagName).toBe("FOOTER");
  });

  /** Lines 20–21 — activity bar is empty for now. */
  it("lines 20-21 keep the activity bar empty", () => {
    render(<PamphletV2 />);
    const bar = screen.getByRole("toolbar", { name: "Pamphlet activity bar" });
    expect(bar.textContent?.trim()).toBe("");
    expect(bar.childElementCount).toBe(0);
  });

  /** Line 21 — page chrome order: header, main, activity bar. */
  it("line 21 orders header, main, then activity bar inside the root", () => {
    const { container } = render(<PamphletV2 />);
    const root = container.querySelector(".pamphlet-v2");
    const children = [...(root?.children ?? [])].map((el) => el.tagName);
    expect(children).toEqual(["HEADER", "MAIN", "FOOTER"]);
  });
});

describe("PamphletV2.css", () => {
  it("lines 5-11 define .pamphlet-v2 flex column shell", () => {
    const block = ruleBlock(".pamphlet-v2");
    expect(block).toContain("display: flex");
    expect(block).toContain("flex-direction: column");
    expect(block).toContain("width: 100%");
    expect(block).toContain("min-height: calc(var(--vv-height, 100dvh) - var(--header_height) - var(--activity-bar-height))");
    expect(block).toContain("color: var(--site-body-fg)");
  });

  it("lines 13-19 define .pamphlet-v2__header chrome", () => {
    const block = ruleBlock(".pamphlet-v2__header");
    expect(block).toContain("flex: 0 0 auto");
    expect(block).toContain("width: 100%");
    expect(block).toContain("padding: 0.75rem 0");
    expect(block).toContain("border-bottom: var(--border_001)");
    expect(block).toContain("background: var(--glassed_background)");
  });

  it("lines 21-25 define .pamphlet-v2__title typography", () => {
    const block = ruleBlock(".pamphlet-v2__title");
    expect(block).toContain("font-size: var(--font-lg)");
    expect(block).toContain("font-weight: 700");
    expect(block).toContain("color: var(--site-body-fg)");
  });

  it("lines 27-32 define .pamphlet-v2__main workspace", () => {
    const block = ruleBlock(".pamphlet-v2__main");
    expect(block).toContain("flex: 1 1 auto");
    expect(block).toContain("min-height: 0");
    expect(block).toContain("width: 100%");
    expect(block).toContain("background: var(--site-body-bg)");
  });

  it("lines 34-46 define fixed bottom .pamphlet-v2__activity bar", () => {
    const block = ruleBlock(".pamphlet-v2__activity");
    expect(block).toContain("position: fixed");
    expect(block).toContain("left: 0");
    expect(block).toContain("right: 0");
    expect(block).toContain("bottom: 0");
    expect(block).toContain("z-index: 500");
    expect(block).toContain("height: var(--activity-bar-height)");
    expect(block).toContain("min-height: var(--activity-bar-height)");
    expect(block).toContain("border-top: var(--border_001)");
    expect(block).toContain("background: var(--site-chrome-bar-bg)");
    expect(block).toContain("color: var(--site-chrome-bar-fg)");
    expect(block).toContain("box-shadow: 0 -2px 12px color-mix(in srgb, var(--site-body-fg) 12%, transparent)");
  });
});
