/**
 * Copyable diagnostics for /media/musica playback failures (spec 041).
 * Surfaces via ServerErrorModal so operators can see URL / MediaError / Range probe.
 */

import { openServerErrorModal } from "../components/ServerErrorModal/ServerErrorModal";

export type PlaybackSourceKind = "remote" | "offline_blob" | "local_blob" | "none";

export type PlaybackFailureReport = {
  phase: "sync" | "load" | "play" | "offline_miss" | "empty_src";
  trackKey: string;
  displayName: string;
  src: string;
  sourceKind: PlaybackSourceKind;
  remoteUrl?: string;
  exceptionMessage?: string;
  audio?: HTMLAudioElement | null;
};

const MEDIA_ERR_LABELS: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

export function mediaErrorLabel(code: number | undefined | null): string {
  if (code == null || !Number.isFinite(code)) return "none";
  return MEDIA_ERR_LABELS[code] ?? `unknown(${code})`;
}

function clip(value: string, max = 500): string {
  const s = value || "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Short Range GET so we can see status / Content-Type / Accept-Ranges without
 * downloading the whole MP3. Blob URLs are skipped.
 */
export async function probeMediaPlaybackUrl(url: string): Promise<string> {
  if (!url) return "probe=skipped (empty url)";
  if (url.startsWith("blob:")) return "probe=skipped (blob url)";
  if (url.startsWith("data:")) return "probe=skipped (data url)";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      cache: "no-store",
    });
    // Consume a tiny body so the connection can close cleanly.
    try {
      await res.arrayBuffer();
    } catch {
      /* ignore body read errors */
    }
    return [
      `probe_ok=true`,
      `probe_status=${res.status}`,
      `probe_content_type=${res.headers.get("content-type") ?? "(missing)"}`,
      `probe_accept_ranges=${res.headers.get("accept-ranges") ?? "(missing)"}`,
      `probe_content_range=${res.headers.get("content-range") ?? "(missing)"}`,
      `probe_content_length=${res.headers.get("content-length") ?? "(missing)"}`,
    ].join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `probe_ok=false\nprobe_error=${msg}`;
  }
}

function audioSnapshot(audio: HTMLAudioElement | null | undefined): string[] {
  if (!audio) return ["audio_element=missing"];
  const err = audio.error;
  return [
    `audio_src=${clip(audio.currentSrc || audio.src || "")}`,
    `readyState=${audio.readyState}`,
    `networkState=${audio.networkState}`,
    `paused=${audio.paused}`,
    `currentTime=${Number.isFinite(audio.currentTime) ? audio.currentTime.toFixed(3) : String(audio.currentTime)}`,
    `duration=${Number.isFinite(audio.duration) ? audio.duration.toFixed(3) : String(audio.duration)}`,
    `media_error_code=${err?.code ?? "none"}`,
    `media_error_label=${mediaErrorLabel(err?.code)}`,
    `media_error_message=${err?.message || "(empty)"}`,
  ];
}

/**
 * Build the copyable block and open ServerErrorModal (never throws).
 */
export async function reportPlaybackFailure(input: PlaybackFailureReport): Promise<void> {
  try {
    const probeTarget =
      input.sourceKind === "remote"
        ? input.src || input.remoteUrl || ""
        : input.remoteUrl && input.sourceKind === "offline_blob"
          ? input.remoteUrl
          : input.sourceKind === "none"
            ? input.remoteUrl || ""
            : "";

    const probeLines = probeTarget
      ? await probeMediaPlaybackUrl(probeTarget)
      : "probe=skipped (no remote url to probe)";

    const lines = [
      `phase=${input.phase}`,
      `track_key=${input.trackKey}`,
      `display_name=${input.displayName}`,
      `source_kind=${input.sourceKind}`,
      `navigator_onLine=${String(typeof navigator !== "undefined" ? navigator.onLine : "n/a")}`,
      `resolved_src=${clip(input.src)}`,
      `remote_url=${clip(input.remoteUrl || "")}`,
      `exception=${input.exceptionMessage || "(none)"}`,
      ...audioSnapshot(input.audio),
      "--- probe ---",
      probeLines,
      `location=${typeof location !== "undefined" ? location.href : ""}`,
      `user_agent=${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    ];

    openServerErrorModal({
      title: "Music playback failed",
      summary:
        "Copy this block and send it so we can see why the track did not play (URL, MediaError, Range/MIME probe).",
      details: lines.join("\n"),
    });
  } catch (err) {
    // Last resort: still open something copyable.
    openServerErrorModal({
      title: "Music playback failed",
      summary: "Diagnostic helper crashed while building the report.",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
