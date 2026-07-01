import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PamphletV2 from "./PamphletV2";
import PamphletV2Page from "./PamphletV2Page";

const componentDir = path.dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(path.join(componentDir, "PamphletV2.css"), "utf8");

describe("PamphletV2.tsx", () => {
  it("imports PamphletV2.css", () => {
    expect(cssSource).toContain(".pamphlet-v2");
  });

  it("exports a default generator workspace component", () => {
    expect(typeof PamphletV2).toBe("function");
    expect(() => render(<PamphletV2 />)).not.toThrow();
  });

  it("renders only the generator root without page chrome", () => {
    const { container } = render(<PamphletV2 />);
    const root = container.querySelector(".pamphlet-v2");
    expect(root).toBeInTheDocument();
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.querySelector(".site-activity-bar")).toBeNull();
  });

  it("labels the generator workspace for assistive tech", () => {
    render(<PamphletV2 />);
    expect(screen.getByLabelText("Pamphlet generator")).toBeInTheDocument();
  });
});

describe("PamphletV2.css", () => {
  it("fills the workspace with theme body colors", () => {
    expect(cssSource).toContain("background: var(--site-body-bg)");
    expect(cssSource).toContain("color: var(--site-body-fg)");
    expect(cssSource).toContain("width: 100%");
  });
});

describe("PamphletV2Page.tsx", () => {
  it("composes the global activity bar and generator workspace", () => {
    const { container } = render(<PamphletV2Page />);
    expect(container.querySelector(".pamphlet-v2-page")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Pamphlet actions" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pamphlet generator")).toBeInTheDocument();
  });
});
