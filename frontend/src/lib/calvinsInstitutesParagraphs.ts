/**
 * Fetch helpers for the parallel Calvin’s Institutes paragraph pack (spec 056).
 * Hierarchy: book → chapter → paragraph. Does not alter the Capita 032 client.
 */

import { LATIN_API_ROUTES } from "../config/routes";
import { createCorrelationId } from "./correlation";

export const PARAGRAPH_EXPECTED_SOURCE_SHA256 =
  "162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2";
export const PARAGRAPH_DERIVATION = "break-after-period-v1";
export const PARAGRAPH_EXPECTED_CHAPTER_COUNT = 81;

export type ParagraphIndexChapter = {
  id: string;
  order: number;
  book: string;
  chapter: string;
  heading: string;
  sourceSectionId?: string;
  paragraphCount: number;
  url: string;
};

export type ParagraphIndex = {
  schemaVersion?: number;
  sourceSha256?: string;
  sourceEdition?: string;
  derivation?: string;
  chapterCount?: number;
  paragraphCount?: number;
  chapters: ParagraphIndexChapter[];
};

export type ParagraphUnit = {
  id: string;
  order: number;
  text: string;
};

export type ParagraphChapterDoc = {
  id: string;
  order?: number;
  book: string;
  chapter: string;
  heading: string;
  sourceSectionId?: string;
  paragraphs: ParagraphUnit[];
};

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "X-Correlation-ID": createCorrelationId() },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** True when the parallel pack matches the 055 readiness contract. */
export function isParagraphIndexReady(idx: ParagraphIndex): boolean {
  return (
    idx.sourceSha256 === PARAGRAPH_EXPECTED_SOURCE_SHA256 &&
    idx.derivation === PARAGRAPH_DERIVATION &&
    idx.chapterCount === PARAGRAPH_EXPECTED_CHAPTER_COUNT &&
    (idx.chapters?.length ?? 0) === PARAGRAPH_EXPECTED_CHAPTER_COUNT
  );
}

export async function fetchParagraphIndex(): Promise<ParagraphIndex> {
  const idx = await getJSON<ParagraphIndex>(LATIN_API_ROUTES.institutesParagraphsIndex);
  if (!isParagraphIndexReady(idx)) {
    throw new Error(
      "Institutes paragraph pack not ready (sourceSha256/derivation/chapterCount).",
    );
  }
  return idx;
}

export function fetchParagraphChapter(
  book: string,
  chapter: string,
): Promise<ParagraphChapterDoc> {
  return getJSON(LATIN_API_ROUTES.institutesParagraphChapter(book, chapter));
}

/** Liber I–IV groups; chapters sorted by order. */
export function groupChaptersByLiber(
  chapters: ParagraphIndexChapter[],
): { book: string; entries: ParagraphIndexChapter[] }[] {
  const bookOrder = ["I", "II", "III", "IV"];
  const map = new Map<string, ParagraphIndexChapter[]>();
  for (const book of bookOrder) map.set(book, []);
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  for (const c of sorted) {
    const list = map.get(c.book);
    if (list) list.push(c);
    else {
      map.set(c.book, [c]);
      bookOrder.push(c.book);
    }
  }
  return bookOrder
    .filter((book) => (map.get(book)?.length ?? 0) > 0)
    .map((book) => ({ book, entries: map.get(book)! }));
}

export function chapterNavLabel(entry: ParagraphIndexChapter): string {
  if (entry.chapter === "PRELIMINARY") return "Prelim.";
  return entry.chapter || "";
}

/** Join chapter paragraphs with the same visual separation as the reader. */
export function formatChapterClipboard(doc: ParagraphChapterDoc): string {
  return [...(doc.paragraphs ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((p) => (p.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
