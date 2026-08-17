/**
 * Shared folder sidebar cards + object listing for teacher workspace and student learning.
 * When folder === tasks, swaps the object list for the Tasks board UI.
 */

import { useEffect, useState } from "react";
import {
  HOMESCOOL_FOLDERS,
  folderLabel,
  type HomescoolFolderObject,
  type HomescoolLink,
} from "../../lib/homescool";
import AssignTasksModal from "./AssignTasksModal";
import StudentTasksBoard from "./StudentTasksBoard";
import TaskTemplatesPanel from "./TaskTemplatesPanel";
import TeacherTasksBoard from "./TeacherTasksBoard";
import "./Homescool.css";

type FolderLoader = (
  folder: string,
) => Promise<{ objects: HomescoolFolderObject[]; prefix: string }>;

function folderFromLocation(): string {
  if (typeof window === "undefined") return HOMESCOOL_FOLDERS[0];
  const q = new URLSearchParams(window.location.search).get("folder");
  if (q && (HOMESCOOL_FOLDERS as readonly string[]).includes(q)) return q;
  return HOMESCOOL_FOLDERS[0];
}

function taskIdFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("task")?.trim() ?? "";
}

type Props = {
  title: string;
  lead: string;
  link?: HomescoolLink | null;
  loadFolder: FolderLoader;
  /** When true, aside starts expanded but can collapse (learning view). */
  collapsible?: boolean;
  brand?: string;
  /** Teacher workspace: enable templates + assign + four boards. */
  mode?: "teacher" | "student";
  /** Required for student tasks API (teacher slug). */
  teacherSlug?: string;
  /** Required for teacher tasks API (student slug). */
  studentSlug?: string;
};

export default function StudentSpaceLayout({
  title,
  lead,
  link,
  loadFolder,
  collapsible = false,
  brand = "Homescool",
  mode = "student",
  teacherSlug = "",
  studentSlug = "",
}: Props) {
  const [activeFolder, setActiveFolder] = useState<string>(folderFromLocation);
  const [deepTaskId] = useState<string>(taskIdFromLocation);
  const [objects, setObjects] = useState<HomescoolFolderObject[]>([]);
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tasksTick, setTasksTick] = useState(0);

  useEffect(() => {
    if (activeFolder === "tasks") {
      setLoading(false);
      setObjects([]);
      setPrefix(link ? `${link.s3Prefix}/tasks` : "");
      return;
    }
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
  }, [activeFolder, loadFolder, link, tasksTick]);

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
          <>
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
            {mode === "teacher" ? (
              <div className="homescool-aside-extra">
                <TaskTemplatesPanel onTemplatesChanged={() => setTasksTick((n) => n + 1)} />
              </div>
            ) : null}
          </>
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

        <div className="homescool-workspace__section-head">
          <h2 className="homescool-workspace__aside-title">{folderLabel(activeFolder)}</h2>
          {mode === "teacher" && activeFolder === "tasks" && studentSlug ? (
            <button type="button" className="btn btn--primary" onClick={() => setAssignOpen(true)}>
              Assign tasks
            </button>
          ) : null}
        </div>

        {activeFolder === "tasks" ? (
          mode === "teacher" && studentSlug ? (
            <TeacherTasksBoard
              key={tasksTick}
              studentSlug={studentSlug}
              onChanged={() => setTasksTick((n) => n + 1)}
            />
          ) : mode === "student" && teacherSlug ? (
            <StudentTasksBoard
              key={tasksTick}
              teacherSlug={teacherSlug}
              initialTaskId={deepTaskId}
            />
          ) : (
            <p className="homescool-empty">Tasks board unavailable.</p>
          )
        ) : (
          <>
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
          </>
        )}
      </section>

      {mode === "teacher" && studentSlug ? (
        <AssignTasksModal
          studentSlug={studentSlug}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => setTasksTick((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}
