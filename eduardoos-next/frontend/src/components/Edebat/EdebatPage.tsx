/**
 * Minimal Edebat UI: list debates, create by topic, view turns, append a turn.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated } from "../../lib/auth";
import {
  addEdebatTurn,
  createEdebat,
  getEdebat,
  listEdebats,
  type EdebatDocument,
} from "../../lib/edebat";
import "./EdebatPage.css";

const ROLE_OPTIONS = ["challenger", "opponent", "referee"] as const;

export default function EdebatPage() {
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<EdebatDocument[]>([]);
  const [active, setActive] = useState<EdebatDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const [role, setRole] = useState<string>(ROLE_OPTIONS[0]);
  const [text, setText] = useState("");

  const refresh = useCallback(async (): Promise<EdebatDocument[]> => {
    const list = await listEdebats();
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
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load debates");
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
      const created = await createEdebat(topic);
      setItems((prev) => [created, ...prev]);
      setActive(created);
      setTopic("");
      setMessage(`Created “${created.topic}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function openDebate(id: string) {
    setError("");
    setBusy(true);
    try {
      const doc = await getEdebat(id);
      setActive(doc);
      setMessage(`Opened “${doc.topic}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open debate");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTurn(e: FormEvent) {
    e.preventDefault();
    if (!active?.id) {
      setError("Select or create a debate first.");
      return;
    }
    if (!text.trim()) {
      setError("Enter turn text.");
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const updated = await addEdebatTurn(active.id, role, text);
      setActive(updated);
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setText("");
      setMessage("Turn added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add turn failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section className="edebat-page edebat-page--gate">
        <p className="edebat-page__brand">Personal</p>
        <h1 className="edebat-page__title">Debate App</h1>
        <p className="edebat-page__lead">
          Sign in to create debates, list yours, and append role+text turns. Documents use the{" "}
          <code>.edebat</code> format via <code>/api/edebat</code> (in-memory on Next).
        </p>
        <div className="edebat-page__cta-row">
          <a
            className="btn btn--primary"
            href={`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.debateApp)}`}
          >
            Sign in to debate
          </a>
          <a className="btn" href={APP_ROUTES.register}>
            Create account
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="edebat-page">
      <aside className="edebat-page__list-pane" aria-label="Your debates">
        <header className="edebat-page__head">
          <h1 className="edebat-page__title">Debate App</h1>
          <p className="edebat-page__lead">
            Debates as <code>.edebat</code> documents (memory store): create a topic, open it, add
            turns.
          </p>
          <form className="edebat-page__create" onSubmit={(e) => void handleCreate(e)}>
            <div className="form-field">
              <label htmlFor="edebat-topic">Topic</label>
              <input
                id="edebat-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Debate topic"
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Working…" : "Create debate"}
            </button>
          </form>
        </header>
        {loading ? <p className="edebat-page__status">Loading…</p> : null}
        {error ? <p className="edebat-page__error">{error}</p> : null}
        {message ? <p className="edebat-page__status">{message}</p> : null}
        {!loading && items.length === 0 ? (
          <p className="edebat-page__status">No debates yet.</p>
        ) : null}
        <ul className="edebat-page__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`edebat-page__item${active?.id === item.id ? " is-active" : ""}`}
                onClick={() => void openDebate(item.id)}
                disabled={busy}
              >
                <span className="edebat-page__item-title">{item.topic}</span>
                <span className="edebat-page__item-meta">
                  {[item.id.slice(0, 8), `${item.turns?.length ?? 0} turns`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="edebat-page__detail" aria-label="Debate turns">
        {!active ? (
          <p className="edebat-page__status">Select or create a debate to view turns.</p>
        ) : (
          <>
            <h2 className="edebat-page__detail-title">{active.topic}</h2>
            <p className="edebat-page__item-meta">
              {active.id.slice(0, 8)}
              {active.updatedAt ? ` · ${active.updatedAt}` : ""}
            </p>
            <ol className="edebat-page__turns">
              {(active.turns ?? []).length === 0 ? (
                <li className="edebat-page__status">No turns yet — add the first below.</li>
              ) : (
                (active.turns ?? []).map((turn, idx) => (
                  <li key={`${turn.at}-${idx}`} className="edebat-page__turn">
                    <span className="edebat-page__turn-role">{turn.role}</span>
                    <p className="edebat-page__turn-text">{turn.text}</p>
                    {turn.at ? <time className="edebat-page__turn-at">{turn.at}</time> : null}
                  </li>
                ))
              )}
            </ol>
            <form className="edebat-page__turn-form" onSubmit={(e) => void handleAddTurn(e)}>
              <div className="form-field">
                <label htmlFor="edebat-role">Role</label>
                <select
                  id="edebat-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="edebat-text">Text</label>
                <textarea
                  id="edebat-text"
                  className="edebat-page__textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                  rows={4}
                  placeholder="Your argument or reply"
                />
              </div>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Add turn
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
