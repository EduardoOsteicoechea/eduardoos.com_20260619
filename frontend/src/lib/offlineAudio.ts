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
