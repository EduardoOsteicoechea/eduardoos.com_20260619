/**
 * Shared folder sidebar cards + object listing for teacher workspace and student learning.
 */

import { useEffect, useState } from "react";
import {
  HOMESCOOL_FOLDERS,
  folderLabel,
  type HomescoolFolderObject,
  type HomescoolLink,
} from "../../lib/homescool";
import "./Homescool.css";

type FolderLoader = (
  folder: string,
) => Promise<{ objects: HomescoolFolderObject[]; prefix: string }>;

type Props = {
  title: string;
  lead: string;
  link?: HomescoolLink | null;
  loadFolder: FolderLoader;
  /** When true, aside starts expanded but can collapse (learning view). */
  collapsible?: boolean;
  brand?: string;
};

export default function StudentSpaceLayout({
  title,
  lead,
  link,
  loadFolder,
  collapsible = false,
  brand = "Homescool",
}: Props) {
  const [activeFolder, setActiveFolder] = useState<string>(HOMESCOOL_FOLDERS[0]);
  const [objects, setObjects] = useState<HomescoolFolderObject[]>([]);
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await loadFolder(activeFolder);
        if (!cancelled) {
          setObjects(data.objects ?? []);
          setPrefix(data.prefix ?? "");
        }
      } catch {
        if (!cancelled) {
          setObjects([]);
          setPrefix("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFolder, loadFolder]);

  const rootClass = [
    "homescool-workspace",
    collapsible ? "homescool-workspace--learning" : "",
    collapsed ? "homescool-workspace--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <aside className="homescool-workspace__aside" aria-label="Student folders">
        <div className="homescool-workspace__aside-head">
          <p className="homescool-workspace__aside-title">Folders</p>
          {collapsible ? (
            <button
              type="button"
              className="homescool-workspace__collapse"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          ) : null}
        </div>
        {!collapsed ? (
          <div className="homescool-folder-cards" role="list">
            {HOMESCOOL_FOLDERS.map((folder) => (
              <button
                key={folder}
                type="button"
                role="listitem"
                className={`homescool-folder-card${
                  activeFolder === folder ? " homescool-folder-card--active" : ""
                }`}
                onClick={() => setActiveFolder(folder)}
              >
                <span className="homescool-folder-card__label">{folderLabel(folder)}</span>
                <span className="homescool-folder-card__hint">{folder}</span>
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="homescool-workspace__main">
        <p className="homescool-workspace__brand">{brand}</p>
        <h1 className="homescool-workspace__title">{title}</h1>
        <p className="homescool-workspace__lead">{lead}</p>
        {link ? (
          <p className="homescool-form__hint">
            Prefix <code>{link.s3Prefix}</code>
            {prefix ? (
              <>
                {" "}
                · viewing <code>{prefix}</code>
              </>
            ) : null}
          </p>
        ) : null}

        <h2 className="homescool-workspace__aside-title">{folderLabel(activeFolder)}</h2>
        {loading ? <p className="homescool-empty">Loading folder…</p> : null}
        {!loading && objects.length === 0 ? (
          <p className="homescool-empty">This folder is empty. The space is ready for uploads.</p>
        ) : null}
        {!loading && objects.length > 0 ? (
          <ul className="homescool-object-list">
            {objects.map((obj) => (
              <li key={obj.key} className="homescool-object-list__item">
                {obj.url ? (
                  <a href={obj.url} target="_blank" rel="noreferrer">
                    {obj.name}
                  </a>
                ) : (
                  <span>{obj.name}</span>
                )}
                <span>
                  {obj.size} B
                  {obj.lastModified ? ` · ${obj.lastModified.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
