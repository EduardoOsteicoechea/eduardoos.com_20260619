/**
 * Music playlists: list/create + add title/url tracks with HTML5 audio when URL set.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
  addPlaylistTrack,
  createPlaylist,
  listPlaylists,
  type Playlist,
} from "../../lib/playlists";
import "./PlaylistPage.css";

export default function PlaylistPage() {
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");

  const refresh = useCallback(async (): Promise<Playlist[]> => {
    const list = await listPlaylists();
    setItems(list);
    return list;
  }, []);

  useEffect(() => {
    const ok = isAuthenticated();
    setAuthed(ok);
    if (!ok) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await refresh();
        if (!cancelled && list.length > 0) {
          setSelectedId((current) => current || list[0].playlistId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load playlists");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const selected = items.find((p) => p.playlistId === selectedId) ?? null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const created = await createPlaylist(name);
      setItems((prev) => [created, ...prev]);
      setSelectedId(created.playlistId);
      setName("");
      setMessage(`Created “${created.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTrack(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError("Select or create a playlist first.");
      return;
    }
    if (!trackTitle.trim() && !trackUrl.trim()) {
      setError("Enter a track title or URL.");
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const updated = await addPlaylistTrack(selectedId, trackTitle, trackUrl);
      setItems((prev) =>
        prev.map((p) => (p.playlistId === updated.playlistId ? updated : p)),
      );
      setTrackTitle("");
      setTrackUrl("");
      setMessage(`Added track to “${updated.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add track failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section className="playlist-page playlist-page--gate">
        <p className="playlist-page__brand">Media</p>
        <h1 className="playlist-page__title">Music</h1>
        <p className="playlist-page__lead">
          Sign in to list playlists and add tracks via{" "}
          <code>GET/POST /api/playlists</code> on the Next backend (memory store).
        </p>
        <div className="playlist-page__cta-row">
          <a
            className="btn btn--primary"
            href={`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.mediaPlaylist)}`}
          >
            Sign in to sync playlists
          </a>
          <a className="btn" href={APP_ROUTES.mediaGallery}>
            Videos gallery
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="playlist-page">
      <header>
        <p className="playlist-page__brand">Media</p>
        <h1 className="playlist-page__title">Music</h1>
        <p className="playlist-page__lead">
          Create a playlist, add tracks by title/URL, and play any track that
          has a URL with HTML5 audio. Full worship builder ports later.
        </p>
      </header>

      <section className="playlist-page__panel" aria-label="Playlists">
        <form className="playlist-page__create" onSubmit={(e) => void handleCreate(e)}>
          <div className="form-field">
            <label htmlFor="playlist-name">New playlist name</label>
            <input
              id="playlist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday set"
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </form>

        {loading ? <p className="playlist-page__status">Loading…</p> : null}
        {error ? <p className="playlist-page__error">{error}</p> : null}
        {message ? <p className="playlist-page__status">{message}</p> : null}
        {!loading && items.length === 0 ? (
          <p className="playlist-page__status">No playlists yet.</p>
        ) : null}

        <ul className="playlist-page__list">
          {items.map((item) => (
            <li key={item.playlistId}>
              <button
                type="button"
                className={`playlist-page__item${item.playlistId === selectedId ? " playlist-page__item--selected" : ""}`}
                onClick={() => setSelectedId(item.playlistId)}
              >
                <span className="playlist-page__item-name">
                  {item.name || item.playlistId}
                </span>
                <span className="playlist-page__item-meta">
                  {[
                    item.playlistId.slice(0, 8),
                    `${item.tracks?.length ?? 0} tracks`,
                    item.updatedAt,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected ? (
        <section className="playlist-page__panel" aria-label="Tracks">
          <h2 className="playlist-page__section-title">
            Tracks in “{selected.name}”
          </h2>
          <form
            className="playlist-page__track-form"
            onSubmit={(e) => void handleAddTrack(e)}
          >
            <div className="form-field">
              <label htmlFor="track-title">Track title</label>
              <input
                id="track-title"
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)}
                placeholder="Opening song"
                disabled={busy}
              />
            </div>
            <div className="form-field">
              <label htmlFor="track-url">Audio URL (optional)</label>
              <input
                id="track-url"
                value={trackUrl}
                onChange={(e) => setTrackUrl(e.target.value)}
                placeholder="https://…/track.mp3"
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Add track
            </button>
          </form>

          {(selected.tracks?.length ?? 0) === 0 ? (
            <p className="playlist-page__status">No tracks yet — add a title or URL.</p>
          ) : (
            <ul className="playlist-page__tracks">
              {selected.tracks?.map((track) => (
                <li key={track.trackId} className="playlist-page__track">
                  <span className="playlist-page__track-title">{track.title}</span>
                  {track.url ? (
                    <audio
                      className="playlist-page__audio"
                      controls
                      preload="none"
                      src={track.url}
                    >
                      <a href={track.url}>Download audio</a>
                    </audio>
                  ) : (
                    <span className="playlist-page__item-meta">No URL — stub track</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
