import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthEmailFromToken, isApsAdminEmail } from "../../lib/auth";
import { ensureEmusicForLibrary } from "../../lib/emusicCloud";
import {
    buildEmusicsBundle,
    downloadEmusicsBundle,
    EMUSICS_EXTENSION,
    importEmusicsBundle,
    offlineItemsToAudioLibrary,
    readEmusicsFile,
} from "../../lib/emusicsBundle";
import { fetchAudioLibrary, isLocalTrackKey, makeLocalTrackKey, mediaObjectPlaybackUrl, persistableTrackIds, trackDisplayName, type AudioLibraryItem, } from "../../lib/mediaLibrary";
import { countOfflineTracks, getOfflineTrackUrl, revokeOfflineTrackUrl, saveTrackOffline } from "../../lib/offlineAudio";
import { getOfflineLibraryCatalog, saveOfflineLibraryCatalog } from "../../lib/offlineEmusic";
import PlaylistControls from "./PlaylistControls";
import PlaylistLyrics from "./PlaylistLyrics";
import { IconAddToPlaylist, IconChevronDown, IconChevronUp, IconRemove, } from "./PlaylistIcons";
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
    const emusicsFileInputRef = useRef<HTMLInputElement>(null);
    const localBlobUrlsRef = useRef<Map<string, string>>(new Map());
    const loadedTrackKeyRef = useRef<string>("");
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
        try {
            const tracks = await fetchAudioLibrary();
            setLibrary(tracks);
            const map = new Map<string, string>();
            for (const track of tracks) {
                map.set(track.key, track.url);
            }
            setUrlByKey(map);
            await refreshOfflineCount(tracks.map((track) => track.key));

            if (isApsAdminEmail(getAuthEmailFromToken())) {
                void ensureEmusicForLibrary(
                    tracks.map((track) => track.key),
                    (done, total, created) => {
                        if (done === total && created > 0) {
                            setMessage(`Letras: ${created} .emusic nuevos en emusic_files/ (${total} pistas).`);
                        }
                    },
                ).catch(() => undefined);
            }
        } catch (err) {
            // Offline fallback: restore catalog from last .emusics pack / offline save.
            const offlineCatalog = await getOfflineLibraryCatalog();
            if (offlineCatalog.length > 0) {
                const tracks = offlineItemsToAudioLibrary(offlineCatalog);
                setLibrary(tracks);
                setUrlByKey(new Map());
                await refreshOfflineCount(tracks.map((track) => track.key));
                setMessage(`Biblioteca offline: ${tracks.length} pistas desde .emusics / caché local.`);
                return;
            }
            throw err;
        }
    }, [refreshOfflineCount]);
    useEffect(() => {
        void (async () => {
            setLoading(true);
            setError("");
            try {
                await loadLibrary();
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load playlist data");
            }
            finally {
                setLoading(false);
            }
        })();
    }, [loadLibrary]);
    const currentTrackKey = activeTracks[currentIndex] ?? "";
    const nowPlayingLabel = currentTrackKey
        ? `Now playing: ${trackDisplayName(currentTrackKey)}`
        : "No track selected";
    const syncAudioElement = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio)
            return;
        audio.volume = volume;
        audio.playbackRate = playbackRate;
        if (!currentTrackKey) {
            clearBlobUrl();
            loadedTrackKeyRef.current = "";
            audio.removeAttribute("src");
            return;
        }
        // Same track already loaded — keep position (pause/resume must not reload).
        if (
            loadedTrackKeyRef.current === currentTrackKey &&
            audio.src &&
            !audio.error
        ) {
            return;
        }
        const remoteSrc = isLocalTrackKey(currentTrackKey)
            ? (urlByKey.get(currentTrackKey) || "")
            : mediaObjectPlaybackUrl(currentTrackKey, urlByKey.get(currentTrackKey));
        if (!remoteSrc) {
            clearBlobUrl();
            loadedTrackKeyRef.current = "";
            audio.removeAttribute("src");
            return;
        }
        // Local session files play from blob: URLs only — never cached offline.
        if (isLocalTrackKey(currentTrackKey)) {
            clearBlobUrl();
            audio.src = remoteSrc;
            audio.load();
            loadedTrackKeyRef.current = currentTrackKey;
            setCurrentTime(0);
            setDuration(0);
            return;
        }
        // Prefer offline blob when present (works fully offline after .emusics import).
        clearBlobUrl();
        let nextSrc = "";
        const offlineUrl = await getOfflineTrackUrl(currentTrackKey);
        if (offlineUrl) {
            blobUrlRef.current = offlineUrl;
            nextSrc = offlineUrl;
        } else if (navigator.onLine) {
            nextSrc = remoteSrc;
            void saveTrackOffline(currentTrackKey, remoteSrc)
                .then(() => refreshOfflineCount(library.map((item) => item.key)))
                .catch(() => {
            });
        } else {
            loadedTrackKeyRef.current = "";
            audio.removeAttribute("src");
            setError("Track not available offline. Load a .emusics pack or reconnect.");
            return;
        }
        audio.src = nextSrc;
        audio.load();
        loadedTrackKeyRef.current = currentTrackKey;
        setCurrentTime(0);
        setDuration(0);
    }, [clearBlobUrl, currentTrackKey, library, playbackRate, refreshOfflineCount, urlByKey, volume]);
    useEffect(() => {
        void syncAudioElement();
    }, [syncAudioElement]);
    useEffect(() => {
        if (!autoPlayNextRef.current && !isPlayingRef.current)
            return;
        if (!currentTrackKey)
            return;
        autoPlayNextRef.current = false;
        void playCurrent();
    }, [currentIndex, currentTrackKey]);
    useEffect(() => {
        return () => {
            clearBlobUrl();
            for (const url of localBlobUrlsRef.current.values()) {
                URL.revokeObjectURL(url);
            }
            localBlobUrlsRef.current.clear();
        };
    }, [clearBlobUrl]);
    useEffect(() => {
        if (!("mediaSession" in navigator) || !currentTrackKey)
            return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: trackDisplayName(currentTrackKey),
            artist: "Eduardo OS Playlist",
            album: "Worship Playlist",
        });
        navigator.mediaSession.setActionHandler("play", () => void playCurrent());
        navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
    }, [currentTrackKey]);
    function addTrack(key: string, insertAt?: number) {
        if (!key)
            return;
        setActiveTracks((tracks) => {
            const next = [...tracks];
            const index = insertAt === undefined ? next.length : Math.min(insertAt, next.length);
            next.splice(index, 0, key);
            return next;
        });
    }
    function revokeLocalTrack(key: string) {
        if (!isLocalTrackKey(key))
            return;
        const url = localBlobUrlsRef.current.get(key);
        if (url) {
            URL.revokeObjectURL(url);
            localBlobUrlsRef.current.delete(key);
        }
        setUrlByKey((prev) => {
            if (!prev.has(key))
                return prev;
            const next = new Map(prev);
            next.delete(key);
            return next;
        });
    }
    function addLocalAudioFiles(files: FileList | File[]) {
        const list = Array.from(files).filter((file) => file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name));
        if (list.length === 0) {
            setError("Select one or more audio files.");
            return;
        }
        setError("");
        const addedKeys: string[] = [];
        setUrlByKey((prev) => {
            const next = new Map(prev);
            for (const file of list) {
                const key = makeLocalTrackKey(file.name);
                const url = URL.createObjectURL(file);
                localBlobUrlsRef.current.set(key, url);
                next.set(key, url);
                addedKeys.push(key);
            }
            return next;
        });
        setActiveTracks((tracks) => [...tracks, ...addedKeys]);
        setMessage(`Added ${addedKeys.length} local track(s) for this session only (not saved).`);
    }
    function removeTrack(index: number) {
        setActiveTracks((tracks) => {
            const removed = tracks[index];
            if (removed)
                revokeLocalTrack(removed);
            return tracks.filter((_, i) => i !== index);
        });
        setCurrentIndex((idx) => {
            if (idx > index)
                return idx - 1;
            if (idx === index)
                return Math.max(0, idx - 1);
            return idx;
        });
    }
    function moveTrack(from: number, to: number) {
        if (from === to || from < 0 || to < 0)
            return;
        setActiveTracks((tracks) => {
            if (from >= tracks.length || to >= tracks.length)
                return tracks;
            const next = [...tracks];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
        setCurrentIndex((idx) => {
            if (idx === from)
                return to;
            if (from < idx && to >= idx)
                return idx - 1;
            if (from > idx && to <= idx)
                return idx + 1;
            return idx;
        });
    }
    function moveTrackUp(index: number) {
        if (index > 0)
            moveTrack(index, index - 1);
    }
    function moveTrackDown(index: number) {
        if (index < activeTracks.length - 1)
            moveTrack(index, index + 1);
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
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            addLocalAudioFiles(files);
            setDragReorderIndex(null);
            setDropTargetIndex(null);
            return;
        }
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
                if (!moved)
                    return tracks;
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
    async function playCurrent() {
        const audio = audioRef.current;
        if (!audio || !currentTrackKey)
            return;
        // Resume in place when this track is already loaded (pause → play).
        const alreadyLoaded =
            loadedTrackKeyRef.current === currentTrackKey && Boolean(audio.src) && !audio.error;
        if (!alreadyLoaded) {
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
        }
        try {
            await audio.play();
            isPlayingRef.current = true;
            setIsPlaying(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Playback blocked");
        }
    }
    function stopPlayback() {
        const audio = audioRef.current;
        if (!audio)
            return;
        audio.pause();
        audio.currentTime = 0;
        setCurrentTime(0);
        setIsPlaying(false);
    }
    function playPrevious() {
        if (activeTracks.length === 0)
            return;
        autoPlayNextRef.current = isPlayingRef.current;
        setCurrentIndex((idx) => (idx === 0 ? activeTracks.length - 1 : idx - 1));
    }
    function playNext() {
        if (activeTracks.length === 0)
            return;
        autoPlayNextRef.current = isPlayingRef.current;
        setCurrentIndex((idx) => (idx + 1) % activeTracks.length);
    }
    const handleTrackEnded = useCallback(() => {
        const tracks = activeTracksRef.current;
        if (tracks.length === 0)
            return;
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
            key: item.key,
            url: mediaObjectPlaybackUrl(item.key, item.url),
            name: item.name || trackDisplayName(item.key),
            contentType: item.content_type || "audio/mpeg",
        }));
        try {
            const bundle = await buildEmusicsBundle(items, (progress) => {
                setOfflineProgress(`${progress.done} / ${progress.total}`);
            });
            if (bundle.tracks.length === 0) {
                throw new Error("No tracks could be packed into .emusics");
            }
            await saveOfflineLibraryCatalog(
                bundle.tracks.map((track) => ({
                    key: track.key,
                    name: track.name,
                    content_type: track.mime,
                    size: track.size,
                    url: "",
                })),
            );
            downloadEmusicsBundle(bundle);
            await refreshOfflineCount(library.map((item) => item.key));
            setMessage(
                `Offline pack: ${bundle.tracks.length} pistas en IndexedDB + descarga ${EMUSICS_EXTENSION} (audio + .emusic).`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Offline download failed");
        } finally {
            setOfflineDownloading(false);
            setOfflineProgress("");
        }
    }

    async function handleLoadEmusicsFile(fileList: FileList | null): Promise<void> {
        const file = fileList?.[0];
        if (!file) return;
        setOfflineDownloading(true);
        setError("");
        setMessage("");
        setOfflineProgress("0 / ?");
        try {
            const bundle = await readEmusicsFile(file);
            const result = await importEmusicsBundle(bundle, (done, total) => {
                setOfflineProgress(`${done} / ${total}`);
            });
            const tracks = offlineItemsToAudioLibrary(result.library);
            setLibrary(tracks);
            setUrlByKey(new Map());
            await refreshOfflineCount(tracks.map((track) => track.key));
            setMessage(
                `Cargado ${file.name}: ${result.imported} pistas listas offline (audio + letras).`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load .emusics");
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
        if (!audio || !Number.isFinite(audio.duration))
            return;
        setDuration(audio.duration);
    }
    return (<div className="playlist-builder">
      {loading && <p className="playlist-builder__status">Loading library…</p>}
      {error && <p className="playlist-builder__status playlist-builder__status--error">{error}</p>}
      {message && <p className="playlist-builder__status">{message}</p>}

      <div className="playlist-builder__toolbar">
        <button type="button" className="btn btn--secondary" onClick={() => localFileInputRef.current?.click()}>
          Add local audio
        </button>
        <input
          ref={localFileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) {
              addLocalAudioFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <input
          ref={emusicsFileInputRef}
          type="file"
          accept=".emusics,application/json"
          hidden
          onChange={(e) => {
            void handleLoadEmusicsFile(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="playlist-builder__grid">
        <section className="playlist-builder__panel" aria-label="Audio library">
          <h2>Audio library</h2>
          <ul className="playlist-builder__list">
            {library.length === 0 ? (<li className="playlist-builder__empty">
                No audio in worship_playlists/. On local Docker, run{" "}
                <code>node scripts/upload-worship-playlists.mjs</code> to seed MP3s; on AWS, upload
                files to <code>media/worship_playlists/</code>.
              </li>) : (library.map((item) => (<li key={item.key} className="playlist-builder__item playlist-builder__item--library" draggable onDragStart={(e) => handleLibraryDragStart(item.key, e)} onDoubleClick={() => addTrack(item.key)}>
                  <span className="playlist-builder__item-label">{trackDisplayName(item.key)}</span>
                  <button type="button" className="playlist-builder__icon-btn" title="Add to playlist" aria-label="Add to playlist" onClick={(e) => {
                e.stopPropagation();
                addTrack(item.key);
            }}>
                    <IconAddToPlaylist />
                  </button>
                </li>)))}
          </ul>
        </section>

        <section className="playlist-builder__panel" aria-label="Active playlist">
          <h2>Active playlist ({activeTracks.length})</h2>
          <div className={`playlist-builder__dropzone${dropActive ? " playlist-builder__dropzone--over" : ""}`} onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
            if (dropTargetIndex === null) {
                setDropTargetIndex(activeTracks.length);
            }
        }} onDragLeave={() => setDropActive(false)} onDrop={handleDropOnPlaylist}>
            <ul className="playlist-builder__list">
              {activeTracks.length === 0 ? (<li className="playlist-builder__empty">Drop site tracks or local audio files here.</li>) : (activeTracks.map((key, index) => (<li key={`${key}-${index}`} className={`playlist-builder__item${index === currentIndex ? " playlist-builder__item--playing" : ""}${dropTargetIndex === index ? " playlist-builder__item--drop-target" : ""}`} draggable onDragStart={(e) => handlePlaylistDragStart(index, e)} onDragOver={(e) => handlePlaylistItemDragOver(index, e)} onClick={() => setCurrentIndex(index)}>
                    <span className="playlist-builder__item-label">
                      {trackDisplayName(key)}
                      {isLocalTrackKey(key) ? " (local)" : ""}
                    </span>
                    <div className="playlist-builder__item-actions">
                      <button type="button" className="playlist-builder__icon-btn" title="Move up" aria-label="Move up" disabled={index === 0} onClick={(e) => {
                e.stopPropagation();
                moveTrackUp(index);
            }}>
                        <IconChevronUp />
                      </button>
                      <button type="button" className="playlist-builder__icon-btn" title="Move down" aria-label="Move down" disabled={index === activeTracks.length - 1} onClick={(e) => {
                e.stopPropagation();
                moveTrackDown(index);
            }}>
                        <IconChevronDown />
                      </button>
                      <button type="button" className="playlist-builder__icon-btn" title="Remove track" aria-label="Remove track" onClick={(e) => {
                e.stopPropagation();
                removeTrack(index);
            }}>
                        <IconRemove />
                      </button>
                    </div>
                  </li>)))}
            </ul>
          </div>
        </section>
      </div>

      <PlaylistLyrics trackKey={currentTrackKey || null} currentTime={currentTime} />

      <PlaylistControls nowPlayingLabel={nowPlayingLabel} isPlaying={isPlaying} canPlay={Boolean(currentTrackKey)} volume={volume} playbackRate={playbackRate} currentTime={currentTime} duration={duration} loopPlaylist={loopPlaylist} onPlay={() => {
            isPlayingRef.current = true;
            void playCurrent();
        }} onPause={() => audioRef.current?.pause()} onStop={stopPlayback} onPrevious={playPrevious} onNext={playNext} onVolumeChange={setVolume} onSpeedChange={setPlaybackRate} onSeek={handleSeek} onSeekStart={handleSeekStart} onSeekEnd={handleSeekEnd} onLoopToggle={() => setLoopPlaylist((loop) => !loop)} emusicsDownloading={offlineDownloading} emusicsProgress={offlineProgress} emusicsReadyCount={offlineReadyCount} emusicsLibraryCount={library.length} onDownloadEmusics={() => void downloadLibraryOffline()} onLoadEmusics={() => emusicsFileInputRef.current?.click()}/>

      <audio ref={audioRef} className="playlist-builder__audio" preload="metadata" onPlay={() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "playing";
            }
        }} onPause={() => {
            const audio = audioRef.current;
            if (audio?.ended) {
                return;
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
            }
        }} onTimeUpdate={() => {
            const audio = audioRef.current;
            if (!audio || isSeekingRef.current)
                return;
            setCurrentTime(audio.currentTime);
        }} onLoadedMetadata={updateDurationFromAudio} onDurationChange={updateDurationFromAudio} onEnded={handleTrackEnded}/>
    </div>);
}
