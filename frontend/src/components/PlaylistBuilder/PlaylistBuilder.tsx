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
import { fetchPlaylists, savePlaylist, type PlaylistRecord } from "../../lib/playlists";
import PlaylistControls from "./PlaylistControls";
import "./PlaylistBuilder.css";

const DRAG_MIME = "application/x-eduardoos-track-key";

export default function PlaylistBuilder() {
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [dragReorderIndex, setDragReorderIndex] = useState<number | null>(null);

  const loadLibrary = useCallback(async () => {
    const tracks = await fetchAudioLibrary();
    setLibrary(tracks);
    const map = new Map<string, string>();
    for (const track of tracks) {
      map.set(track.key, track.url);
    }
    setUrlByKey(map);
  }, []);

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

  const syncAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = playbackRate;
    if (!currentTrackKey) {
      audio.removeAttribute("src");
      return;
    }
    const nextSrc = mediaObjectPlaybackUrl(currentTrackKey, urlByKey.get(currentTrackKey));
    if (audio.src !== new URL(nextSrc, window.location.origin).href) {
      audio.src = nextSrc;
    }
  }, [currentTrackKey, playbackRate, urlByKey, volume]);

  useEffect(() => {
    syncAudioElement();
  }, [syncAudioElement]);

  useEffect(() => {
    if (isPlaying && currentTrackKey) {
      void playCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync audio when track index changes during playback
  }, [currentIndex]);

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

  function addTrack(key: string) {
    if (!key || activeTracks.includes(key)) return;
    setActiveTracks((tracks) => [...tracks, key]);
  }

  function removeTrack(index: number) {
    setActiveTracks((tracks) => tracks.filter((_, i) => i !== index));
    setCurrentIndex((idx) => Math.max(0, Math.min(idx, activeTracks.length - 2)));
  }

  function handleLibraryDragStart(key: string, event: React.DragEvent) {
    event.dataTransfer.setData(DRAG_MIME, key);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handlePlaylistDragStart(index: number, event: React.DragEvent) {
    setDragReorderIndex(index);
    event.dataTransfer.setData(DRAG_MIME, activeTracks[index] ?? "");
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDropOnPlaylist(event: React.DragEvent) {
    event.preventDefault();
    setDropActive(false);
    const key = event.dataTransfer.getData(DRAG_MIME);
    if (!key) return;

    if (dragReorderIndex !== null) {
      setActiveTracks((tracks) => {
        const next = [...tracks];
        const [moved] = next.splice(dragReorderIndex, 1);
        if (!moved) return tracks;
        if (!next.includes(key)) {
          next.push(moved);
        }
        return next;
      });
      setDragReorderIndex(null);
      return;
    }

    addTrack(key);
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
    setIsPlaying(false);
    audioRef.current?.pause();
  }

  async function playCurrent() {
    const audio = audioRef.current;
    if (!audio || !currentTrackKey) return;
    syncAudioElement();
    try {
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback blocked");
    }
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
  }

  function playPrevious() {
    if (activeTracks.length === 0) return;
    setCurrentIndex((idx) => (idx === 0 ? activeTracks.length - 1 : idx - 1));
  }

  function playNext() {
    if (activeTracks.length === 0) return;
    setCurrentIndex((idx) => (idx + 1) % activeTracks.length);
  }

  return (
    <div className="playlist-builder">
      <header className="playlist-builder__header">
        <h1>Worship Playlist Manager</h1>
        <p>
          Drag audio from the S3 library (<code>media/worship_playlists/</code>) into your
          active playlist. Save and load playlists with your authenticated account.
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
                  className="playlist-builder__item"
                  draggable
                  onDragStart={(e) => handleLibraryDragStart(item.key, e)}
                >
                  {trackDisplayName(item.key)}
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
                    className={`playlist-builder__item${index === currentIndex ? " playlist-builder__item--playing" : ""}`}
                    draggable
                    onDragStart={(e) => handlePlaylistDragStart(index, e)}
                    onClick={() => setCurrentIndex(index)}
                  >
                    <span>{trackDisplayName(key)}</span>
                    <button
                      type="button"
                      className="playlist-builder__remove"
                      aria-label="Remove track"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(index);
                      }}
                    >
                      Remove
                    </button>
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
        onPlay={() => void playCurrent()}
        onPause={() => audioRef.current?.pause()}
        onStop={stopPlayback}
        onPrevious={playPrevious}
        onNext={playNext}
        onVolumeChange={setVolume}
        onSpeedChange={setPlaybackRate}
      />

      <audio
        ref={audioRef}
        className="playlist-builder__audio"
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
    </div>
  );
}
