/**
 * EPAM (pamphlet document) client against Next /api/epams.
 * Exposes production-shaped helpers used by pamphlet-generator
 * (`fetchEpams` / `fetchEpam` / `saveEpamToCloud`) plus a thin list/create shell API.
 */

import { EPAM_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import {
  createEmptyPamphlet,
  type PamphletStructure,
} from "./pamphlet-generator/src/pamphlet_schema";

export type EpamRecord = {
  userId: string;
  epamId: string;
  fileName?: string;
  title: string;
  series?: string;
  seriesChapter?: string;
  author?: string;
  date?: string;
  s3Key?: string;
  contentSizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  lastCorrelationId?: string;
  body?: Record<string, unknown>;
};

/** Legacy shell shape used by the former PamphletPage React UI. */
export type EpamDoc = {
  id: string;
  userId?: string;
  title: string;
  updatedAt?: string;
  body?: Record<string, unknown>;
};

export type EpamsListResponse = {
  count: number;
  epams: EpamRecord[];
};

export type EpamDocumentResponse = {
  meta: EpamRecord;
  document: PamphletStructure;
};

type ListWire = {
  count?: number;
  epams?: EpamRecord[];
  items?: EpamRecord[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to manage pamphlets.");
  return token;
}

function asEpamDoc(rec: EpamRecord): EpamDoc {
  return {
    id: rec.epamId,
    userId: rec.userId,
    title: rec.title || rec.fileName || rec.epamId,
    updatedAt: rec.updatedAt,
    body: rec.body,
  };
}

function titleFromDocument(doc: PamphletStructure): string {
  const headerTitle = doc.header?.title?.trim();
  if (headerTitle) return headerTitle;
  if (doc.id?.trim()) return doc.id.trim();
  return "Untitled pamphlet";
}

/** Production-compatible list used by pamphlet-generator cloud open. */
export async function fetchEpams(): Promise<EpamsListResponse> {
  const result = await apiRequest<ListWire>(EPAM_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  const epams = result.data?.epams ?? result.data?.items ?? [];
  return {
    count: result.data?.count ?? epams.length,
    epams,
  };
}

/** Production-compatible get: `{ meta, document }`. */
export async function fetchEpam(epamId: string): Promise<EpamDocumentResponse> {
  const result = await apiRequest<EpamDocumentResponse | EpamRecord>(EPAM_ROUTES.item(epamId), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  const data = result.data;
  if (!data) throw new Error("Empty epam response");

  if ("meta" in data && "document" in data && data.meta && data.document) {
    return data as EpamDocumentResponse;
  }

  const rec = data as EpamRecord;
  if (!rec.epamId) throw new Error("Empty epam response");
  return {
    meta: rec,
    document: (rec.body ?? createEmptyDocumentShell(rec.epamId)) as PamphletStructure,
  };
}

function createEmptyDocumentShell(id: string): PamphletStructure {
  const doc = createEmptyPamphlet({
    title: "",
    author: "",
    series: "",
    series_chapter: "",
  });
  return { ...doc, id };
}

/** Production-compatible save: POST create or PUT update with pamphlet document body. */
export async function saveEpamToCloud(payload: {
  epamId?: string;
  fileName?: string;
  document: PamphletStructure;
}): Promise<EpamDocumentResponse> {
  const updateId = payload.epamId?.trim();
  const epamId = updateId || payload.document.id?.trim();
  const path = updateId ? EPAM_ROUTES.item(updateId) : EPAM_ROUTES.save;
  const method = updateId ? "PUT" : "POST";
  const result = await apiRequest<EpamDocumentResponse>(path, {
    method,
    body: {
      epamId: epamId || undefined,
      fileName: payload.fileName,
      document: payload.document,
      title: titleFromDocument(payload.document),
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.document || !result.data?.meta) {
    throw new Error("Empty epam save response");
  }
  return result.data;
}

/** Thin shell helpers (kept for any residual React EPAM UI). */
export async function listEpams(): Promise<EpamDoc[]> {
  const { epams } = await fetchEpams();
  return epams.map(asEpamDoc);
}

export async function createEpam(
  title: string,
  body?: Record<string, unknown>,
): Promise<EpamDoc> {
  const result = await apiRequest<EpamRecord | EpamDocumentResponse>(EPAM_ROUTES.save, {
    method: "POST",
    body: {
      title: title.trim() || "Untitled pamphlet",
      body: body ?? {
        version: 1,
        blocks: [{ type: "paragraph", text: "New pamphlet document." }],
      },
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  const data = result.data;
  if (!data) throw new Error("Empty EPAM create response");
  if ("meta" in data && data.meta?.epamId) return asEpamDoc(data.meta);
  const rec = data as EpamRecord;
  if (!rec.epamId) throw new Error("Empty EPAM create response");
  return asEpamDoc(rec);
}

export async function getEpam(id: string): Promise<EpamDoc> {
  const loaded = await fetchEpam(id);
  return {
    id: loaded.meta.epamId,
    userId: loaded.meta.userId,
    title: loaded.meta.title,
    updatedAt: loaded.meta.updatedAt,
    body: loaded.document as unknown as Record<string, unknown>,
  };
}

export async function updateEpam(
  id: string,
  payload: { title?: string; body?: Record<string, unknown> },
): Promise<EpamDoc> {
  const result = await apiRequest<EpamRecord | EpamDocumentResponse>(EPAM_ROUTES.item(id), {
    method: "PUT",
    body: payload,
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  const data = result.data;
  if (!data) throw new Error("Empty EPAM update response");
  if ("meta" in data && data.meta?.epamId) return asEpamDoc(data.meta);
  const rec = data as EpamRecord;
  if (!rec.epamId) throw new Error("Empty EPAM update response");
  return asEpamDoc(rec);
}
