import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAMPHLET_LAYOUT_SETTINGS } from "./pamphletLayout";
import { DEFAULT_PAMPHLET_FONT_SETTINGS } from "./pamphletFontSettings";
import {
  ACTIVE_PAMPHLET_ID_KEY,
  bootstrapPamphletFromCloud,
  persistActivePamphletId,
  readStoredPamphletId,
  slugifyPamphletId,
} from "./pamphletPersistence";

vi.mock("./auth", () => ({
  getAuthToken: vi.fn(),
}));

vi.mock("./pamphlets", () => ({
  fetchPamphletRegistry: vi.fn(),
  fetchPamphletDocumentById: vi.fn(),
  fetchPamphletLayout: vi.fn(),
  savePamphletDocument: vi.fn(),
  savePamphletLayout: vi.fn(),
}));

import { getAuthToken } from "./auth";
import { fetchPamphletDocumentById, fetchPamphletLayout, fetchPamphletRegistry } from "./pamphlets";

describe("slugifyPamphletId", () => {
  it("creates a stable slug from a title", () => {
    expect(slugifyPamphletId("My First Pamphlet")).toBe("my-first-pamphlet");
  });

  it("falls back to a generated id when the title is empty", () => {
    expect(slugifyPamphletId("   ")).toMatch(/^pamphlet-\d+$/);
  });
});

describe("pamphlet active id storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and reads the active pamphlet id", () => {
    persistActivePamphletId("my-draft");
    expect(readStoredPamphletId()).toBe("my-draft");
    expect(localStorage.getItem(ACTIVE_PAMPHLET_ID_KEY)).toBe("my-draft");
  });
});

describe("bootstrapPamphletFromCloud", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getAuthToken).mockReset();
    vi.mocked(fetchPamphletRegistry).mockReset();
    vi.mocked(fetchPamphletDocumentById).mockReset();
    vi.mocked(fetchPamphletLayout).mockReset();
  });

  it("returns null when the user is not authenticated", async () => {
    vi.mocked(getAuthToken).mockReturnValue("");
    await expect(
      bootstrapPamphletFromCloud(DEFAULT_PAMPHLET_FONT_SETTINGS, DEFAULT_PAMPHLET_LAYOUT_SETTINGS),
    ).resolves.toBeNull();
  });

  it("loads the stored registry pamphlet when authenticated", async () => {
    vi.mocked(getAuthToken).mockReturnValue("jwt-token");
    persistActivePamphletId("draft-a");
    vi.mocked(fetchPamphletRegistry).mockResolvedValue([
      { pamphletId: "draft-b", title: "Draft B" },
      { pamphletId: "draft-a", title: "Draft A" },
    ]);
    vi.mocked(fetchPamphletDocumentById).mockResolvedValue({
      header: { heading: "Title" },
      content: { ideas: [] },
      footer: { text: "" },
    });
    vi.mocked(fetchPamphletLayout).mockResolvedValue({
      marginLateral: 10,
      marginVertical: 10,
      midMargin: 5,
      colSep: 4,
      hfGap: 5,
      fontSize: 10,
      lineHeight: 1.2,
      paragraphSep: 1,
      headingBottomMargin: 5,
    });

    const boot = await bootstrapPamphletFromCloud(
      DEFAULT_PAMPHLET_FONT_SETTINGS,
      DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
    );

    expect(boot?.pamphletId).toBe("draft-a");
    expect(boot?.title).toBe("Draft A");
    expect(fetchPamphletDocumentById).toHaveBeenCalledWith("draft-a");
  });
});
