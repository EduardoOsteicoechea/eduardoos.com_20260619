/**
 * Fetch helpers for Calvin’s Institutes (Latin 1559, S3-backed public API).
 * Index must match the readiness contract in specs/032-calvins-institutes.
 */

import { LATIN_API_ROUTES } from "../config/routes";
import { createCorrelationId } from "./correlation";

/** Expected sanitized corpus fingerprint (must match backend gate). */
export const INSTITUTES_EXPECTED_SOURCE_SHA256 =
  "162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2";
export const INSTITUTES_EXPECTED_SECTION_COUNT = 81;

export type InstitutesIndexSection = {
  id: string;
  order: number;
  volume?: number | null;
  book: string;
  section: string;
  heading: string;
  paragraphCount?: number;
  pointCount?: number;
  url: string;
};

export type InstitutesIndex = {
  schemaVersion?: number;
  sourceSha256?: string;
  sourceEdition?: string;
  sectionCount?: number;
  sections: InstitutesIndexSection[];
};

export type InstitutesPoint = {
  order: number;
  text: string;
};

export type InstitutesParagraph = {
  order: number;
  text: string;
  points?: InstitutesPoint[];
};

export type InstitutesSection = {
  id: string;
  order?: number;
  volume?: number | null;
  book?: string;
  section?: string;
  heading: string;
  text?: string | null;
  paragraphs?: InstitutesParagraph[];
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

/** True when index matches the sanitized Latin 1559 readiness contract. */
export function isInstitutesIndexReady(idx: InstitutesIndex): boolean {
  return (
    idx.sourceSha256 === INSTITUTES_EXPECTED_SOURCE_SHA256 &&
    idx.sectionCount === INSTITUTES_EXPECTED_SECTION_COUNT &&
    (idx.sections?.length ?? 0) === INSTITUTES_EXPECTED_SECTION_COUNT
  );
}

export async function fetchInstitutesIndex(): Promise<InstitutesIndex> {
  const idx = await getJSON<InstitutesIndex>(LATIN_API_ROUTES.institutesIndex);
  if (!isInstitutesIndexReady(idx)) {
    throw new Error(
      "Institutes corpus not ready (sourceSha256/sectionCount mismatch). Wait for S3 sync.",
    );
  }
  return idx;
}

export function fetchInstitutesSection(id: string): Promise<InstitutesSection> {
  return getJSON(LATIN_API_ROUTES.institutesSection(id));
}

/** Stable nav label: PRELIMINARY or Caput roman from the section field. */
export function sectionNavLabel(entry: InstitutesIndexSection): string {
  if (entry.section === "PRELIMINARY") return "Prelim.";
  return entry.section || "";
}

/** Liber I–IV groups in canonical book order; Capita already sorted by order. */
export function groupSectionsByLiber(
  sections: InstitutesIndexSection[],
): { book: string; entries: InstitutesIndexSection[] }[] {
  const bookOrder = ["I", "II", "III", "IV"];
  const map = new Map<string, InstitutesIndexSection[]>();
  for (const book of bookOrder) map.set(book, []);
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  for (const s of sorted) {
    const list = map.get(s.book);
    if (list) {
      list.push(s);
    } else {
      map.set(s.book, [s]);
      bookOrder.push(s.book);
    }
  }
  return bookOrder
    .filter((book) => (map.get(book)?.length ?? 0) > 0)
    .map((book) => ({ book, entries: map.get(book)! }));
}

/**
 * Prefer paragraphs[].text (clean pack: one readable paragraph per entry).
 * Fall back to points[].text only when paragraph text is empty.
 * Numbered paragraphs (`1. …`) get line breaks after periods for readability.
 */
export function flattenSectionBody(section: InstitutesSection): {
  paragraphs: { key: string; lines: string[] }[];
} {
  const paras = [...(section.paragraphs ?? [])].sort((a, b) => a.order - b.order);
  return {
    paragraphs: paras.map((p) => {
      const text = (p.text ?? "").trim();
      if (text) {
        return { key: `p-${p.order}`, lines: [formatNumberedParagraphBreaks(text)] };
      }
      const points = [...(p.points ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((pt) => formatNumberedParagraphBreaks((pt.text ?? "").trim()))
        .filter(Boolean);
      return { key: `p-${p.order}`, lines: points };
    }),
  };
}

/**
 * If the line starts with a decimal section number (`12. …`), put a blank line
 * after that marker and after each later sentence-ending period + space
 * (one empty line of spacing). Non-numbered paragraphs are unchanged.
 */
export function formatNumberedParagraphBreaks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const m = trimmed.match(/^(\d+)\.\s+([\s\S]*)$/);
  if (!m) return trimmed;
  const marker = m[1];
  const body = m[2].replace(/\.\s+/g, ".\n\n").trimEnd();
  return `${marker}.\n\n${body}`;
}
