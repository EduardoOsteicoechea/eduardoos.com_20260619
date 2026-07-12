import { describe, expect, it } from "vitest";
import { DEFAULT_PAMPHLET_LAYOUT_SETTINGS, computeSheet1Layout } from "./pamphletLayout";
import { DEFAULT_PAMPHLET_FONT_SETTINGS } from "./pamphletFontSettings";
import {
  COLUMN_ZONE_ORDER,
  addContentItemAfter,
  addContentListItem,
  assignBodyContentRefs,
  contentDocumentToDbPayload,
  removeContentListItem,
  resolvePamphletImageUrl,
  updateContentItemListHeader,
  updateContentItemReferences,
  updateContentListItemText,
  buildFakePamphletContentDocument,
  buildEmptyPamphletContentDocument,
  computeVisibleSheetNumbers,
  countPlacedColumnItems,
  distributeContentToZones,
  documentFromDbPayload,
  measureContentItemHeight,
  moveContentItemDown,
  moveContentItemUp,
  recalculateContentHeights,
  removeContentItem,
  resolveActionBarPlacement,
  setContentItemType,
  type PamphletContentDocument,
  type PamphletContentItem,
} from "./pamphletContent";

const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
const fonts = DEFAULT_PAMPHLET_FONT_SETTINGS;
const colWidth = layout.rightColumns.col1WidthMm;
const headerWidth = layout.contentWidthMm / 2 - DEFAULT_PAMPHLET_LAYOUT_SETTINGS.pageLateralInternalMarginMm;

function item(partial: Partial<PamphletContentItem> & Pick<PamphletContentItem, "id" | "type">): PamphletContentItem {
  const base: PamphletContentItem = {
    id: partial.id,
    type: partial.type,
    heightMm: 0,
    text: "",
    highlights: [],
    references: [],
    listItems: [],
    description: "",
    imageUrl: "",
    imageHeightMm: 0,
    contentRef: partial.contentRef ?? partial.id,
  };
  return recalculateContentHeights([{ ...base, ...partial }], () => colWidth, fonts)[0];
}

describe("pamphletContent height measurement", () => {
  it("measures paragraph height from wrapped lines in mm", () => {
    const height = measureContentItemHeight(
      { ...item({ id: "p1", type: "paragraph", text: "Hello world" }), heightMm: 0 },
      colWidth,
      fonts,
    );
    expect(height).toBeGreaterThan(0);
  });

  it("measures list height as sum of list item line heights", () => {
    const list = item({
      id: "l1",
      type: "list",
      listItems: [
        { text: "First item", highlights: [] },
        { text: "Second item", highlights: [] },
      ],
    });
    const single = measureContentItemHeight(
      { ...item({ id: "p1", type: "paragraph", text: "First item" }), heightMm: 0 },
      colWidth,
      fonts,
    );
    expect(measureContentItemHeight({ ...list, heightMm: 0 }, colWidth, fonts)).toBeGreaterThan(single);
  });

  it("defaults image height to 0.75 of container width", () => {
    const image = item({ id: "i1", type: "image", description: "Legend" });
    expect(image.imageHeightMm).toBeCloseTo(colWidth * 0.75, 2);
    expect(measureContentItemHeight({ ...image, heightMm: 0 }, colWidth, fonts)).toBeGreaterThan(image.imageHeightMm);
  });

  it("adds reference line height for quote references", () => {
    const quote = item({
      id: "q1",
      type: "quote",
      text: "Quoted text",
      references: ["John 3:16"],
    });
    const bodyOnly = item({ id: "q2", type: "quote", text: "Quoted text" });
    expect(measureContentItemHeight({ ...quote, heightMm: 0 }, colWidth, fonts)).toBeGreaterThan(
      measureContentItemHeight({ ...bodyOnly, heightMm: 0 }, colWidth, fonts),
    );
  });
});

describe("documentFromDbPayload", () => {
  it("maps header, footer, and content JSON into editable items", () => {
    const doc = documentFromDbPayload(
      {
        heading: "Title",
        subheading: "Subtitle",
        author: "Author",
        date: "2026",
        image: "",
        category: "Faith",
        text: "",
      },
      {
        ideas: [
          {
            heading: "Idea",
            summary: "",
            subideas: [
              { type: "simple_idea", content: "Body one" },
              { type: "list", items: [{ content: "Bullet" }] },
              { type: "image", description: "Pic", image: "img.png", aspect_ratio: 1.2 },
              { type: "quote", content: "Quote", references: ["Ref"] },
            ],
          },
        ],
      },
      {
        heading: "Contact",
        contact_items: [{ type: "Email", value: "a@b.com" }],
        address_data: { message: "At", address: "City" },
        text: "",
      },
    );

    expect(doc.headerItems.length).toBeGreaterThan(0);
    expect(doc.footerItems.length).toBeGreaterThan(0);
    expect(doc.bodyItems.some((entry) => entry.type === "key_idea")).toBe(true);
    expect(doc.bodyItems.some((entry) => entry.type === "paragraph")).toBe(true);
    expect(doc.bodyItems.some((entry) => entry.contentRef.includes("subidea"))).toBe(true);
  });

  it("maps simple_idea subideas to regular paragraphs, not key ideas", () => {
    const doc = documentFromDbPayload(
      { text: "" },
      {
        ideas: [{ subideas: [{ type: "simple_idea", content: "Body one" }] }],
      },
      { text: "" },
    );
    expect(doc.bodyItems.every((entry) => entry.type === "paragraph")).toBe(true);
  });
});

describe("contentDocumentToDbPayload", () => {
  it("round-trips db-shaped content through editable items", () => {
    const sourceHeader = {
      heading: "Title",
      subheading: "Subtitle",
      author: "Author",
      date: "2026",
      image: "",
      category: "Faith",
      text: "",
    };
    const sourceContent = {
      ideas: [
        {
          heading: "Idea",
          summary: "",
          subideas: [
            { type: "simple_idea", content: "Body one" },
            { type: "list", items: [{ content: "Bullet" }] },
            { type: "quote", content: "Quote", references: ["Ref"] },
          ],
        },
      ],
    };
    const sourceFooter = {
      heading: "Contact",
      contact_items: [{ type: "Email", value: "a@b.com" }],
      address_data: { message: "At", address: "City" },
      text: "",
    };

    const editable = documentFromDbPayload(sourceHeader, sourceContent, sourceFooter);
    const payload = contentDocumentToDbPayload(editable);

    expect(payload.header.heading).toBe("Title");
    expect(payload.content.ideas[0]?.heading).toBe("Idea");
    expect(payload.content.ideas[0]?.subideas?.length).toBe(3);
    expect(payload.footer.heading).toBe("Contact");
  });

  it("persists newly added body paragraphs with generated subidea refs", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const firstId = doc.bodyItems[0]?.id ?? "";
    const colWidth = layout.rightColumns.col1WidthMm;
    const withNew = addContentItemAfter(doc.bodyItems, firstId, colWidth, DEFAULT_PAMPHLET_FONT_SETTINGS);
    const payload = contentDocumentToDbPayload({ ...doc, bodyItems: withNew });
    const subideas = payload.content.ideas.flatMap((idea) => idea.subideas ?? []);
    expect(subideas.some((entry) => (entry.content ?? "").includes("New paragraph"))).toBe(true);
  });
});

describe("assignBodyContentRefs", () => {
  it("maps orphan item refs to idea subidea indices", () => {
    const items: PamphletContentItem[] = [
      { id: "a", type: "key_idea", heightMm: 5, text: "Idea", highlights: [], references: [], listItems: [], description: "", imageUrl: "", imageHeightMm: 0, contentRef: "item-a" },
      { id: "b", type: "paragraph", heightMm: 5, text: "Body", highlights: [], references: [], listItems: [], description: "", imageUrl: "", imageHeightMm: 0, contentRef: "item-b" },
    ];
    const assigned = assignBodyContentRefs(items);
    expect(assigned[0]?.contentRef).toBe("0:heading");
    expect(assigned[1]?.contentRef).toBe("0:subidea:0");
  });
});

describe("buildEmptyPamphletContentDocument", () => {
  it("starts with empty header, body, and footer blocks", () => {
    const doc = buildEmptyPamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(doc.headerItems).toHaveLength(1);
    expect(doc.bodyItems).toHaveLength(1);
    expect(doc.footerItems).toHaveLength(1);
    expect(doc.headerItems[0]?.text).toBe("");
    expect(doc.bodyItems[0]?.text).toBe("");
    expect(doc.footerItems[0]?.text).toBe("");
  });
});

describe("computeVisibleSheetNumbers", () => {
  it("returns only sheet 1 for a short empty pamphlet", () => {
    const doc = buildEmptyPamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    expect(computeVisibleSheetNumbers(zones)).toEqual([1]);
  });
});

describe("buildFakePamphletContentDocument", () => {
  it("provides preview-ready fake content aligned with db shape", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(doc.headerItems.length).toBeGreaterThan(0);
    expect(doc.bodyItems.length).toBeGreaterThan(0);
    expect(doc.footerItems.length).toBeGreaterThan(0);
    expect(doc.bodyItems.every((entry) => entry.heightMm > 0)).toBe(true);
  });

  it("does not include legacy Bloque prefixes in generated paragraphs", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(doc.bodyItems.some((entry) => /^Bloque\s+\d+:/i.test(entry.text))).toBe(false);
    expect(doc.bodyItems.some((entry) => /del bloque/i.test(entry.text))).toBe(false);
  });
});

describe("documentFromDbPayload legacy prefixes", () => {
  it("strips Bloque n prefixes when mapping stored subideas", () => {
    const doc = documentFromDbPayload(
      { text: "" },
      {
        ideas: [
          {
            subideas: [{ type: "simple_idea", content: "Bloque 4: Una mis mayores preocupaciones es..." }],
          },
        ],
      },
      { text: "" },
    );
    expect(doc.bodyItems[0]?.text.startsWith("Bloque")).toBe(false);
    expect(doc.bodyItems[0]?.text.startsWith("Una mis")).toBe(true);
  });
});

describe("distributeContentToZones", () => {
  it("places header and footer items before column flow", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const header = zones.find((zone) => zone.zoneId === "header");
    const footer = zones.find((zone) => zone.zoneId === "footer");
    expect(header?.items.length).toBeGreaterThan(0);
    expect(footer?.items.length).toBeGreaterThan(0);
  });

  it("flows overflowing body items into the next column in reading order", () => {
    const manyItems: PamphletContentItem[] = Array.from({ length: 30 }, (_, index) =>
      item({
        id: `b${index}`,
        type: "paragraph",
        text: `Paragraph ${index} with enough words to consume vertical space in the column.`,
      }),
    );
    const doc: PamphletContentDocument = {
      headerItems: [],
      footerItems: [],
      bodyItems: manyItems,
      itemBottomMarginMm: 1,
    };
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const col0 = zones.find((zone) => zone.zoneId === COLUMN_ZONE_ORDER[0]);
    const col1 = zones.find((zone) => zone.zoneId === COLUMN_ZONE_ORDER[1]);
    expect(col0?.items.length).toBeGreaterThan(0);
    expect(col1?.items.length).toBeGreaterThan(0);
  });

  it("fills sheet 2 columns before page 1 left columns", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const s1Right2 = zones.find((zone) => zone.zoneId === "s1r-col1")?.items.length ?? 0;
    const s2Left1 = zones.find((zone) => zone.zoneId === "s2l-col0")?.items.length ?? 0;
    const s1Left1 = zones.find((zone) => zone.zoneId === "s1l-col0")?.items.length ?? 0;
    expect(s1Right2).toBeGreaterThan(0);
    expect(s2Left1).toBeGreaterThan(0);
    expect(s1Left1).toBeGreaterThan(0);
  });

  it("does not render body content beyond the eight flow columns", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const placed = countPlacedColumnItems(
      distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts),
    );
    expect(placed).toBeGreaterThan(0);
    expect(placed).toBeLessThan(doc.bodyItems.length);
  });

  it("skips items taller than an empty column instead of clipping them in place", () => {
    const tall = item({
      id: "tall",
      type: "paragraph",
      text: "Word ".repeat(500),
    });
    const layout = computeSheet1Layout(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    expect(tall.heightMm).toBeGreaterThan(layout.rightColumns.bodyHeightMm);
    const zones = distributeContentToZones(
      { headerItems: [], footerItems: [], bodyItems: [tall], itemBottomMarginMm: 1 },
      DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
      fonts,
    );
    expect(countPlacedColumnItems(zones)).toBe(0);
  });

  it("omits bottom margin on the last item in each parent container", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    for (const zone of zones) {
      if (zone.items.length === 0) {
        continue;
      }
      const last = zone.items[zone.items.length - 1];
      expect(last.bottomMarginMm).toBe(0);
      if (zone.items.length > 1) {
        expect(zone.items[0].bottomMarginMm).toBeGreaterThan(0);
      }
    }
  });

  it("recalculates placement when item text changes", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const before = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const col0Before = before.find((zone) => zone.zoneId === COLUMN_ZONE_ORDER[0])?.items.length ?? 0;

    doc.bodyItems[0] = {
      ...doc.bodyItems[0],
      text: `${doc.bodyItems[0].text} `.repeat(40),
    };
    doc.bodyItems = recalculateContentHeights(doc.bodyItems, () => colWidth, fonts);
    const after = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const col0After = after.find((zone) => zone.zoneId === COLUMN_ZONE_ORDER[0])?.items.length ?? 0;
    expect(col0After).toBeLessThanOrEqual(col0Before + 1);
  });
});

describe("content item mutations", () => {
  it("adds a default paragraph below an item", () => {
    const items = [item({ id: "a", type: "paragraph", text: "One" })];
    const next = addContentItemAfter(items, "a", colWidth, fonts);
    expect(next).toHaveLength(2);
    expect(next[1].type).toBe("paragraph");
    expect(next[1].heightMm).toBeGreaterThan(0);
  });

  it("moves items up and down within the stream", () => {
    const items = [
      item({ id: "a", type: "paragraph", text: "A" }),
      item({ id: "b", type: "paragraph", text: "B" }),
    ];
    expect(moveContentItemDown(items, "a").map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(moveContentItemUp(items, "b").map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(moveContentItemUp(items, "a")).toEqual(items);
  });

  it("removes an item by id", () => {
    const items = [
      item({ id: "a", type: "paragraph", text: "A" }),
      item({ id: "b", type: "paragraph", text: "B" }),
    ];
    expect(removeContentItem(items, "a")).toHaveLength(1);
  });

  it("changes item type and recalculates height", () => {
    const items = [item({ id: "a", type: "paragraph", text: "Text" })];
    const next = setContentItemType(items, "a", "image", colWidth, fonts);
    expect(next[0].type).toBe("image");
    expect(next[0].imageHeightMm).toBeCloseTo(colWidth * 0.75, 2);
  });
});

describe("resolveActionBarPlacement", () => {
  it("prefers above when only top space fits the toolbar", () => {
    expect(resolveActionBarPlacement(200, 760, 35, 72, 800)).toBe("top");
  });

  it("prefers below when only bottom space fits the toolbar", () => {
    expect(resolveActionBarPlacement(80, 120, 35, 72, 800)).toBe("bottom");
  });
});

describe("zone widths", () => {
  it("uses header and footer half-width containers", () => {
    const doc = buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
    const zones = distributeContentToZones(doc, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    const header = zones.find((zone) => zone.zoneId === "header");
    expect(header?.widthMm).toBeCloseTo(headerWidth, 1);
  });
});

describe("typed content updates", () => {
  function baseDocument(): PamphletContentDocument {
    return {
      headerItems: [],
      footerItems: [],
      bodyItems: recalculateContentHeights(
        [
          {
            id: "quote-1",
            type: "quote",
            heightMm: 0,
            text: "Quoted text",
            highlights: [],
            references: [],
            listItems: [],
            description: "",
            imageUrl: "",
            imageHeightMm: 0,
            contentRef: "0:subidea:0",
          },
          {
            id: "list-1",
            type: "list",
            heightMm: 0,
            text: "",
            highlights: [],
            references: [],
            listItems: [{ text: "First", highlights: [] }],
            description: "",
            imageUrl: "",
            imageHeightMm: 0,
            contentRef: "0:subidea:1",
          },
        ],
        () => colWidth,
        fonts,
      ),
      itemBottomMarginMm: 1,
    };
  }

  it("resolves pamphlet image keys to gateway URLs", () => {
    expect(resolvePamphletImageUrl("media/pamphlets/content-images/user/active/0-subidea-1.png")).toBe(
      "/api/pamphlets/images/media/pamphlets/content-images/user/active/0-subidea-1.png",
    );
  });

  it("upgrades legacy pamphlets/ image keys", () => {
    expect(resolvePamphletImageUrl("pamphlets/content-images/user/active/0-subidea-1.png")).toBe(
      "/api/pamphlets/images/media/pamphlets/content-images/user/active/0-subidea-1.png",
    );
  });

  it("resolves legacy images/ paths when user scope is available", () => {
    expect(
      resolvePamphletImageUrl("images/0-subidea-7.png", {
        userEmail: "user@example.com",
        pamphletId: "active",
      }),
    ).toBe("/api/pamphlets/images/media/pamphlets/content-images/user%40example.com/active/0-subidea-7.png");
  });

  it("rewrites broken gateway legacy image URLs", () => {
    expect(
      resolvePamphletImageUrl("/api/pamphlets/images/images%2F0-subidea-7.png", {
        userEmail: "user@example.com",
        pamphletId: "my-pamphlet",
      }),
    ).toBe("/api/pamphlets/images/media/pamphlets/content-images/user%40example.com/my-pamphlet/0-subidea-7.png");
  });

  it("updates quote references, list header, and list items", () => {
    let doc = baseDocument();
    doc = updateContentItemReferences(doc, "quote-1", ["Romanos 12:2"], DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    doc = updateContentItemListHeader(doc, "list-1", "Daily habits", DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    doc = updateContentListItemText(doc, "list-1", 0, "Read Scripture", DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    doc = addContentListItem(doc, "list-1", DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);
    doc = removeContentListItem(doc, "list-1", 1, DEFAULT_PAMPHLET_LAYOUT_SETTINGS, fonts);

    expect(doc.bodyItems[0]?.references).toEqual(["Romanos 12:2"]);
    expect(doc.bodyItems[1]?.text).toBe("Daily habits");
    expect(doc.bodyItems[1]?.listItems).toHaveLength(1);
    expect(doc.bodyItems[1]?.listItems[0]?.text).toBe("Read Scripture");
  });

  it("persists list header in DB payload", () => {
    const doc = updateContentItemListHeader(
      baseDocument(),
      "list-1",
      "Header",
      DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
      fonts,
    );
    const payload = contentDocumentToDbPayload(doc);
    expect(payload.content.ideas[0]?.subideas?.[1]?.content).toBe("Header");
  });
});
