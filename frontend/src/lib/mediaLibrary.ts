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

/** Builds the browser playback URL for a stored object key. */
export function mediaObjectPlaybackUrl(objectKey: string, playbackUrl?: string): string {
  if (playbackUrl) {
    return playbackUrl;
  }
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
