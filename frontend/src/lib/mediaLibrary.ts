/**
 * mediaLibrary.ts — Fetches worship audio objects for the playlist builder library.
 */

import { apiRequest } from "./api";
import { MEDIA_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";

/** Worship playlist audio prefix inside the media/ S3 folder. */
export const WORSHIP_AUDIO_PREFIX = "worship_playlists";

export interface MediaObject {
  key: string;
  content_type: string;
  size: number;
  last_modified?: string;
}

export interface MediaObjectsResponse {
  objects: MediaObject[];
}

/** Returns drag-and-drop library items from GET /api/media/objects. */
export async function fetchAudioLibrary(): Promise<MediaObject[]> {
  const correlationId = createCorrelationId();
  const path = `${MEDIA_ROUTES.objects}?prefix=${encodeURIComponent(WORSHIP_AUDIO_PREFIX)}`;
  const result = await apiRequest<MediaObjectsResponse>(path, { correlationId });
  if (result.error) {
    throw new Error(result.error.message);
  }
  const objects = result.data?.objects ?? [];
  return objects.filter((obj) => {
    const ct = (obj.content_type || "").toLowerCase();
    return ct.startsWith("audio/") || obj.key.toLowerCase().endsWith(".mp3");
  });
}

/** Builds the browser playback URL for a stored object key. */
export function mediaObjectPlaybackUrl(objectKey: string): string {
  const mediaPrefix = "media/";
  const relative = objectKey.startsWith(mediaPrefix)
    ? objectKey.slice(mediaPrefix.length)
    : objectKey;
  return `/api/media/file/${encodeURI(relative)}`;
}

/** Display name for a library or playlist track row. */
export function trackDisplayName(objectKey: string): string {
  const parts = objectKey.split("/");
  return parts[parts.length - 1] || objectKey;
}
