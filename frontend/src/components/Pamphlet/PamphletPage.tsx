/**
 * Pamphlet / EPAM cloud list + create/edit JSON document shell.
 * Full visual pamphlet-generator ports later; this wires /api/epams now.
 */

import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
  createEpam,
  getEpam,
  listEpams,
  updateEpam,
  type EpamDoc,
} from "../../lib/epams";
import "./PamphletPage.css";

export default function PamphletPage() {
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<EpamDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [title, setTitle] = useState("");
  const [bodyJson, setBodyJson] = useState(
    '{\n  "version": 1,\n  "blocks": [{ "type": "paragraph", "text": "" }]\n}',
  );

  const refresh = useCallback(async () => {
    const list = await listEpams();
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load epams");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleCreate() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const doc = await createEpam("Untitled pamphlet");
      setItems((prev) => [doc, ...prev]);
      await openDoc(doc.id);
      setMessage(`Created ${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(id: string) {
    setError("");
    setBusy(true);
    try {
      const doc = await getEpam(id);
      setActiveId(doc.id);
      setTitle(doc.title || "");
      setBodyJson(JSON.stringify(doc.body ?? {}, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open document");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!activeId) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(bodyJson) as Record<string, unknown>;
      } catch {
        throw new Error("Body must be valid JSON");
      }
      const saved = await updateEpam(activeId, { title, body });
      setItems((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setMessage(`Saved ${saved.updatedAt ?? saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section className="pamphlet-page pamphlet-page--gate">
        <p className="pamphlet-page__brand">Documents</p>
        <h1 className="pamphlet-page__title">Pamphlet</h1>
        <p className="pamphlet-page__lead">
          Cloud EPAMs sync through <code>/api/epams</code>. Sign in to list, create, and
          save JSON pamphlet documents. A full visual editor mounts in a later task.
        </p>
        <div className="pamphlet-page__cta-row">
          <a className="btn btn--primary" href={`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.pamphlet)}`}>
            Sign in to open
          </a>
          <a className="btn" href={APP_ROUTES.register}>
            Create account
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="pamphlet-page">
      <aside className="pamphlet-page__list-pane" aria-label="Cloud EPAMs">
        <header className="pamphlet-page__head">
          <h1 className="pamphlet-page__title">Pamphlet</h1>
          <p className="pamphlet-page__lead">
            Cloud documents from the Next EPAM API. Create a JSON shell, edit, and save.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            {busy ? "Working…" : "Create pamphlet"}
          </button>
        </header>
        {loading ? <p className="pamphlet-page__status">Loading…</p> : null}
        {error ? <p className="pamphlet-page__error">{error}</p> : null}
        {message ? <p className="pamphlet-page__status">{message}</p> : null}
        {!loading && items.length === 0 ? (
          <p className="pamphlet-page__status">No cloud pamphlets yet.</p>
        ) : null}
        <ul className="pamphlet-page__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`pamphlet-page__item${activeId === item.id ? " is-active" : ""}`}
                onClick={() => void openDoc(item.id)}
              >
                <span className="pamphlet-page__item-title">{item.title || item.id}</span>
                <span className="pamphlet-page__item-meta">
                  {[item.id.slice(0, 8), item.updatedAt].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="pamphlet-page__editor" aria-label="Document editor">
        {!activeId ? (
          <p className="pamphlet-page__status">Select or create a pamphlet to edit its JSON body.</p>
        ) : (
          <>
            <div className="form-field">
              <label htmlFor="epam-title">Title</label>
              <input
                id="epam-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="form-field">
              <label htmlFor="epam-body">Body JSON</label>
              <textarea
                id="epam-body"
                className="pamphlet-page__textarea"
                value={bodyJson}
                onChange={(e) => setBodyJson(e.target.value)}
                disabled={busy}
                spellCheck={false}
              />
            </div>
            <div className="panel__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void handleSave()}
              >
                Save to cloud
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
