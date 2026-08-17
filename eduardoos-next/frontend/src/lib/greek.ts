/**
 * Greek API client — admin-only letter-by-letter book builder.
 * Failures surface via ServerErrorModal (openApiErrorModal).
 *
 * Letter-images (not whole-word images): each word is composed of letter slots
 * with SVG + slug + alphabetNumber. Alphabet numbers are fixed to the Koine
 * Greek catalog (1=Α … 24=Ω; n.1=lower; n.2+=accents). Drawing happens in the
 * letter catalog; words pick glyphs from the catalog.
 */

import { APP_ROUTES, GREEK_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import { openApiErrorModal } from "../components/ServerErrorModal/ServerErrorModal";

export const GREEK_LETTER_WIDTH = 32;
export const GREEK_LETTER_HEIGHT = 64;
export const GREEK_MAX_ORDINAL_CHAPTER = 1000;
export const GREEK_MAX_ORDINAL_BOOK = 10000;
export const GREEK_MIN_ALPHABET = 1;
export const GREEK_MAX_ALPHABET = 30;

export type GreekGroup = {
  slug: string;
  title: string;
  ownerEmail: string;
  s3Prefix: string;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GreekLetterRef = {
  index: number;
  slug: string;
  alphabetNumber: number;
  key: string;
  url: string;
  size?: number;
  gallerySlug?: string;
};

export type GreekGalleryGlyph = {
  slug: string;
  alphabetNumber: number;
  label?: string;
  name?: string;
  case?: string;
  variant?: string;
  letterIndex?: number;
  drawn?: boolean;
  key: string;
  url: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type GreekWord = {
  slug: string;
  translation1: string;
  translation2: string;
  ordinalChapter: number;
  ordinalBook: number;
  letterCount: number;
  letterImages?: Array<{
    id: number;
    slug: string;
    alphabetNumber: number;
  }>;
  createdAt: string;
  updatedAt: string;
  letters?: GreekLetterRef[];
};

export type GreekVerse = {
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  words: GreekWord[];
};

export type GreekChapter = {
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  verses: GreekVerse[];
};

export type GreekGroupTree = {
  group: GreekGroup;
  chapters: GreekChapter[];
};

/** Dropdown values 1…30 with 0.1 steps (1, 1.1, …, 30). */
export function greekAlphabetNumberOptions(): number[] {
  const out: number[] = [];
  for (let n = GREEK_MIN_ALPHABET; n <= GREEK_MAX_ALPHABET; n += 1) {
    out.push(n);
    if (n < GREEK_MAX_ALPHABET) {
      for (let d = 1; d <= 9; d += 1) {
        out.push(Math.round((n + d / 10) * 10) / 10);
      }
    }
  }
  return out;
}

export function formatAlphabetNumber(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

export function validateAlphabetNumber(n: number): string | null {
  if (!Number.isFinite(n) || n < GREEK_MIN_ALPHABET || n > GREEK_MAX_ALPHABET) {
    return `alphabetNumber must be ${GREEK_MIN_ALPHABET}–${GREEK_MAX_ALPHABET}`;
  }
  if (Math.abs(n * 10 - Math.round(n * 10)) > 1e-6) {
    return "alphabetNumber must use steps of 0.1 (e.g. 1.1, 1.2)";
  }
  return null;
}

/** Sanitize a title into a URL/S3 slug (mirrors Go SanitizeSlug). */
export function sanitizeGreekSlug(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) return "";
  let out = "";
  let prevHyphen = false;
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      prevHyphen = false;
    } else if (" _-./".includes(ch)) {
      if (out.length > 0 && !prevHyphen) {
        out += "-";
        prevHyphen = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (out.length > 80) out = out.slice(0, 80).replace(/-+$/g, "");
  if (!out || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out)) return "";
  return out;
}

export function validateOrdinals(ordinalChapter: number, ordinalBook: number): string | null {
  if (!Number.isInteger(ordinalChapter) || ordinalChapter < 1 || ordinalChapter > GREEK_MAX_ORDINAL_CHAPTER) {
    return `ordinalChapter must be 1–${GREEK_MAX_ORDINAL_CHAPTER}`;
  }
  if (!Number.isInteger(ordinalBook) || ordinalBook < 1 || ordinalBook > GREEK_MAX_ORDINAL_BOOK) {
    return `ordinalBook must be 1–${GREEK_MAX_ORDINAL_BOOK}`;
  }
  return null;
}

export function resolveGroupSlugFromLocation(pathname: string, search: string): string {
  const q = new URLSearchParams(search).get("group");
  if (q) return decodeURIComponent(q.trim());
  const prefix = `${APP_ROUTES.greekBuild}/`;
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length).replace(/\/$/, "");
  if (!rest || rest === "workspace") return "";
  return decodeURIComponent(rest);
}

export function greekGroupWorkspaceHref(slug: string): string {
  return `${APP_ROUTES.greekGroupWorkspace}?group=${encodeURIComponent(slug)}`;
}

/** Collect all letter image URLs from a group tree (top gallery), already sorted per word. */
export function flattenLetterUrls(tree: GreekGroupTree | null): GreekLetterRef[] {
  if (!tree) return [];
  const out: GreekLetterRef[] = [];
  for (const ch of tree.chapters ?? []) {
    for (const v of ch.verses ?? []) {
      for (const w of v.words ?? []) {
        for (const letter of w.letters ?? []) {
          out.push(letter);
        }
      }
    }
  }
  return out;
}

/**
 * Build a 32×64 SVG from canvas stroke paths (pointer/finger/stylus).
 * Strokes are recorded in canvas pixel space and scaled into the viewBox.
 */
export function strokesToLetterSvg(
  strokes: Array<Array<{ x: number; y: number }>>,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const sx = GREEK_LETTER_WIDTH / Math.max(1, canvasWidth);
  const sy = GREEK_LETTER_HEIGHT / Math.max(1, canvasHeight);
  const paths: string[] = [];
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    let d = "";
    stroke.forEach((p, i) => {
      const x = (p.x * sx).toFixed(2);
      const y = (p.y * sy).toFixed(2);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
    paths.push(
      `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${GREEK_LETTER_WIDTH}" height="${GREEK_LETTER_HEIGHT}" viewBox="0 0 ${GREEK_LETTER_WIDTH} ${GREEK_LETTER_HEIGHT}">`,
    `<rect width="100%" height="100%" fill="none"/>`,
    ...paths,
    `</svg>`,
  ].join("");
}

function reportGreekError(details: unknown, summary: string, title = "Greek API"): void {
  openApiErrorModal(details, { title, summary });
}

async function greekRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T | null> {
  const token = getAuthToken();
  if (!token) {
    reportGreekError(
      `HTTP 401 · Sign in required · correlation_id=${createCorrelationId()}`,
      "Sign in required",
      "Greek",
    );
    return null;
  }
  const correlationId = createCorrelationId();
  const response = await apiRequest<T>(path, {
    method: options.method ?? "GET",
    body: options.body,
    correlationId,
    authToken: token,
  });
  if (response.error) {
    reportGreekError(formatApiError(response.error), "Greek request failed");
    return null;
  }
  return response.data ?? null;
}

export async function listGreekGroups(): Promise<GreekGroup[]> {
  const data = await greekRequest<{ groups: GreekGroup[] }>(GREEK_ROUTES.groups);
  return data?.groups ?? [];
}

export async function createGreekGroup(title: string, slug?: string): Promise<GreekGroup | null> {
  const data = await greekRequest<{ group: GreekGroup }>(GREEK_ROUTES.groups, {
    method: "POST",
    body: { title, slug: slug || sanitizeGreekSlug(title) },
  });
  return data?.group ?? null;
}

export async function fetchGreekGroup(slug: string): Promise<GreekGroupTree | null> {
  return greekRequest<GreekGroupTree>(GREEK_ROUTES.group(slug));
}

export async function createGreekChapter(
  groupSlug: string,
  title: string,
  slug?: string,
): Promise<{ slug: string; title: string } | null> {
  const data = await greekRequest<{ chapter: { slug: string; title: string } }>(
    GREEK_ROUTES.chapters(groupSlug),
    { method: "POST", body: { title, slug: slug || sanitizeGreekSlug(title) } },
  );
  return data?.chapter ?? null;
}

export async function createGreekVerse(
  groupSlug: string,
  chapterSlug: string,
  title: string,
  slug?: string,
): Promise<{ slug: string; title: string } | null> {
  const data = await greekRequest<{ verse: { slug: string; title: string } }>(
    GREEK_ROUTES.verses(groupSlug, chapterSlug),
    { method: "POST", body: { title, slug: slug || sanitizeGreekSlug(title) } },
  );
  return data?.verse ?? null;
}

export async function createGreekWord(
  groupSlug: string,
  chapterSlug: string,
  verseSlug: string,
  input: {
    slug?: string;
    translation1: string;
    translation2: string;
    ordinalChapter: number;
    ordinalBook: number;
  },
): Promise<GreekWord | null> {
  const err = validateOrdinals(input.ordinalChapter, input.ordinalBook);
  if (err) {
    reportGreekError(
      `HTTP 400 · ${err} · correlation_id=${createCorrelationId()}`,
      err,
      "Greek",
    );
    return null;
  }
  const data = await greekRequest<{ word: GreekWord }>(
    GREEK_ROUTES.words(groupSlug, chapterSlug, verseSlug),
    {
      method: "POST",
      body: {
        slug: input.slug || sanitizeGreekSlug(input.translation1),
        translation1: input.translation1,
        translation2: input.translation2,
        ordinalChapter: input.ordinalChapter,
        ordinalBook: input.ordinalBook,
      },
    },
  );
  return data?.word ?? null;
}

export async function updateGreekWord(
  groupSlug: string,
  chapterSlug: string,
  verseSlug: string,
  wordSlug: string,
  patch: {
    translation1?: string;
    translation2?: string;
    ordinalChapter?: number;
    ordinalBook?: number;
  },
): Promise<GreekWord | null> {
  const data = await greekRequest<{ word: GreekWord }>(
    GREEK_ROUTES.word(groupSlug, chapterSlug, verseSlug, wordSlug),
    { method: "PUT", body: patch },
  );
  return data?.word ?? null;
}

export type AddGreekLetterInput = {
  svg?: string;
  slug?: string;
  alphabetNumber?: number;
  gallerySlug?: string;
};

export async function addGreekLetter(
  groupSlug: string,
  chapterSlug: string,
  verseSlug: string,
  wordSlug: string,
  input: AddGreekLetterInput | string,
): Promise<GreekLetterRef | null> {
  const body: AddGreekLetterInput =
    typeof input === "string" ? { svg: input } : input;
  if (body.alphabetNumber != null) {
    const err = validateAlphabetNumber(body.alphabetNumber);
    if (err) {
      reportGreekError(
        `HTTP 400 · ${err} · correlation_id=${createCorrelationId()}`,
        err,
        "Greek",
      );
      return null;
    }
  }
  const data = await greekRequest<{ letter: GreekLetterRef }>(
    GREEK_ROUTES.letters(groupSlug, chapterSlug, verseSlug, wordSlug),
    { method: "POST", body },
  );
  return data?.letter ?? null;
}

export async function updateGreekLetter(
  groupSlug: string,
  chapterSlug: string,
  verseSlug: string,
  wordSlug: string,
  index: number,
  patch: { slug?: string; alphabetNumber?: number; svg?: string },
): Promise<GreekLetterRef | null> {
  if (patch.alphabetNumber != null) {
    const err = validateAlphabetNumber(patch.alphabetNumber);
    if (err) {
      reportGreekError(
        `HTTP 400 · ${err} · correlation_id=${createCorrelationId()}`,
        err,
        "Greek",
      );
      return null;
    }
  }
  const data = await greekRequest<{ letter: GreekLetterRef }>(
    GREEK_ROUTES.letter(groupSlug, chapterSlug, verseSlug, wordSlug, index),
    { method: "PUT", body: patch },
  );
  return data?.letter ?? null;
}

export async function listGreekGallery(): Promise<GreekGalleryGlyph[]> {
  const data = await greekRequest<{ glyphs: GreekGalleryGlyph[] }>(GREEK_ROUTES.catalog);
  return data?.glyphs ?? [];
}

export async function seedGreekCatalog(): Promise<{
  seeded: number;
  created: number;
  updated: number;
  keptDrawn: number;
  glyphs: GreekGalleryGlyph[];
} | null> {
  return greekRequest(GREEK_ROUTES.catalogSeed, { method: "POST" });
}

export async function addGreekGalleryGlyph(input: {
  svg: string;
  slug: string;
  alphabetNumber?: number;
}): Promise<GreekGalleryGlyph | null> {
  const data = await greekRequest<{ glyph: GreekGalleryGlyph }>(GREEK_ROUTES.gallery, {
    method: "POST",
    body: input,
  });
  return data?.glyph ?? null;
}

/** Override SVG (and optional metadata) for an existing catalog slot — same slug/key. */
export async function updateGreekCatalogGlyph(
  slug: string,
  patch: { svg?: string; alphabetNumber?: number; label?: string; name?: string },
): Promise<GreekGalleryGlyph | null> {
  if (patch.alphabetNumber != null) {
    const err = validateAlphabetNumber(patch.alphabetNumber);
    if (err) {
      reportGreekError(
        `HTTP 400 · ${err} · correlation_id=${createCorrelationId()}`,
        err,
        "Greek",
      );
      return null;
    }
  }
  const data = await greekRequest<{ glyph: GreekGalleryGlyph }>(
    GREEK_ROUTES.catalogGlyph(slug),
    { method: "PUT", body: patch },
  );
  return data?.glyph ?? null;
}

/**
 * Clear a catalog slot drawing (EmptyLetterSVG + drawn=false).
 * Keeps seed metadata (slug, label, alphabet #). Uses DELETE /api/greek/catalog/{slug}.
 */
export async function clearGreekCatalogGlyph(
  slug: string,
): Promise<GreekGalleryGlyph | null> {
  const data = await greekRequest<{ cleared: boolean; glyph: GreekGalleryGlyph }>(
    GREEK_ROUTES.catalogGlyph(slug),
    { method: "DELETE" },
  );
  return data?.glyph ?? null;
}

/** Authenticated letter URL for <img src> (blob fetch preferred). */
export function greekLetterApiUrl(
  groupSlug: string,
  chapterSlug: string,
  verseSlug: string,
  wordSlug: string,
  index: number,
): string {
  return GREEK_ROUTES.letter(groupSlug, chapterSlug, verseSlug, wordSlug, index);
}

export async function fetchLetterBlobUrl(apiUrl: string): Promise<string | null> {
  const token = getAuthToken();
  if (!token) return null;
  const correlationId = createCorrelationId();
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Correlation-ID": correlationId,
      },
    });
    if (!res.ok) {
      reportGreekError(
        `HTTP ${res.status} · Could not load letter · correlation_id=${correlationId}`,
        "Could not load letter",
        "Greek letter",
      );
      return null;
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    reportGreekError(
      `HTTP 0 · ${e instanceof Error ? e.message : "network error"} · correlation_id=${correlationId}`,
      "Could not load letter",
      "Greek letter",
    );
    return null;
  }
}
