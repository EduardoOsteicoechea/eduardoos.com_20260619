import { describe, expect, it } from "vitest";
import contentDistribution, { distributionToContentJson } from "./ContentDistribution";
import {
  buildEmptyPamphletV3Document,
  createPamphletV3Item,
  packItemsIntoZones,
  PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES,
  zoneHasRoomForAddControl,
} from "./pamphletV3Content";

describe("pamphletV3 content packing", () => {
  it("builds an empty document with no starter items in any stream", () => {
    const doc = buildEmptyPamphletV3Document();
    expect(doc.headerItems).toHaveLength(0);
    expect(doc.bodyItems).toHaveLength(0);
    expect(doc.footerItems).toHaveLength(0);
    expect(doc.itemGapMm).toBe(0);
  });

  it("flows overflowing body items into the next column", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      createPamphletV3Item("paragraph", {
        text: `Paragraph ${index} with enough words to consume vertical space in a narrow column layout.`,
      }),
    );
    const packed = packItemsIntoZones(
      many,
      [
        { id: "first", capacityMm: 40 },
        { id: "second", capacityMm: 40 },
        { id: "third", capacityMm: 40 },
      ],
      0,
      55,
    );
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
    expect(json.header.items).toHaveLength(1);
    expect(json.header.items[0]?.text).toBe("Title");
    expect(json.body.col_1.items.some((item) => item.text === "Body copy")).toBe(true);
    expect(json.body.col_1.items.every((item) => item.text.trim().length > 0)).toBe(true);
    expect(typeof json.body.col_1.occupationPercent).toBe("number");
    expect(json.footer.items).toHaveLength(0);
    expect(zones.occupation.columns.first.percent).toBeGreaterThan(0);
  });

  it("moves overflow into the next column using item heights", () => {
    const tall = Array.from({ length: 12 }, (_, index) =>
      createPamphletV3Item("paragraph", {
        text: `Block ${index}`,
        heightMm: 20,
      }),
    );
    const packed = packItemsIntoZones(
      tall,
      [
        { id: "first", capacityMm: 50 },
        { id: "second", capacityMm: 50 },
        { id: "third", capacityMm: 50 },
      ],
      0,
      55,
    );
    expect(packed.first.length).toBeLessThan(12);
    expect(packed.second.length).toBeGreaterThan(0);
  });

  it("uses taller default capacity for inner columns than front columns", () => {
    expect(PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES.third).toBeGreaterThan(
      PAMPHLET_V3_DEFAULT_COLUMN_CAPACITIES.first,
    );
  });

  it("packs more items into a taller measured column capacity", () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      createPamphletV3Item("paragraph", {
        text: `Line ${index}`,
        heightMm: 10,
      }),
    );
    const shortCol = packItemsIntoZones(items, [{ id: "first", capacityMm: 50 }], 0, 55);
    const tallCol = packItemsIntoZones(items, [{ id: "first", capacityMm: 120 }], 0, 55);
    expect(tallCol.first.length).toBeGreaterThan(shortCol.first.length);
  });

  it("includes top margin in estimated item height", () => {
    const item = createPamphletV3Item("paragraph", { text: "Hi" });
    expect(item.heightMm).toBeGreaterThan(2);
  });

  it("hides add-room once leftover space is below the threshold", () => {
    expect(zoneHasRoomForAddControl(90, 100, 8)).toBe(true);
    expect(zoneHasRoomForAddControl(95, 100, 8)).toBe(false);
  });
});
