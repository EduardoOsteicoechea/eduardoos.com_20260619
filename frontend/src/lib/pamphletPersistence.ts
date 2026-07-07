/**
 * pamphletPersistence.ts — Load and save pamphlet content + layout via the gateway API.
 */
import {
  contentDocumentToDbPayload,
  documentFromDbPayload,
  recalculatePamphletDocument,
  type DbContentPayload,
  type DbFooterPayload,
  type DbHeaderPayload,
  type PamphletContentDocument,
} from "./pamphletContent";
import type { PamphletFontSettings } from "./pamphletFontSettings";
import {
  apiLayoutToLayoutSettings,
  layoutSettingsToApiLayout,
  type PamphletLayoutSettings,
} from "./pamphletLayout";
import {
  fetchPamphletDocumentById,
  fetchPamphletLayout,
  fetchPamphletRegistry,
  savePamphletBundleToCloud,
  type PamphletDocument,
  type SavePamphletBundleResponse,
} from "./pamphlets";
import { isAuthenticated } from "./auth";

export const ACTIVE_PAMPHLET_ID_KEY = "eduardoos-pamphlet-active-id";

export function slugifyPamphletId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `pamphlet-${Date.now()}`;
}

function asHeaderPayload(raw: Record<string, unknown>): DbHeaderPayload {
  return raw as DbHeaderPayload;
}

function asFooterPayload(raw: Record<string, unknown>): DbFooterPayload {
  return raw as DbFooterPayload;
}

function asContentPayload(raw: PamphletDocument["content"]): DbContentPayload {
  return raw as DbContentPayload;
}

/** Loads one pamphlet draft from the cloud into preview editor state. */
export async function loadPamphletBundle(
  pamphletId: string,
  fonts: PamphletFontSettings,
  baseSettings: PamphletLayoutSettings,
): Promise<{
  contentDocument: PamphletContentDocument;
  settings: PamphletLayoutSettings;
}> {
  const [document, layout] = await Promise.all([
    fetchPamphletDocumentById(pamphletId),
    fetchPamphletLayout(pamphletId),
  ]);
  const settings = apiLayoutToLayoutSettings(layout, baseSettings);
  const contentDocument = recalculatePamphletDocument(
    documentFromDbPayload(
      asHeaderPayload(document.header),
      asContentPayload(document.content),
      asFooterPayload(document.footer),
    ),
    settings,
    fonts,
  );
  return { contentDocument, settings };
}

/** Saves preview editor state to the cloud, creating or overwriting one registry entry. */
export async function savePamphletBundle(options: {
  pamphletId: string;
  title: string;
  contentDocument: PamphletContentDocument;
  layoutSettings: PamphletLayoutSettings;
}): Promise<SavePamphletBundleResponse> {
  const payload = contentDocumentToDbPayload(options.contentDocument);
  const document: PamphletDocument = {
    header: payload.header,
    content: payload.content,
    footer: payload.footer,
  };
  const layout = layoutSettingsToApiLayout(options.layoutSettings, options.contentDocument.itemBottomMarginMm);
  console.info("[pamphlet save] local payload summary:", {
    pamphletId: options.pamphletId,
    title: options.title,
    ideaCount: payload.content.ideas.length,
    headerKeys: Object.keys(payload.header),
  });
  const response = await savePamphletBundleToCloud(options.pamphletId, options.title, document, layout);
  persistActivePamphletId(options.pamphletId);
  return response;
}

/** Reads the last opened pamphlet id from browser storage. */
export function readStoredPamphletId(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const id = localStorage.getItem(ACTIVE_PAMPHLET_ID_KEY)?.trim();
  return id || null;
}

/** Remembers which pamphlet draft the editor should reopen. */
export function persistActivePamphletId(pamphletId: string): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(ACTIVE_PAMPHLET_ID_KEY, pamphletId.trim());
}

/** Loads the user's latest or last-opened pamphlet from the API on page start. */
export async function bootstrapPamphletFromCloud(
  fonts: PamphletFontSettings,
  baseSettings: PamphletLayoutSettings,
): Promise<{
  pamphletId: string;
  title: string;
  contentDocument: PamphletContentDocument;
  settings: PamphletLayoutSettings;
} | null> {
  if (!isAuthenticated()) {
    return null;
  }

  const registry = await fetchPamphletRegistry("date");
  const storedId = readStoredPamphletId();
  let pamphletId = "active";
  if (storedId && registry.some((entry) => entry.pamphletId === storedId)) {
    pamphletId = storedId;
  } else if (registry.length > 0) {
    pamphletId = registry[0].pamphletId;
  }

  const bundle = await loadPamphletBundle(pamphletId, fonts, baseSettings);
  persistActivePamphletId(pamphletId);
  const entry = registry.find((item) => item.pamphletId === pamphletId);
  return {
    pamphletId,
    title: entry?.title?.trim() || pamphletId,
    ...bundle,
  };
}
