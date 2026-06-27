/**
 * GlobalPlayer.tsx — Persistent bottom audio bar with offline-first playback.
 *
 * Playback flow:
 * 1. On mount (and when track index changes), look up an offline blob URL in IndexedDB.
 * 2. If offline blob exists, wire <audio> to the blob URL and show "Offline Ready".
 * 3. If not, stream from the public/ remote path; optionally cache in the background.
 * 4. Bind Media Session metadata + play/pause handlers for Android background controls.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  encodePublicAudioPath,
  PUBLIC_AUDIO_PLAYLIST,
  type AudioTrack,
} from "../../config/audioPlaylist";
import {
  getOfflineTrackUrl,
  hasOfflineTrack,
  revokeOfflineTrackUrl,
  saveTrackOffline,
} from "../../lib/offlineAudio";
import "./GlobalPlayer.css";

function GlobalPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const currentTrack: AudioTrack =
    PUBLIC_AUDIO_PLAYLIST[trackIndex] ?? PUBLIC_AUDIO_PLAYLIST[0];

  const remoteUrl = encodePublicAudioPath(currentTrack.path);

  /** Tear down any prior blob URL before assigning a new source. */
  const clearBlobUrl = useCallback(() => {
    revokeOfflineTrackUrl(blobUrlRef.current);
    blobUrlRef.current = null;
  }, []);

  /** Resolve offline blob or remote URL and assign it to the hidden <audio> element. */
  const loadTrackSource = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    clearBlobUrl();
    setLoadError("");
    setIsPlaying(false);
    audio.pause();

    try {
      const offlineUrl = await getOfflineTrackUrl(currentTrack.id);
      const offlineExists = offlineUrl !== null || (await hasOfflineTrack(currentTrack.id));

      if (offlineUrl) {
        blobUrlRef.current = offlineUrl;
        audio.src = offlineUrl;
        setIsOfflineReady(true);
        return;
      }

      setIsOfflineReady(offlineExists);
      audio.src = remoteUrl;

      // Warm the offline cache when network is available (non-blocking).
      if (navigator.onLine && !offlineExists) {
        void saveTrackOffline(currentTrack.id, remoteUrl)
          .then(() => setIsOfflineReady(true))
          .catch(() => {
            /* Streaming still works; badge stays hidden until a later retry. */
          });
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Unable to load audio track"
      );
      setIsOfflineReady(false);
    }
  }, [clearBlobUrl, currentTrack.id, remoteUrl]);

  /** Push track metadata and OS media keys into the Media Session API. */
  const syncMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: "Cánticos Espirituales",
      album: "Eduardo OS",
    });

    navigator.mediaSession.setActionHandler("play", () => {
      void audioRef.current?.play();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
  }, [currentTrack.title]);

  useEffect(() => {
    void loadTrackSource();
    syncMediaSession();
  }, [loadTrackSource, syncMediaSession]);

  useEffect(() => {
    return () => {
      clearBlobUrl();
    };
  }, [clearBlobUrl]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Playback was blocked"
        );
      }
    } else {
      audio.pause();
    }
  };

  const playPrevious = () => {
    setTrackIndex((index) =>
      index === 0 ? PUBLIC_AUDIO_PLAYLIST.length - 1 : index - 1
    );
  };

  const playNext = () => {
    setTrackIndex((index) => (index + 1) % PUBLIC_AUDIO_PLAYLIST.length);
  };

  return (
    <section className="global-player" aria-label="Audio player">
      <audio
        ref={audioRef}
        className="global-player__audio"
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        }}
        onPause={() => {
          setIsPlaying(false);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
        }}
        onEnded={playNext}
      />

      <div className="global-player__info">
        <span className="global-player__title">
          {loadError ? loadError : currentTrack.title}
        </span>
        <div className="global-player__meta">
          <span className="global-player__index">
            {trackIndex + 1} / {PUBLIC_AUDIO_PLAYLIST.length}
          </span>
          {isOfflineReady && (
            <span className="global-player__badge">Offline Ready</span>
          )}
        </div>
      </div>

      <div className="global-player__controls">
        <button
          type="button"
          className="global-player__btn"
          aria-label="Previous track"
          onClick={playPrevious}
        >
          Prev
        </button>
        <button
          type="button"
          className="global-player__btn global-player__btn--primary"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => void togglePlayPause()}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="global-player__btn"
          aria-label="Next track"
          onClick={playNext}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default GlobalPlayer;
