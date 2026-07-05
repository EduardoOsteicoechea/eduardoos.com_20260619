import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAMPHLET_LAYOUT_SETTINGS } from "../../lib/pamphletLayout";
import { buildFakePamphletContentDocument } from "../../lib/pamphletContent";
import { DEFAULT_PAMPHLET_FONT_SETTINGS } from "../../lib/pamphletFontSettings";
import PamphletV2 from "./PamphletV2";
import PamphletV2Page from "./PamphletV2Page";

const contentDocument = buildFakePamphletContentDocument(
  DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
  DEFAULT_PAMPHLET_FONT_SETTINGS,
);

const previewProps = {
  contentDocument,
  fontSettings: DEFAULT_PAMPHLET_FONT_SETTINGS,
  selectedItemId: null,
  actionPlacement: "top" as const,
  contentHandlers: {
    onSelectItem: () => {},
    onSetType: () => {},
    onAddBelow: () => {},
    onMoveUp: () => {},
    onMoveDown: () => {},
    onRemove: () => {},
    onBold: () => {},
    onIncreaseImageHeight: () => {},
    onDecreaseImageHeight: () => {},
    onTextChange: () => {},
    onImageUpload: () => {},
    onImageReferenceChange: () => {},
    onQuoteReferenceChange: () => {},
    onListHeaderChange: () => {},
    onListItemChange: () => {},
    onAddListItem: () => {},
    onRemoveListItem: () => {},
  },
  imageUploadingItemId: null,
  imageUploadError: "",
  viewMode: "preview" as const,
  previewMode: null,
  zoomScale: 1,
  pan: { x: 0, y: 0 },
  onZoomIn: () => {},
  onZoomOut: () => {},
  onPanChange: () => {},
  onExitPreviewMode: () => {},
} as const;

const componentDir = path.dirname(fileURLToPath(import.meta.url));
const printCss = readFileSync(path.join(componentDir, "pamphlet-print.css"), "utf8");

describe("PamphletV2.tsx", () => {
  it("exports a default generator workspace component", () => {
    expect(typeof PamphletV2).toBe("function");
    expect(() => render(<PamphletV2 settings={DEFAULT_PAMPHLET_LAYOUT_SETTINGS} {...previewProps} />)).not.toThrow();
  });

  it("renders generator chrome without site header or activity bar", () => {
    const { container } = render(<PamphletV2 settings={DEFAULT_PAMPHLET_LAYOUT_SETTINGS} {...previewProps} />);
    expect(container.querySelector(".pamphlet-v2")).toBeInTheDocument();
    expect(container.querySelector(".site-header")).toBeNull();
    expect(container.querySelector(".site-activity-bar")).toBeNull();
  });

  it("renders page 1 and inner sheet previews with content items", () => {
    const { container } = render(<PamphletV2 settings={DEFAULT_PAMPHLET_LAYOUT_SETTINGS} {...previewProps} />);
    expect(container.querySelector("#sheet1")).toBeInTheDocument();
    expect(container.querySelector("#sheet2")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-testid='pamphlet-content-item']").length).toBeGreaterThan(0);
  });

  it("labels the generator workspace for assistive tech", () => {
    render(<PamphletV2 settings={DEFAULT_PAMPHLET_LAYOUT_SETTINGS} {...previewProps} />);
    expect(screen.getByLabelText("Pamphlet generator")).toBeInTheDocument();
  });

  it("renders immersive mode as a vertical stack", () => {
    const { container } = render(
      <PamphletV2 settings={DEFAULT_PAMPHLET_LAYOUT_SETTINGS} {...previewProps} viewMode="immersive" />,
    );
    expect(container.querySelector(".pamphlet-immersive")).toBeInTheDocument();
    expect(container.querySelector("#sheet1")).toBeNull();
  });
});

describe("pamphlet-print.css", () => {
  it("defines exact US Letter landscape dimensions on pamphlet-sheet", () => {
    expect(printCss).toContain("--pamphlet-sheet-w: 279.4mm");
    expect(printCss).toContain("--pamphlet-sheet-h: 215.9mm");
    expect(printCss).toContain("aspect-ratio: 279.4 / 215.9");
    expect(printCss).toContain("box-sizing: border-box");
  });

  it("uses mm margin variables and theme-aware preview zones", () => {
    expect(printCss).toContain("--pamphlet-margin-top");
    expect(printCss).toContain(".pamphlet-sheet__zone--header");
    expect(printCss).toContain("background: transparent");
  });

  it("implements robust @media print rules", () => {
    expect(printCss).toContain("@page");
    expect(printCss).toContain("size: 279.4mm 215.9mm");
    expect(printCss).toContain("page-break-after: always");
    expect(printCss).toContain("print-color-adjust: exact");
    expect(printCss).toContain(".pamphlet-no-print");
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
