import { describe, expect, it } from "vitest";
import {
  buildEmptyPamphletV3Document,
  createPamphletV3Item,
} from "../components/PamphletV3/pamphletV3Content";
import {
  PAMPHLET_V3_SCHEMA,
  pamphletV3DocumentFromDb,
  pamphletV3DocumentToDb,
  pamphletV3TitleFromDocument,
} from "./pamphletV3Persistence";

describe("pamphletV3Persistence", () => {
  it("round-trips a V3 document through the DB payload shape", () => {
    const doc = buildEmptyPamphletV3Document();
    doc.headerItems = [createPamphletV3Item("paragraph", { text: "Cover title" })];
    doc.bodyItems = [
      createPamphletV3Item("heading", { text: "Section" }),
      createPamphletV3Item("paragraph", { text: "Body copy" }),
    ];

    const raw = pamphletV3DocumentToDb(doc);
    expect(raw.header.category).toBe(PAMPHLET_V3_SCHEMA);
    expect(raw.content.ideas[0]).toMatchObject({ heading: PAMPHLET_V3_SCHEMA });

    const restored = pamphletV3DocumentFromDb(raw);
    expect(restored).not.toBeNull();
    expect(restored?.headerItems[0]?.text).toBe("Cover title");
    expect(restored?.bodyItems.map((item) => item.type)).toEqual(["heading", "paragraph"]);
    expect(restored?.bodyItems[1]?.text).toBe("Body copy");
    expect(restored?.footerItems).toHaveLength(3);
  });

  it("returns null for non-V3 documents", () => {
    expect(
      pamphletV3DocumentFromDb({
        header: { category: "other" },
        content: { ideas: [] },
        footer: {},
      }),
    ).toBeNull();
  });

  it("derives a title from the header band", () => {
    const doc = buildEmptyPamphletV3Document();
    doc.headerItems = [createPamphletV3Item("paragraph", { text: "  My Title  " })];
    expect(pamphletV3TitleFromDocument(doc)).toBe("My Title");
  });
});
