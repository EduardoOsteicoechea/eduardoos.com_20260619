/**
 * pamphletV3Persistence.ts — Save/load Pamphlet V3 documents via the gateway API.
 *
 * Stores a lossless JSON snapshot of PamphletV3Document inside the existing
 * header/content/footer Dynamo document shape (marked with schema category).
 */
import {
  buildEmptyPamphletV3Document,
  recalculateItemHeights,
  PAMPHLET_V3_COLUMN_WIDTH_MM,
  PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM,
  type PamphletV3ContentItem,
  type PamphletV3Document,
  type PamphletV3ItemType,
} from "../components/PamphletV3/pamphletV3Content";
import { isAuthenticated } from "./auth";
import {
  ACTIVE_PAMPHLET_ID_KEY,
  persistActivePamphletId,
  readStoredPamphletId,
} from "./pamphletPersistence";
import {
  DEFAULT_LAYOUT,
  fetchPamphletDocumentById,
  fetchPamphletRegistry,
  savePamphletBundleToCloud,
  type PamphletDocument,
  type SavePamphletBundleResponse,
} from "./pamphlets";

/** Marker stored in header.category / idea.heading so load can detect V3 payloads. */
export const PAMPHLET_V3_SCHEMA = "eduardoos-pamphlet-v3";

/** Default registry id for the live V3 editor draft. */
export const PAMPHLET_V3_DEFAULT_ID = "v3-active";

const ITEM_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "key_idea",
  "list",
  "image",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeItem(raw: unknown, index: number): PamphletV3ContentItem | null {
  if (!isRecord(raw)) {
    return null;
  }
  const type = typeof raw.type === "string" && ITEM_TYPES.has(raw.type) ? (raw.type as PamphletV3ItemType) : "paragraph";
  const listItems = Array.isArray(raw.listItems)
    ? raw.listItems
        .filter(isRecord)
        .map((row, rowIndex) => ({
          id: typeof row.id === "string" && row.id ? row.id : `li-${index}-${rowIndex}`,
          text: typeof row.text === "string" ? row.text : "",
        }))
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `item-${index}`,
    type,
    text: typeof raw.text === "string" ? raw.text : "",
    heightMm: typeof raw.heightMm === "number" ? raw.heightMm : 0,
    listItems,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
    description: typeof raw.description === "string" ? raw.description : "",
    imageHeightMm: typeof raw.imageHeightMm === "number" ? raw.imageHeightMm : 0,
  };
}

/** Recalculates stream heights after a cloud round-trip. */
export function normalizePamphletV3Document(raw: unknown): PamphletV3Document {
  if (!isRecord(raw)) {
    return buildEmptyPamphletV3Document();
  }
  const headerItems = Array.isArray(raw.headerItems)
    ? raw.headerItems.map(normalizeItem).filter((item): item is PamphletV3ContentItem => item !== null)
    : [];
  const bodyItems = Array.isArray(raw.bodyItems)
    ? raw.bodyItems.map(normalizeItem).filter((item): item is PamphletV3ContentItem => item !== null)
    : [];
  const footerItems = Array.isArray(raw.footerItems)
    ? raw.footerItems.map(normalizeItem).filter((item): item is PamphletV3ContentItem => item !== null)
    : [];
  const itemGapMm = typeof raw.itemGapMm === "number" ? raw.itemGapMm : 0;
  return {
    headerItems: recalculateItemHeights(headerItems, PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM, "header"),
    bodyItems: recalculateItemHeights(bodyItems, PAMPHLET_V3_COLUMN_WIDTH_MM, "body"),
    footerItems:
      footerItems.length > 0
        ? recalculateItemHeights(footerItems, PAMPHLET_V3_HEADER_FOOTER_WIDTH_MM, "footer")
        : buildEmptyPamphletV3Document().footerItems,
    itemGapMm,
  };
}

/** Embeds a V3 document into the shared pamphlet DB document shape. */
export function pamphletV3DocumentToDb(document: PamphletV3Document): PamphletDocument {
  return {
    header: {
      heading: "",
      subheading: "",
      author: "",
      date: "",
      image: "",
      category: PAMPHLET_V3_SCHEMA,
      text: "",
    },
    content: {
      ideas: [
        {
          heading: PAMPHLET_V3_SCHEMA,
          heading_highlights: [],
          summary: "",
          subideas: [
            {
              type: "simple_idea",
              content: JSON.stringify(document),
              highlights: [],
              references: [],
              items: [],
              description: "",
              image: "",
              aspect_ratio: 0,
            },
          ],
        },
      ],
    },
    footer: {
      heading: "",
      contact_items: [],
      address_data: { message: "", address: "" },
      text: "",
    },
  };
}

/** Extracts a V3 document from a DB payload, or null when the draft is not V3. */
export function pamphletV3DocumentFromDb(raw: PamphletDocument): PamphletV3Document | null {
  const category = typeof raw.header?.category === "string" ? raw.header.category : "";
  const ideas = Array.isArray(raw.content?.ideas) ? raw.content.ideas : [];
  const firstIdea = isRecord(ideas[0]) ? ideas[0] : null;
  const ideaHeading = firstIdea && typeof firstIdea.heading === "string" ? firstIdea.heading : "";
  if (category !== PAMPHLET_V3_SCHEMA && ideaHeading !== PAMPHLET_V3_SCHEMA) {
    return null;
  }
  const subideas = firstIdea && Array.isArray(firstIdea.subideas) ? firstIdea.subideas : [];
  const firstSub = isRecord(subideas[0]) ? subideas[0] : null;
  const payload = firstSub && typeof firstSub.content === "string" ? firstSub.content : "";
  if (!payload) {
    return null;
  }
  try {
    return normalizePamphletV3Document(JSON.parse(payload) as unknown);
  } catch {
    return null;
  }
}

/** Title shown in the registry — prefers the header band text. */
export function pamphletV3TitleFromDocument(document: PamphletV3Document): string {
  const header = document.headerItems.find((item) => item.text.trim().length > 0);
  if (header) {
    return header.text.replace(/<[^>]+>/g, "").trim().slice(0, 80) || "Pamphlet";
  }
  return "Pamphlet";
}

/** Loads one V3 draft from the cloud. */
export async function loadPamphletV3Document(pamphletId: string): Promise<PamphletV3Document | null> {
  const raw = await fetchPamphletDocumentById(pamphletId);
  return pamphletV3DocumentFromDb(raw);
}

/** Saves the current V3 editor state to the cloud registry. */
export async function savePamphletV3Bundle(options: {
  pamphletId: string;
  document: PamphletV3Document;
  title?: string;
}): Promise<SavePamphletBundleResponse> {
  const title = options.title?.trim() || pamphletV3TitleFromDocument(options.document);
  const response = await savePamphletBundleToCloud(
    options.pamphletId,
    title,
    pamphletV3DocumentToDb(options.document),
    {
      ...DEFAULT_LAYOUT,
      paragraphSep: options.document.itemGapMm,
      colSep: 4,
      hfGap: 2.5,
    },
  );
  persistActivePamphletId(options.pamphletId);
  return response;
}

/** Loads the user's last-opened or newest V3-capable draft on page start. */
export async function bootstrapPamphletV3FromCloud(): Promise<{
  pamphletId: string;
  title: string;
  document: PamphletV3Document;
} | null> {
  if (!isAuthenticated()) {
    return null;
  }

  const registry = await fetchPamphletRegistry("date");
  const storedId = readStoredPamphletId();
  const candidates: string[] = [];
  if (storedId) {
    candidates.push(storedId);
  }
  candidates.push(PAMPHLET_V3_DEFAULT_ID);
  for (const entry of registry) {
    if (!candidates.includes(entry.pamphletId)) {
      candidates.push(entry.pamphletId);
    }
  }

  for (const pamphletId of candidates) {
    try {
      const document = await loadPamphletV3Document(pamphletId);
      if (!document) {
        continue;
      }
      persistActivePamphletId(pamphletId);
      const entry = registry.find((item) => item.pamphletId === pamphletId);
      return {
        pamphletId,
        title: entry?.title?.trim() || pamphletV3TitleFromDocument(document),
        document,
      };
    } catch {
      // Try the next candidate (missing draft / wrong shape).
    }
  }

  // No V3 draft yet — start from empty and keep the default id for first save.
  persistActivePamphletId(PAMPHLET_V3_DEFAULT_ID);
  return {
    pamphletId: PAMPHLET_V3_DEFAULT_ID,
    title: "Pamphlet",
    document: buildEmptyPamphletV3Document(),
  };
}

/** Re-export storage key helper so callers can clear V3 draft pointers if needed. */
export { ACTIVE_PAMPHLET_ID_KEY, persistActivePamphletId, readStoredPamphletId };
