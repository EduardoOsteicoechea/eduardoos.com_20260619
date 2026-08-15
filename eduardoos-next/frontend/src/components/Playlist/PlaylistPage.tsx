/**
 * Music playlists: authenticated list + create-by-name against /api/playlists.
 * Full worship builder / player ports later.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
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

  const refresh = useCallback(async () => {
    const list = await listPlaylists();
    setItems(list);
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
        await refresh();
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const created = await createPlaylist(name);
      setItems((prev) => [created, ...prev]);
      setName("");
      setMessage(`Created “${created.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
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
          Sign in to list and create playlists via <code>GET/POST /api/playlists</code>{" "}
          on the Next backend (memory store today).
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
          Your playlists from <code>/api/playlists</code>. Create by name; track
          builder and player port later.
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
            <li key={item.playlistId} className="playlist-page__item">
              <span className="playlist-page__item-name">{item.name || item.playlistId}</span>
              <span className="playlist-page__item-meta">
                {[
                  item.playlistId.slice(0, 8),
                  `${item.tracks?.length ?? 0} tracks`,
                  item.updatedAt,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
