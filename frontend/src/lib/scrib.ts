/**
 * Scrib client — library / books / layered US Letter sheets under S3 scrib/.
 */

import { SCRIB_ROUTES, APP_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export const SCRIB_PAGE_WIDTH_MM = 215.9;
export const SCRIB_PAGE_HEIGHT_MM = 279.4;
export const SCRIB_BG_SRC = "/documento_generado_columnas_v2.jpg";

export const SCRIB_LAYER_IDS = [
  "chapter",
  "verse",
  "word",
  "original",
  "translation1",
  "translation2",
] as const;

export type ScribLayerId = (typeof SCRIB_LAYER_IDS)[number];

export const SCRIB_LAYER_LABELS: Record<ScribLayerId, string> = {
  chapter: "Número de capítulo",
  verse: "Número de versículo",
  word: "Número de palabra",
  original: "Texto original",
  translation1: "Traducción 1",
  translation2: "Traducción 2",
};

export type StrokePath = {
  d: string;
  strokeWidth: number;
};

export type ScribLayer = {
  id: ScribLayerId | string;
  opacity: number;
  paths: StrokePath[];
};

export type SheetMeta = {
  id: string;
  name: string;
  updatedAt: string;
};

export type ScribBookCard = {
  id: string;
  name: string;
  updatedAt: string;
  sheets: SheetMeta[];
};

export type ScribSheet = {
  id: string;
  bookId: string;
  name: string;
  activeLayerId: string;
  strokeWidthMm: number;
  layers: ScribLayer[];
  updatedAt: string;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in required for Scrib.");
  return token;
}

export async function fetchScribLibrary(): Promise<{
  userSafe: string;
  books: ScribBookCard[];
  error?: string;
}> {
  const result = await apiRequest<{
    userSafe: string;
    books: ScribBookCard[];
  }>(SCRIB_ROUTES.library, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { userSafe: "", books: [], error: formatApiError(result.error) };
  }
  return {
    userSafe: result.data?.userSafe ?? "",
    books: (result.data?.books ?? []).map((b) => ({
      ...b,
      sheets: b.sheets ?? [],
    })),
  };
}

export async function createScribBook(name: string): Promise<{
  book: ScribBookCard | null;
  error?: string;
}> {
  const result = await apiRequest<ScribBookCard>(SCRIB_ROUTES.books, {
    method: "POST",
    body: { name },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { book: null, error: formatApiError(result.error) };
  }
  return {
    book: result.data
      ? { ...result.data, sheets: result.data.sheets ?? [] }
      : null,
  };
}

export async function deleteScribBook(
  bookId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    SCRIB_ROUTES.book(bookId),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { ok: false, error: formatApiError(result.error) };
  }
  return { ok: true };
}

export async function renameScribBook(
  bookId: string,
  name: string,
): Promise<{ book: ScribBookCard | null; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { book: null, error: "name required" };
  }
  const result = await apiRequest<ScribBookCard>(SCRIB_ROUTES.book(bookId), {
    method: "PUT",
    body: { name: trimmed },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { book: null, error: formatApiError(result.error) };
  }
  return {
    book: result.data
      ? { ...result.data, sheets: result.data.sheets ?? [] }
      : null,
  };
}

export async function createScribSheet(
  bookId: string,
  name: string,
): Promise<{ sheet: ScribSheet | null; error?: string }> {
  const result = await apiRequest<ScribSheet>(SCRIB_ROUTES.sheets(bookId), {
    method: "POST",
    body: { name },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { sheet: null, error: formatApiError(result.error) };
  }
  return { sheet: result.data ?? null };
}

export async function fetchScribSheet(
  bookId: string,
  sheetId: string,
): Promise<{ sheet: ScribSheet | null; error?: string }> {
  const result = await apiRequest<ScribSheet>(
    SCRIB_ROUTES.sheet(bookId, sheetId),
    {
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { sheet: null, error: formatApiError(result.error) };
  }
  return { sheet: result.data ?? null };
}

export async function saveScribSheet(
  sheet: ScribSheet,
): Promise<{ sheet: ScribSheet | null; error?: string }> {
  const result = await apiRequest<ScribSheet>(
    SCRIB_ROUTES.sheet(sheet.bookId, sheet.id),
    {
      method: "PUT",
      body: sheet,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { sheet: null, error: formatApiError(result.error) };
  }
  return { sheet: result.data ?? null };
}

/** Rename a sheet by loading it, updating `name`, and saving the full document. */
export async function renameScribSheet(
  bookId: string,
  sheetId: string,
  name: string,
): Promise<{ sheet: ScribSheet | null; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { sheet: null, error: "name required" };
  }
  const loaded = await fetchScribSheet(bookId, sheetId);
  if (loaded.error || !loaded.sheet) {
    return { sheet: null, error: loaded.error ?? "sheet not found" };
  }
  if (loaded.sheet.name === trimmed) {
    return { sheet: loaded.sheet };
  }
  return saveScribSheet({ ...loaded.sheet, name: trimmed });
}

export async function deleteScribSheet(
  bookId: string,
  sheetId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    SCRIB_ROUTES.sheet(bookId, sheetId),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { ok: false, error: formatApiError(result.error) };
  }
  return { ok: true };
}

/** Stable editor entry — static `/scrib/sheet` + query (works without nginx rewrite). */
export function scribSheetHref(
  userSafe: string,
  bookId: string,
  sheetId: string,
): string {
  const q = new URLSearchParams({
    user: userSafe,
    book: bookId,
    sheet: sheetId,
  });
  return `${APP_ROUTES.scribSheetWorkspace}?${q.toString()}`;
}

/** Pretty path for the address bar after the shell has loaded. */
export function scribSheetPrettyPath(
  userSafe: string,
  bookId: string,
  sheetId: string,
): string {
  return APP_ROUTES.scribSheet(userSafe, bookId, sheetId);
}

/**
 * Parse /scrib/{user}/{book}/{sheet} from a Location-like object.
 * Also supports /scrib/sheet?user=&book=&sheet= as a fallback.
 */
export function resolveScribSheetFromLocation(loc?: {
  pathname: string;
  search: string;
}): {
  userSafe: string;
  bookId: string;
  sheetId: string;
} | null {
  if (!loc && typeof window === "undefined") return null;
  const target = loc ?? window.location;
  const path = target.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "scrib" && parts.length >= 4 && parts[1] !== "sheet") {
    return {
      userSafe: decodeURIComponent(parts[1]),
      bookId: decodeURIComponent(parts[2]),
      sheetId: decodeURIComponent(parts[3]),
    };
  }
  const params = new URLSearchParams(target.search);
  const userSafe = params.get("user") ?? "";
  const bookId = params.get("book") ?? "";
  const sheetId = params.get("sheet") ?? "";
  if (userSafe && bookId && sheetId) {
    return { userSafe, bookId, sheetId };
  }
  return null;
}
