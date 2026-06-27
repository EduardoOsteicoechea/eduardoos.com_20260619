/**
 * mediaLibrary.ts — Fetches worship audio tracks for the playlist builder library.
 */

import { apiRequest } from "./api";
import { createCorrelationId } from "./telemetry";

/** Worship playlist audio prefix inside the media/ S3 folder. */
export const WORSHIP_AUDIO_PREFIX = "worship_playlists";

export interface AudioLibraryItem {
  key: string;
  name: string;
  content_type: string;
  size: number;
  size_human?: string;
  last_modified?: string;
  url: string;
  s3_url?: string;
}

interface AudioListResponse {
  prefix: string;
  count: number;
  tracks: AudioLibraryItem[];
}

/** Returns drag-and-drop library items from GET /api/media/audio. */
export async function fetchAudioLibrary(): Promise<AudioLibraryItem[]> {
  const correlationId = createCorrelationId();
  const path = `/api/media/audio?prefix=${encodeURIComponent(WORSHIP_AUDIO_PREFIX)}`;
  const result = await apiRequest<AudioListResponse>(path, { correlationId });
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data?.tracks ?? [];
}

/**
 * Matches Go net/url.PathEscape for a single path segment (no slashes).
 */
function encodePathSegment(segment: string): string {
  let out = "";
  for (const ch of segment) {
    const code = ch.codePointAt(0)!;
    const isAlphaNum =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39);
    const isAllowed =
      isAlphaNum ||
      ch === "-" ||
      ch === "_" ||
      ch === "." ||
      ch === "~" ||
      ch === "$" ||
      ch === "&" ||
      ch === "+" ||
      ch === "," ||
      ch === ":" ||
      ch === ";" ||
      ch === "=" ||
      ch === "?" ||
      ch === "@";
    if (isAllowed) {
      out += ch;
      continue;
    }
    for (const byte of new TextEncoder().encode(ch)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** Percent-encodes each path segment; keeps "/" as a separator (not %2F). */
export function encodeMediaRelativePath(relative: string): string {
  return relative
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodePathSegment(segment))
    .join("/");
}

/** Builds the browser playback URL for a stored object key. */
export function mediaObjectPlaybackUrl(objectKey: string, playbackUrl?: string): string {
  if (playbackUrl) {
    return normalizeMediaPlaybackUrl(playbackUrl);
  }
  const mediaPrefix = "media/";
  const relative = objectKey.startsWith(mediaPrefix)
    ? objectKey.slice(mediaPrefix.length)
    : objectKey;
  return `/api/media/file/${encodeMediaRelativePath(relative)}`;
}

/** Fixes legacy API URLs that encoded "/" as "%2F" inside a single path segment. */
export function normalizeMediaPlaybackUrl(url: string): string {
  const prefix = "/api/media/file/";
  if (!url.startsWith(prefix)) {
    return url;
  }
  return prefix + url.slice(prefix.length).replace(/%2F/gi, "/");
}

/** Display name for a library or playlist track row. */
export function trackDisplayName(objectKey: string): string {
  const parts = objectKey.split("/");
  return parts[parts.length - 1] || objectKey;
}
