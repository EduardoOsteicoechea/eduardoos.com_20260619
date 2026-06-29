/**
 * PlaylistBuilder.tsx — Drag-and-drop worship playlist editor with transport controls.
 *
 * Workflow:
 * 1. Load audio library from GET /api/media/audio?prefix=worship_playlists
 * 2. Drag tracks into the active playlist column (HTML5 drag-and-drop)
 * 3. Save/load named playlists via authenticated /api/playlists routes
 * 4. PlaylistControls drives a hidden <audio> element for preview playback
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "../../lib/auth";
import {
  fetchAudioLibrary,
  mediaObjectPlaybackUrl,
  trackDisplayName,
  type AudioLibraryItem,
} from "../../lib/mediaLibrary";
import {
  countOfflineTracks,
  getOfflineTrackUrl,
  revokeOfflineTrackUrl,
  saveTrackOffline,
  saveTracksOfflineBulk,
  type OfflineBulkProgress,
} from "../../lib/offlineAudio";
import { fetchPlaylists, savePlaylist, type PlaylistRecord } from "../../lib/playlists";
import PlaylistControls from "./PlaylistControls";
import {
  IconAddToPlaylist,
  IconChevronDown,
  IconChevronUp,
  IconRemove,
} from "./PlaylistIcons";
import "./PlaylistBuilder.css";

const DRAG_MIME = "application/x-eduardoos-track-key";

export default function PlaylistBuilder() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const activeTracksRef = useRef<string[]>([]);
  const loopPlaylistRef = useRef(false);
  const isSeekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const autoPlayNextRef = useRef(false);
  const currentIndexRef = useRef(0);
  const urlByKeyRef = useRef<Map<string, string>>(new Map());

  const [library, setLibrary] = useState<AudioLibraryItem[]>([]);
  const [urlByKey, setUrlByKey] = useState<Map<string, string>>(() => new Map());
  const [activeTracks, setActiveTracks] = useState<string[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [loadedPlaylistId, setLoadedPlaylistId] = useState("");
  const [savedPlaylists, setSavedPlaylists] = useState<PlaylistRecord[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopPlaylist, setLoopPlaylist] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [dragReorderIndex, setDragReorderIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [offlineReadyCount, setOfflineReadyCount] = useState(0);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState("");

  activeTracksRef.current = activeTracks;
  loopPlaylistRef.current = loopPlaylist;
  isPlayingRef.current = isPlaying;
  currentIndexRef.current = currentIndex;
  urlByKeyRef.current = urlByKey;

  const clearBlobUrl = useCallback(() => {
    revokeOfflineTrackUrl(blobUrlRef.current);
    blobUrlRef.current = null;
  }, []);

  const refreshOfflineCount = useCallback(async (keys: string[]) => {
    if (keys.length === 0) {
      setOfflineReadyCount(0);
      return;
    }
    const count = await countOfflineTracks(keys);
    setOfflineReadyCount(count);
  }, []);

  const loadLibrary = useCallback(async () => {
    const tracks = await fetchAudioLibrary();
    setLibrary(tracks);
    const map = new Map<string, string>();
    for (const track of tracks) {
      map.set(track.key, track.url);
    }
    setUrlByKey(map);
    await refreshOfflineCount(tracks.map((track) => track.key));
  }, [refreshOfflineCount]);

  const loadSavedPlaylists = useCallback(async () => {
    if (!getAuthToken()) {
      setSavedPlaylists([]);
      return;
    }
    const data = await fetchPlaylists();
    setSavedPlaylists(data.playlists);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        await loadLibrary();
        await loadSavedPlaylists();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load playlist data");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadLibrary, loadSavedPlaylists]);

  const currentTrackKey = activeTracks[currentIndex] ?? "";
  const nowPlayingLabel = currentTrackKey
    ? `Now playing: ${trackDisplayName(currentTrackKey)}`
    : "No track selected";

  const syncAudioElement = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = playbackRate;
    if (!currentTrackKey) {
      clearBlobUrl();
      audio.removeAttribute("src");
      return;
    }

    const remoteSrc = mediaObjectPlaybackUrl(currentTrackKey, urlByKey.get(currentTrackKey));
    const offlineUrl = await getOfflineTrackUrl(currentTrackKey);
    clearBlobUrl();

    let nextSrc = remoteSrc;
    if (offlineUrl) {
      blobUrlRef.current = offlineUrl;
      nextSrc = offlineUrl;
    } else if (navigator.onLine) {
      void saveTrackOffline(currentTrackKey, remoteSrc)
        .then(() => refreshOfflineCount(library.map((item) => item.key)))
        .catch(() => {
          /* streaming still works */
        });
    }

    const resolved = new URL(nextSrc, window.location.origin).href;
    if (audio.src !== resolved) {
      audio.src = nextSrc;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
    }
  }, [clearBlobUrl, currentTrackKey, library, playbackRate, refreshOfflineCount, urlByKey, volume]);

  useEffect(() => {
    void syncAudioElement();
  }, [syncAudioElement]);

  useEffect(() => {
    if (!autoPlayNextRef.current && !isPlayingRef.current) return;
    if (!currentTrackKey) return;
    autoPlayNextRef.current = false;
    void playCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-play when track index changes during playback
  }, [currentIndex, currentTrackKey]);

  useEffect(() => {
    return () => {
      clearBlobUrl();
    };
  }, [clearBlobUrl]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrackKey) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackDisplayName(currentTrackKey),
      artist: "Eduardo OS Playlist",
      album: playlistName || "Worship Playlist",
    });
    navigator.mediaSession.setActionHandler("play", () => void playCurrent());
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
  }, [currentTrackKey, playlistName]);

  function addTrack(key: string, insertAt?: number) {
    if (!key) return;
    setActiveTracks((tracks) => {
      const next = [...tracks];
      const index = insertAt === undefined ? next.length : Math.min(insertAt, next.length);
      next.splice(index, 0, key);
      return next;
    });
  }

  function removeTrack(index: number) {
    setActiveTracks((tracks) => tracks.filter((_, i) => i !== index));
    setCurrentIndex((idx) => {
      if (idx > index) return idx - 1;
      if (idx === index) return Math.max(0, idx - 1);
      return idx;
    });
  }

  function moveTrack(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setActiveTracks((tracks) => {
      if (from >= tracks.length || to >= tracks.length) return tracks;
      const next = [...tracks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setCurrentIndex((idx) => {
      if (idx === from) return to;
      if (from < idx && to >= idx) return idx - 1;
      if (from > idx && to <= idx) return idx + 1;
      return idx;
    });
  }

  function moveTrackUp(index: number) {
    if (index > 0) moveTrack(index, index - 1);
  }

  function moveTrackDown(index: number) {
    if (index < activeTracks.length - 1) moveTrack(index, index + 1);
  }

  function handleLibraryDragStart(key: string, event: React.DragEvent) {
    setDragReorderIndex(null);
    event.dataTransfer.setData(DRAG_MIME, key);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handlePlaylistDragStart(index: number, event: React.DragEvent) {
    setDragReorderIndex(index);
    event.dataTransfer.setData(DRAG_MIME, activeTracks[index] ?? "");
    event.dataTransfer.effectAllowed = "move";
  }

  function handlePlaylistItemDragOver(index: number, event: React.DragEvent) {
    event.preventDefault();
    setDropTargetIndex(index);
  }

  function handleDropOnPlaylist(event: React.DragEvent) {
    event.preventDefault();
    setDropActive(false);
    const key = event.dataTransfer.getData(DRAG_MIME);
    if (!key) {
      setDragReorderIndex(null);
      setDropTargetIndex(null);
      return;
    }

    const targetIndex = dropTargetIndex ?? activeTracks.length;

    if (dragReorderIndex !== null) {
      setActiveTracks((tracks) => {
        const next = [...tracks];
        const [moved] = next.splice(dragReorderIndex, 1);
        if (!moved) return tracks;
        let insertAt = targetIndex;
        if (dragReorderIndex < insertAt) {
          insertAt -= 1;
        }
        insertAt = Math.max(0, Math.min(insertAt, next.length));
        next.splice(insertAt, 0, moved);
        return next;
      });
      setDragReorderIndex(null);
      setDropTargetIndex(null);
      return;
    }

    addTrack(key, targetIndex);
    setDropTargetIndex(null);
  }

  async function handleSave() {
    setError("");
    setMessage("");
    if (!getAuthToken()) {
      setError("Sign in first — playlists require a JWT (Login after OTP verification).");
      return;
    }
    if (!playlistName.trim()) {
      setError("Enter a playlist name before saving.");
      return;
    }
    try {
      const saved = await savePlaylist({
        playlistId: loadedPlaylistId || undefined,
        name: playlistName.trim(),
        trackIds: activeTracks,
      });
      setLoadedPlaylistId(saved.playlistId);
      setMessage(`Saved playlist "${saved.name}" (${saved.playlistId}).`);
      await loadSavedPlaylists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleLoadSelection(playlistId: string) {
    const found = savedPlaylists.find((p) => p.playlistId === playlistId);
    if (!found) return;
    setLoadedPlaylistId(found.playlistId);
    setPlaylistName(found.name);
    setActiveTracks([...found.trackIds]);
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audioRef.current?.pause();
  }

  async function playCurrent() {
    const audio = audioRef.current;
    if (!audio || !currentTrackKey) return;
    await syncAudioElement();

    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Audio failed to load"));
        };
        const cleanup = () => {
          audio.removeEventListener("canplay", onReady);
          audio.removeEventListener("error", onError);
        };
        audio.addEventListener("canplay", onReady, { once: true });
        audio.addEventListener("error", onError, { once: true });
      });
    }

    try {
      await audio.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback blocked");
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }

  function playPrevious() {
    if (activeTracks.length === 0) return;
    autoPlayNextRef.current = isPlayingRef.current;
    setCurrentIndex((idx) => (idx === 0 ? activeTracks.length - 1 : idx - 1));
  }

  function playNext() {
    if (activeTracks.length === 0) return;
    autoPlayNextRef.current = isPlayingRef.current;
    setCurrentIndex((idx) => (idx + 1) % activeTracks.length);
  }

  const handleTrackEnded = useCallback(() => {
    const tracks = activeTracksRef.current;
    if (tracks.length === 0) return;

    const idx = currentIndexRef.current;
    const atLast = idx >= tracks.length - 1;

    if (atLast && !loopPlaylistRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }

    autoPlayNextRef.current = true;
    setCurrentIndex(atLast ? 0 : idx + 1);
  }, []);

  async function downloadLibraryOffline() {
    if (library.length === 0) {
      setError("No library tracks to download.");
      return;
    }
    if (!navigator.onLine) {
      setError("Connect to the internet to download tracks for offline playback.");
      return;
    }

    setOfflineDownloading(true);
    setError("");
    setMessage("");
    setOfflineProgress(`0 / ${library.length}`);

    const items = library.map((item) => ({
      trackId: item.key,
      url: mediaObjectPlaybackUrl(item.key, item.url),
    }));

    try {
      const result = await saveTracksOfflineBulk(items, (progress: OfflineBulkProgress) => {
        setOfflineProgress(`${progress.done} / ${progress.total}`);
      });
      await refreshOfflineCount(library.map((item) => item.key));
      setMessage(
        `Offline library: ${result.saved} saved, ${result.skipped} already cached, ${result.failed} failed.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline download failed");
    } finally {
      setOfflineDownloading(false);
      setOfflineProgress("");
    }
  }

  function handleSeek(seconds: number) {
    setCurrentTime(seconds);
  }

  function handleSeekStart() {
    isSeekingRef.current = true;
  }

  function handleSeekEnd(seconds: number) {
    const audio = audioRef.current;
    if (audio && Number.isFinite(seconds)) {
      audio.currentTime = seconds;
      setCurrentTime(seconds);
    }
    isSeekingRef.current = false;
  }

  function updateDurationFromAudio() {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setDuration(audio.duration);
  }

  return (
    <div className="playlist-builder">
      <header className="playlist-builder__header">
        <h1>Worship Playlist Manager</h1>
        <p>
          Drag audio from the S3 library (<code>media/worship_playlists/</code>) into your
          active playlist — the same song can be added multiple times. Save and load playlists
          with your authenticated account.
        </p>
      </header>

      {loading && <p className="playlist-builder__status">Loading library…</p>}
      {error && <p className="playlist-builder__status playlist-builder__status--error">{error}</p>}
      {message && <p className="playlist-builder__status">{message}</p>}

      <div className="playlist-builder__toolbar">
        <div className="playlist-builder__field">
          <label htmlFor="playlist-name">Playlist name</label>
          <input
            id="playlist-name"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Sunday Service"
          />
        </div>
        <div className="playlist-builder__field">
          <label htmlFor="playlist-load">Load saved</label>
          <select
            id="playlist-load"
            value={loadedPlaylistId}
            onChange={(e) => handleLoadSelection(e.target.value)}
          >
            <option value="">Select a playlist…</option>
            {savedPlaylists.map((p) => (
              <option key={p.playlistId} value={p.playlistId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void handleSave()}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => void loadSavedPlaylists()}>
          Refresh lists
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={offlineDownloading || library.length === 0}
          onClick={() => void downloadLibraryOffline()}
        >
          {offlineDownloading
            ? `Downloading… ${offlineProgress}`
            : `Save library offline (${offlineReadyCount}/${library.length})`}
        </button>
      </div>

      <div className="playlist-builder__grid">
        <section className="playlist-builder__panel" aria-label="Audio library">
          <h2>Audio library</h2>
          <ul className="playlist-builder__list">
            {library.length === 0 ? (
              <li className="playlist-builder__empty">
                No audio in worship_playlists/. On local Docker, run{" "}
                <code>node scripts/upload-worship-playlists.mjs</code> to seed MP3s; on AWS, upload
                files to <code>media/worship_playlists/</code>.
              </li>
            ) : (
              library.map((item) => (
                <li
                  key={item.key}
                  className="playlist-builder__item playlist-builder__item--library"
                  draggable
                  onDragStart={(e) => handleLibraryDragStart(item.key, e)}
                  onDoubleClick={() => addTrack(item.key)}
                >
                  <span className="playlist-builder__item-label">{trackDisplayName(item.key)}</span>
                  <button
                    type="button"
                    className="playlist-builder__icon-btn"
                    title="Add to playlist"
                    aria-label="Add to playlist"
                    onClick={(e) => {
                      e.stopPropagation();
                      addTrack(item.key);
                    }}
                  >
                    <IconAddToPlaylist />
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="playlist-builder__panel" aria-label="Active playlist">
          <h2>Active playlist ({activeTracks.length})</h2>
          <div
            className={`playlist-builder__dropzone${dropActive ? " playlist-builder__dropzone--over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
              if (dropTargetIndex === null) {
                setDropTargetIndex(activeTracks.length);
              }
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDropOnPlaylist}
          >
            <ul className="playlist-builder__list">
              {activeTracks.length === 0 ? (
                <li className="playlist-builder__empty">Drop tracks here to build a playlist.</li>
              ) : (
                activeTracks.map((key, index) => (
                  <li
                    key={`${key}-${index}`}
                    className={`playlist-builder__item${index === currentIndex ? " playlist-builder__item--playing" : ""}${dropTargetIndex === index ? " playlist-builder__item--drop-target" : ""}`}
                    draggable
                    onDragStart={(e) => handlePlaylistDragStart(index, e)}
                    onDragOver={(e) => handlePlaylistItemDragOver(index, e)}
                    onClick={() => setCurrentIndex(index)}
                  >
                    <span className="playlist-builder__item-label">{trackDisplayName(key)}</span>
                    <div className="playlist-builder__item-actions">
                      <button
                        type="button"
                        className="playlist-builder__icon-btn"
                        title="Move up"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTrackUp(index);
                        }}
                      >
                        <IconChevronUp />
                      </button>
                      <button
                        type="button"
                        className="playlist-builder__icon-btn"
                        title="Move down"
                        aria-label="Move down"
                        disabled={index === activeTracks.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTrackDown(index);
                        }}
                      >
                        <IconChevronDown />
                      </button>
                      <button
                        type="button"
                        className="playlist-builder__icon-btn"
                        title="Remove track"
                        aria-label="Remove track"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrack(index);
                        }}
                      >
                        <IconRemove />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>

      <PlaylistControls
        nowPlayingLabel={nowPlayingLabel}
        isPlaying={isPlaying}
        canPlay={Boolean(currentTrackKey)}
        volume={volume}
        playbackRate={playbackRate}
        currentTime={currentTime}
        duration={duration}
        loopPlaylist={loopPlaylist}
        onPlay={() => {
          isPlayingRef.current = true;
          void playCurrent();
        }}
        onPause={() => audioRef.current?.pause()}
        onStop={stopPlayback}
        onPrevious={playPrevious}
        onNext={playNext}
        onVolumeChange={setVolume}
        onSpeedChange={setPlaybackRate}
        onSeek={handleSeek}
        onSeekStart={handleSeekStart}
        onSeekEnd={handleSeekEnd}
        onLoopToggle={() => setLoopPlaylist((loop) => !loop)}
      />

      <audio
        ref={audioRef}
        className="playlist-builder__audio"
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        }}
        onPause={() => {
          const audio = audioRef.current;
          if (audio?.ended) {
            return;
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio || isSeekingRef.current) return;
          setCurrentTime(audio.currentTime);
        }}
        onLoadedMetadata={updateDurationFromAudio}
        onDurationChange={updateDurationFromAudio}
        onEnded={handleTrackEnded}
      />
    </div>
  );
}
