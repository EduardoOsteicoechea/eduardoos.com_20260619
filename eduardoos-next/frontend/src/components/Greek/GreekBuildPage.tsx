/**
 * Greek /build — cards for image groups (books) under the admin's S3 prefix.
 */

import { useEffect, useState, type FormEvent } from "react";
import {
  createGreekGroup,
  greekGroupWorkspaceHref,
  listGreekGroups,
  type GreekGroup,
} from "../../lib/greek";
import { GreekGateShell, useGreekAdminGate } from "./GreekHubPage";
import "./Greek.css";

export default function GreekBuildPage() {
  const gate = useGreekAdminGate();
  const [groups, setGroups] = useState<GreekGroup[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const items = await listGreekGroups();
    setGroups(items);
  }

  useEffect(() => {
    if (gate !== "allowed") return;
    void refresh();
  }, [gate]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const g = await createGreekGroup(title.trim(), slug.trim() || undefined);
      if (g) {
        setTitle("");
        setSlug("");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <GreekGateShell gate={gate}>
      <div className="greek-page">
        <p className="greek-page__brand">Greek</p>
        <h1 className="greek-page__title">Build</h1>
        <p className="greek-page__lead">
          Each card is a book (image group). Open one to edit chapters, verses,
          words, and letter glyphs.
        </p>

        <form className="greek-build__toolbar" onSubmit={onCreate}>
          <div className="greek-build__field">
            <label htmlFor="greek-group-title">Title</label>
            <input
              id="greek-group-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Genesis"
              required
            />
          </div>
          <div className="greek-build__field">
            <label htmlFor="greek-group-slug">Slug (optional)</label>
            <input
              id="greek-group-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="genesis"
            />
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "New group"}
          </button>
        </form>

        {groups.length === 0 ? (
          <p className="greek-gallery__empty">No groups yet — create one above.</p>
        ) : (
          <ul className="greek-cards">
            {groups.map((g) => (
              <li key={g.slug}>
                <a className="greek-card" href={greekGroupWorkspaceHref(g.slug)}>
                  <h2 className="greek-card__title">{g.title}</h2>
                  <p className="greek-card__meta">
                    {g.slug} · {g.chapterCount || 0} chapters
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GreekGateShell>
  );
}
