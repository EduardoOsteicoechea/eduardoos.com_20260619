/**
 * Music hub — dashboard + ?view= sections (spec 045).
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  DashboardGrid,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import PlaylistBuilder from "../PlaylistBuilder/PlaylistBuilder";
import SongRecorder from "../PlaylistBuilder/SongRecorder";
import {
  fetchAudioLibrary,
  uploadWorshipRecording,
  type AudioLibraryItem,
} from "../../lib/mediaLibrary";
import { isPlatformAdmin, getAuthEmailFromToken } from "../../lib/auth";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "../ProductDashboard/ProductDashboard.css";
import "./MusicHub.css";

const MUSIC_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "playlists", label: "Playlist", icon: "queue_music" },
  { id: "free", label: "Free", icon: "library_music" },
  { id: "rec", label: "Rec", icon: "mic" },
  { id: "upload", label: "Upload", icon: "upload_file" },
  { id: "letters", label: "Letters", icon: "lyrics" },
  { id: "manage", label: "Manage", icon: "folder_managed" },
] as const;

const DASH_CARDS = [
  { id: "playlists", title: "Playlists", description: "Build and play worship playlists.", icon: "queue_music" },
  { id: "free", title: "Free Select", description: "Pick any library track freely.", icon: "library_music" },
  { id: "rec", title: "Record", description: "Record a song with the mic.", icon: "mic" },
  { id: "upload", title: "Upload", description: "New song or save a v2.", icon: "upload_file" },
  { id: "letters", title: "Set letters", description: "Lyrics / .emusic letters.", icon: "lyrics" },
  { id: "manage", title: "Manage Songs", description: "Browse the audio library.", icon: "folder_managed" },
];

const AUDIO_ACCEPT =
  "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.webm";

function stemBase(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export default function MusicPage() {
  const [view, setView] = useProductView("dashboard");
  const isAdmin = isPlatformAdmin(getAuthEmailFromToken());
  const [library, setLibrary] = useState<AudioLibraryItem[]>([]);
  const [libError, setLibError] = useState("");
  const [busy, setBusy] = useState(false);

  // Upload new
  const [newTitle, setNewTitle] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);

  // Upload v2
  const [v2SourceKey, setV2SourceKey] = useState("");
  const [v2File, setV2File] = useState<File | null>(null);

  const reloadLibrary = useCallback(async () => {
    try {
      setLibError("");
      const tracks = await fetchAudioLibrary();
      setLibrary(tracks);
    } catch (e) {
      setLibError(e instanceof Error ? e.message : "Could not load library");
    }
  }, []);

  useEffect(() => {
    if (view === "manage" || view === "free" || view === "upload" || view === "letters") {
      void reloadLibrary();
    }
  }, [view, reloadLibrary]);

  async function onUploadNew(e: FormEvent) {
    e.preventDefault();
    if (!newFile || !isAdmin || busy) return;
    setBusy(true);
    try {
      await uploadWorshipRecording(newFile, {
        title: newTitle.trim() || undefined,
        filename: newFile.name,
      });
      setNewTitle("");
      setNewFile(null);
      await reloadLibrary();
      setView("manage");
    } catch (err) {
      openApiErrorModal({
        title: "Music upload failed",
        summary: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onUploadV2(e: FormEvent) {
    e.preventDefault();
    if (!v2File || !v2SourceKey || !isAdmin || busy) return;
    const source = library.find((t) => t.key === v2SourceKey);
    if (!source) return;
    const base = stemBase(source.name);
    const ext = v2File.name.includes(".")
      ? v2File.name.slice(v2File.name.lastIndexOf("."))
      : ".mp3";
    const v2Name = `${base}_v2${ext}`;
    setBusy(true);
    try {
      await uploadWorshipRecording(v2File, {
        title: `${base} v2`,
        filename: v2Name,
      });
      setV2File(null);
      setV2SourceKey("");
      await reloadLibrary();
      setView("manage");
    } catch (err) {
      openApiErrorModal({
        title: "Music v2 upload failed",
        summary: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProductHubShell title={view === "dashboard" ? "Music" : undefined}>
      <ProductHeaderMenu
        menuId="music-product-header-menu"
        items={[...MUSIC_VIEWS]}
        activeId={view}
        onSelect={setView}
      />

      {view === "dashboard" ? (
        <DashboardGrid cards={DASH_CARDS} onSelect={setView} />
      ) : null}

      {view === "playlists" ? <PlaylistBuilder /> : null}

      {view === "rec" ? (
        <section className="music-hub__panel">
          <h2 className="music-hub__h">Record</h2>
          {isAdmin ? (
            <SongRecorder onRecorded={() => void reloadLibrary()} />
          ) : (
            <p className="music-hub__empty">Admin only.</p>
          )}
        </section>
      ) : null}

      {view === "upload" ? (
        <section className="music-hub__panel">
          <h2 className="music-hub__h">Upload</h2>
          {!isAdmin ? (
            <p className="music-hub__empty">Admin only.</p>
          ) : (
            <div className="music-hub__upload-grid">
              <form className="music-hub__upload-card" onSubmit={(e) => void onUploadNew(e)}>
                <h3>New song</h3>
                <p className="music-hub__hint">Upload a complete new track.</p>
                <label className="music-hub__field">
                  <span>Display name</span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Song title"
                    disabled={busy}
                  />
                </label>
                <label className="music-hub__field">
                  <span>Audio file</span>
                  <input
                    type="file"
                    accept={AUDIO_ACCEPT}
                    disabled={busy}
                    onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn--blue"
                  disabled={busy || !newFile}
                >
                  Upload new
                </button>
              </form>

              <form className="music-hub__upload-card" onSubmit={(e) => void onUploadV2(e)}>
                <h3>Version (v2)</h3>
                <p className="music-hub__hint">
                  Select an existing song and save a new audio as its v2.
                </p>
                <label className="music-hub__field">
                  <span>Existing song</span>
                  <select
                    value={v2SourceKey}
                    onChange={(e) => setV2SourceKey(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Select…</option>
                    {library.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="music-hub__field">
                  <span>New audio file</span>
                  <input
                    type="file"
                    accept={AUDIO_ACCEPT}
                    disabled={busy}
                    onChange={(e) => setV2File(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn--green"
                  disabled={busy || !v2File || !v2SourceKey}
                >
                  Save v2
                </button>
              </form>
            </div>
          )}
        </section>
      ) : null}

      {view === "free" || view === "manage" ? (
        <section className="music-hub__panel">
          <h2 className="music-hub__h">
            {view === "free" ? "Free Select" : "Manage Songs"}
          </h2>
          {libError ? <p className="music-hub__error">{libError}</p> : null}
          {library.length === 0 ? (
            <p className="music-hub__empty">No tracks in library.</p>
          ) : (
            <ul className="music-hub__list">
              {library.map((t) => (
                <li key={t.key} className="music-hub__list-item">
                  <a href={t.url} target="_blank" rel="noreferrer">
                    {t.name}
                  </a>
                  <span className="music-hub__meta">{t.size_human || `${t.size} B`}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn" onClick={() => void reloadLibrary()}>
            Refresh
          </button>
        </section>
      ) : null}

      {view === "letters" ? (
        <section className="music-hub__panel">
          <h2 className="music-hub__h">Set letters</h2>
          <p className="music-hub__hint">
            Open a playlist and use the emusic / lyrics controls in Playlist view to set
            letters for tracks. Library below for reference.
          </p>
          <button
            type="button"
            className="btn btn--blue"
            onClick={() => setView("playlists")}
          >
            Go to Playlists
          </button>
          <ul className="music-hub__list">
            {library.map((t) => (
              <li key={t.key} className="music-hub__list-item">
                {stemBase(t.name)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ProductHubShell>
  );
}
