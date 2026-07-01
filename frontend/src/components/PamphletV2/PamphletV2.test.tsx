import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PamphletV2 from "./PamphletV2";
import PamphletV2Page from "./PamphletV2Page";

const componentDir = path.dirname(fileURLToPath(import.meta.url));
const printCss = readFileSync(path.join(componentDir, "pamphlet-print.css"), "utf8");
const workspaceCss = readFileSync(path.join(componentDir, "PamphletV2.css"), "utf8");

describe("PamphletV2.tsx", () => {
  it("exports a default generator workspace component", () => {
    expect(typeof PamphletV2).toBe("function");
    expect(() => render(<PamphletV2 />)).not.toThrow();
  });

  it("renders generator chrome without site header or activity bar", () => {
    const { container } = render(<PamphletV2 />);
    expect(container.querySelector(".pamphlet-v2")).toBeInTheDocument();
    expect(container.querySelector(".site-header")).toBeNull();
    expect(container.querySelector(".site-activity-bar")).toBeNull();
  });

  it("renders a physical pamphlet-sheet with page 1 structure", () => {
    const { container } = render(<PamphletV2 />);
    const sheet = container.querySelector(".pamphlet-sheet");
    expect(sheet).toHaveAttribute("data-sheet-index", "1");
    expect(container.querySelector("#zone-header")).toBeInTheDocument();
    expect(container.querySelector("#zone-footer")).toBeInTheDocument();
    expect(container.querySelectorAll(".pamphlet-sheet__column")).toHaveLength(4);
    expect(container.querySelector("#s1r-col0")).toBeInTheDocument();
    expect(container.querySelector("#s1l-col1")).toBeInTheDocument();
  });

  it("labels the generator workspace for assistive tech", () => {
    render(<PamphletV2 />);
    expect(screen.getByLabelText("Pamphlet generator")).toBeInTheDocument();
  });
});

describe("pamphlet-print.css", () => {
  it("defines exact US Letter portrait dimensions on pamphlet-sheet", () => {
    expect(printCss).toContain("--pamphlet-sheet-w: 215.9mm");
    expect(printCss).toContain("--pamphlet-sheet-h: 279.4mm");
    expect(printCss).toContain("box-sizing: border-box");
    expect(printCss).toContain("padding: var(--pamphlet-safe-margin)");
    expect(printCss).toContain("--pamphlet-safe-margin: 10mm");
  });

  it("centers sheets on screen with shadow and uses mm for layout gaps", () => {
    expect(printCss).toContain("margin: 0 auto");
    expect(printCss).toContain("box-shadow:");
    expect(printCss).toContain("--pamphlet-mid-gap: 25mm");
    expect(printCss).toContain("--pamphlet-col-gap: 4mm");
    expect(printCss).toContain("--pamphlet-hf-gap: 5mm");
    expect(printCss).toContain("gap: var(--pamphlet-para-sep)");
  });

  it("implements robust @media print rules", () => {
    expect(printCss).toContain("@page");
    expect(printCss).toContain("size: letter");
    expect(printCss).toContain("margin: 0");
    expect(printCss).toContain("page-break-after: always");
    expect(printCss).toContain("break-after: page");
    expect(printCss).toContain("-webkit-print-color-adjust: exact");
    expect(printCss).toContain("print-color-adjust: exact");
    expect(printCss).toContain(".site-header");
    expect(printCss).toContain(".pamphlet-no-print");
    expect(printCss).toContain("box-shadow: none");
  });
});

describe("PamphletV2.css", () => {
  it("scopes workspace shell without sheet dimension rules", () => {
    expect(workspaceCss).toContain(".pamphlet-v2");
    expect(workspaceCss).not.toContain("215.9mm");
    expect(workspaceCss).not.toContain(".pamphlet-sheet");
  });
});

describe("PamphletV2Page.tsx", () => {
  it("composes the global activity bar and generator workspace", () => {
    const { container } = render(<PamphletV2Page />);
    expect(container.querySelector(".pamphlet-v2-page")).toBeInTheDocument();
    expect(container.querySelector(".pamphlet-no-print")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Pamphlet actions" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pamphlet generator")).toBeInTheDocument();
  });
});
