/**
 * offlineAudio.ts — IndexedDB persistence for audio tracks via localForage.
 *
 * Step-by-step:
 * 1. Configure a dedicated localForage instance (DB + object store name).
 * 2. saveTrackOffline() downloads a remote URL and stores the raw Blob by trackId.
 * 3. getOfflineTrackUrl() reads the Blob and returns a blob: URL for <audio src>.
 * 4. revokeOfflineTrackUrl() releases blob URLs when the player unmounts or switches tracks.
 */

import localforage from "localforage";

/** Isolated IndexedDB database for Eduardo OS offline audio blobs. */
const audioStore = localforage.createInstance({
  name: "EduardoOS_Audio",
  storeName: "offline_tracks",
});

/**
 * Downloads `url` and persists the response body under `trackId`.
 * Returns true when the blob was stored successfully.
 */
export async function saveTrackOffline(
  trackId: string,
  url: string
): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download track (${response.status}): ${url}`);
  }
  const blob = await response.blob();
  await audioStore.setItem(trackId, blob);
  return true;
}

/**
 * Returns a blob object URL when `trackId` exists in offline storage, otherwise null.
 * Caller must revoke the URL with revokeOfflineTrackUrl() when finished.
 */
export async function getOfflineTrackUrl(
  trackId: string
): Promise<string | null> {
  const blob = await audioStore.getItem<Blob>(trackId);
  if (!blob) {
    return null;
  }
  return URL.createObjectURL(blob);
}

/** Releases a blob URL previously created by getOfflineTrackUrl(). */
export function revokeOfflineTrackUrl(objectUrl: string | null): void {
  if (objectUrl && objectUrl.startsWith("blob:")) {
    URL.revokeObjectURL(objectUrl);
  }
}

/** True when a blob for `trackId` is already stored locally. */
export async function hasOfflineTrack(trackId: string): Promise<boolean> {
  const blob = await audioStore.getItem<Blob>(trackId);
  return blob instanceof Blob;
}

export interface OfflineDownloadItem {
  trackId: string;
  url: string;
}

export interface OfflineBulkProgress {
  done: number;
  total: number;
  trackId: string;
  status: "skipped" | "saved" | "failed";
  error?: string;
}

/**
 * Downloads many tracks into IndexedDB for offline PWA playback.
 * Skips tracks that are already cached; reports per-track progress via callback.
 */
export async function saveTracksOfflineBulk(
  items: OfflineDownloadItem[],
  onProgress?: (progress: OfflineBulkProgress) => void,
): Promise<{ saved: number; skipped: number; failed: number }> {
  const unique = new Map<string, string>();
  for (const item of items) {
    if (item.trackId && item.url) {
      unique.set(item.trackId, item.url);
    }
  }

  const entries = [...unique.entries()];
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const [trackId, url] = entries[index];
    const report = (status: OfflineBulkProgress["status"], error?: string) => {
      onProgress?.({
        done: index + 1,
        total: entries.length,
        trackId,
        status,
        error,
      });
    };

    try {
      if (await hasOfflineTrack(trackId)) {
        skipped += 1;
        report("skipped");
        continue;
      }
      await saveTrackOffline(trackId, url);
      saved += 1;
      report("saved");
    } catch (err) {
      failed += 1;
      report("failed", err instanceof Error ? err.message : String(err));
    }
  }

  return { saved, skipped, failed };
}

/** Count how many of the given track IDs exist in offline storage. */
export async function countOfflineTracks(trackIds: string[]): Promise<number> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  let count = 0;
  for (const trackId of unique) {
    if (await hasOfflineTrack(trackId)) {
      count += 1;
    }
  }
  return count;
}
