/**
 * pamphlets.ts — Authenticated API client for the Go pamphlet document engine.
 */

import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./telemetry";

export interface HighlightRange {
  start: number;
  end: number;
}

export interface PamphletDocument {
  header: Record<string, unknown>;
  content: { ideas: unknown[] };
  footer: Record<string, unknown>;
}

export interface LayoutFields {
  marginLateral: number;
  marginVertical: number;
  midMargin: number;
  colSep: number;
  hfGap: number;
  fontSize: number;
  lineHeight: number;
  paragraphSep: number;
  headingBottomMargin: number;
}

export interface CapacityTelemetry {
  characters: number;
  content_length: number;
  overflow_characters: number;
  overflow_words: number;
  columns?: number[];
  readout?: string;
  readout_html: string;
  warning: string;
  column_summary?: string;
}

export const DEFAULT_LAYOUT: LayoutFields = {
  marginLateral: 10,
  marginVertical: 10,
  midMargin: 25,
  colSep: 4,
  hfGap: 5,
  fontSize: 10,
  lineHeight: 1.2,
  paragraphSep: 1,
  headingBottomMargin: 5,
};

export const PAMPHLET_ROUTES = {
  document: "/api/pamphlets/document",
  reset: "/api/pamphlets/reset",
  previewSheets: "/api/pamphlets/preview-sheets",
  capacity: "/api/pamphlets/capacity",
  content: "/api/pamphlets/content",
  images: "/api/pamphlets/images",
  registry: "/api/pamphlets/registry",
  layout: "/api/pamphlets/layout",
} as const;

export interface PamphletRegistryItem {
  pamphletId: string;
  title: string;
  updatedAt?: string;
  layout?: LayoutFields;
}

function layoutQuery(layout: LayoutFields): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(layout)) {
    params.set(key, String(value));
  }
  return params.toString();
}

function authOptions(correlationId: string) {
  const token = getAuthToken();
  return {
    correlationId,
    authToken: token ?? undefined,
  };
}

/** Loads the user's pamphlet JSON document. */
export async function fetchPamphletDocument(): Promise<PamphletDocument> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<PamphletDocument>(PAMPHLET_ROUTES.document, authOptions(correlationId));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as PamphletDocument;
}

/** Fetches rendered sheet HTML for the current layout + document. */
export async function fetchPreviewSheets(layout: LayoutFields): Promise<string> {
  const correlationId = createCorrelationId();
  const path = `${PAMPHLET_ROUTES.previewSheets}?${layoutQuery(layout)}`;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "X-Correlation-ID": correlationId,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { headers });
  if (!response.ok) {
    throw new Error(`Preview failed (${response.status})`);
  }
  return response.text();
}

/** Fetches capacity telemetry for sidebar readout. */
export async function fetchCapacity(layout: LayoutFields): Promise<CapacityTelemetry> {
  const correlationId = createCorrelationId();
  const path = `${PAMPHLET_ROUTES.capacity}?${layoutQuery(layout)}`;
  const result = await apiRequest<CapacityTelemetry>(path, authOptions(correlationId));
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as CapacityTelemetry;
}

/** Resets pamphlet JSON to bundled defaults and returns fresh preview HTML. */
export async function resetPamphletDocument(layout: LayoutFields): Promise<{
  html: string;
  capacity: CapacityTelemetry;
}> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<{ html: string; capacity: CapacityTelemetry }>(
    PAMPHLET_ROUTES.reset,
    {
      method: "POST",
      body: { layout },
      ...authOptions(correlationId),
    },
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as { html: string; capacity: CapacityTelemetry };
}

/** Updates one content ref (e.g. "0:subidea:2") and returns refreshed preview HTML. */
export async function mutatePamphletContent(
  body: Record<string, unknown>,
  layout: LayoutFields,
): Promise<{ html: string; capacity: CapacityTelemetry; newRef?: string }> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<{ html: string; capacity: CapacityTelemetry; newRef?: string }>(
    PAMPHLET_ROUTES.content,
    {
      method: "POST",
      body: { ...body, layout },
      ...authOptions(correlationId),
    },
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as { html: string; capacity: CapacityTelemetry; newRef?: string };
}

/** Updates one content ref (e.g. "0:subidea:2") and returns refreshed preview HTML. */
export async function updatePamphletContent(
  ref: string,
  value: string,
  layout: LayoutFields,
  field?: string,
): Promise<{ html: string; capacity: CapacityTelemetry }> {
  const body: Record<string, unknown> = { op: "update", ref, value };
  if (field) {
    body.field = field;
  }
  return mutatePamphletContent(body, layout);
}

/** Uploads an image for an image subidea ref and returns refreshed preview HTML. */
export async function uploadPamphletImage(
  ref: string,
  file: File,
  layout: LayoutFields,
): Promise<{ html: string; capacity: CapacityTelemetry }> {
  const correlationId = createCorrelationId();
  const token = getAuthToken();
  const form = new FormData();
  form.append("ref", ref);
  form.append("file", file);
  form.append("layout", JSON.stringify(layout));

  const headers: Record<string, string> = {
    "X-Correlation-ID": correlationId,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(PAMPHLET_ROUTES.images, {
    method: "POST",
    body: form,
    headers,
  });
  const payload = (await response.json()) as {
    html?: string;
    capacity?: CapacityTelemetry;
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Upload failed (${response.status})`);
  }
  if (!payload.html || !payload.capacity) {
    throw new Error("Upload response missing preview payload");
  }
  return { html: payload.html, capacity: payload.capacity };
}

/** Lists pamphlet drafts for the authenticated user. */
export async function fetchPamphletRegistry(sort: "alpha" | "date" = "alpha"): Promise<PamphletRegistryItem[]> {
  const correlationId = createCorrelationId();
  const sortParam = sort === "date" ? "date" : "alpha";
  const result = await apiRequest<{ pamphlets: PamphletRegistryItem[] }>(
    `${PAMPHLET_ROUTES.registry}?sort=${sortParam}`,
    authOptions(correlationId),
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data?.pamphlets ?? [];
}

/** Loads persisted layout settings for the active pamphlet draft. */
export async function fetchPamphletLayout(pamphletId = "active"): Promise<LayoutFields> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<{ layout: LayoutFields }>(
    `${PAMPHLET_ROUTES.layout}?pamphletId=${encodeURIComponent(pamphletId)}`,
    authOptions(correlationId),
  );
  if (result.error || !result.data?.layout) {
    return DEFAULT_LAYOUT;
  }
  return { ...DEFAULT_LAYOUT, ...result.data.layout };
}

/** Persists layout settings for the active pamphlet draft. */
export async function savePamphletLayout(
  layout: LayoutFields,
  title = "active",
  pamphletId = "active",
): Promise<void> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<{ status: string }>(PAMPHLET_ROUTES.layout, {
    method: "POST",
    body: { layout, title },
    ...authOptions(correlationId),
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
}
