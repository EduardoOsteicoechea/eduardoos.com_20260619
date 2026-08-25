/**
 * Fetch helpers for Calvin’s Institutes (S3-backed public API).
 */

import { LATIN_API_ROUTES } from "../config/routes";
import { createCorrelationId } from "./correlation";

export type InstitutesIndexSection = {
  id: string;
  order: number;
  volume?: number | null;
  book?: string | null;
  heading: string;
  url: string;
};

export type InstitutesIndex = {
  schemaVersion?: number;
  sectionCount?: number;
  sections: InstitutesIndexSection[];
};

export type InstitutesSection = {
  id: string;
  order?: number;
  volume?: number | null;
  book?: string | null;
  heading: string;
  text: string;
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

export function fetchInstitutesIndex(): Promise<InstitutesIndex> {
  return getJSON(LATIN_API_ROUTES.institutesIndex);
}

export function fetchInstitutesSection(id: string): Promise<InstitutesSection> {
  return getJSON(LATIN_API_ROUTES.institutesSection(id));
}
