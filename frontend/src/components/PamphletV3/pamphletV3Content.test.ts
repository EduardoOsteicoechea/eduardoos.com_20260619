import { describe, expect, it } from "vitest";
import contentDistribution, { distributionToContentJson } from "./ContentDistribution";
import {
  buildEmptyPamphletV3Document,
  createPamphletV3Item,
  packItemsIntoZones,
} from "./pamphletV3Content";

describe("pamphletV3 content packing", () => {
  it("builds an empty document with no starter items in any stream", () => {
    const doc = buildEmptyPamphletV3Document();
    expect(doc.headerItems).toHaveLength(0);
    expect(doc.bodyItems).toHaveLength(0);
    expect(doc.footerItems).toHaveLength(0);
  });

  it("flows overflowing body items into the next column", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      createPamphletV3Item("paragraph", {
        text: `Paragraph ${index} with enough words to consume vertical space in a narrow column layout.`,
      }),
    );
    const packed = packItemsIntoZones(many, ["first", "second", "third"], 40, 2, 55);
    expect(packed.first.length).toBeGreaterThan(0);
    expect(packed.second.length).toBeGreaterThan(0);
  });

  it("omits empty items from the content JSON export", () => {
    const doc = buildEmptyPamphletV3Document();
    doc.headerItems = [
      createPamphletV3Item("key_idea", { text: "" }),
      createPamphletV3Item("key_idea", { text: "Title" }),
    ];
    doc.bodyItems = [
      createPamphletV3Item("paragraph", { text: "" }),
      createPamphletV3Item("paragraph", { text: "Body copy" }),
    ];
    doc.footerItems = [createPamphletV3Item("paragraph", { text: "" })];
    const zones = contentDistribution(doc);
    const json = distributionToContentJson(zones);
    expect(json.header).toHaveLength(1);
    expect(json.header[0]?.text).toBe("Title");
    expect(json.body.col_1.some((item) => item.text === "Body copy")).toBe(true);
    expect(json.body.col_1.every((item) => item.text.trim().length > 0)).toBe(true);
    expect(json.footer).toHaveLength(0);
    expect(zones.occupation.columns.first.percent).toBeGreaterThan(0);
  });

  it("moves overflow into the next column using item heights", () => {
    const tall = Array.from({ length: 12 }, (_, index) =>
      createPamphletV3Item("paragraph", {
        text: `Block ${index}`,
        heightMm: 20,
      }),
    );
    const packed = packItemsIntoZones(tall, ["first", "second", "third"], 50, 2, 55);
    expect(packed.first.length).toBeLessThan(12);
    expect(packed.second.length).toBeGreaterThan(0);
  });
});
