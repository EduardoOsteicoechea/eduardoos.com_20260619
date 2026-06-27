/**
 * formatTime.ts — Human-readable mm:ss labels for audio transport UI.
 */

/** Formats seconds as m:ss (or 0:00 when invalid). */
export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
