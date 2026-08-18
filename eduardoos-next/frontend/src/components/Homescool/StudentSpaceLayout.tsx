/**
 * Shared folder sidebar cards + object listing for teacher workspace and student learning.
 * Student default: Home (calendar on top + pending tasks below), sharing one Dynamo task list.
 * Folders column toggles from Header Dynamic Menu (persisted in localStorage).
 */

import { useCallback, useEffect, useState } from "react";
import {
  HOMESCOOL_FOLDERS,
  HOMESCOOL_STUDENT_FOLDERS,
  folderLabel,
  isHomescoolS3Folder,
  listLearningTasks,
  listTeacherStudentTasks,
  readHomescoolFoldersOpen,
  writeHomescoolFoldersOpen,
  type HomescoolFolderObject,
  type HomescoolLink,
  type HomescoolTask,
} from "../../lib/homescool";
import AssignTasksModal from "./AssignTasksModal";
import CatalogsPanel from "./CatalogsPanel";
import HomescoolHeaderMenu from "./HomescoolHeaderMenu";
import StudentTasksBoard from "./StudentTasksBoard";
import TaskTemplatesPanel from "./TaskTemplatesPanel";
import TeacherTasksBoard from "./TeacherTasksBoard";
import TasksCalendarBoard from "./TasksCalendarBoard";
import "./Homescool.css";

type FolderLoader = (
  folder: string,
) => Promise<{ objects: HomescoolFolderObject[]; prefix: string }>;

function folderFromLocation(mode: "teacher" | "student"): string {
  if (typeof window === "undefined") {
    return mode === "student" ? "overview" : HOMESCOOL_FOLDERS[0];
  }
  const q = new URLSearchParams(window.location.search).get("folder");
  const allowed =
    mode === "student"
      ? (HOMESCOOL_STUDENT_FOLDERS as readonly string[])
      : (HOMESCOOL_FOLDERS as readonly string[]);
  if (q && allowed.includes(q)) return q;
  return mode === "student" ? "overview" : HOMESCOOL_FOLDERS[0];
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
  /** @deprecated Sidebar collapse is always available via Header Dynamic Menu. */
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
  brand = "Homescool",
  mode = "student",
  teacherSlug = "",
  studentSlug = "",
}: Props) {
  const folderList =
    mode === "student" ? HOMESCOOL_STUDENT_FOLDERS : HOMESCOOL_FOLDERS;
  const [activeFolder, setActiveFolder] = useState<string>(() => folderFromLocation(mode));
  const [deepTaskId] = useState<string>(taskIdFromLocation);
  const [objects, setObjects] = useState<HomescoolFolderObject[]>([]);
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tasksTick, setTasksTick] = useState(0);
  const [catalogsTick, setCatalogsTick] = useState(0);
  const [sharedTasks, setSharedTasks] = useState<HomescoolTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    setFoldersOpen(readHomescoolFoldersOpen());
  }, []);

  const reloadSharedTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      if (mode === "teacher" && studentSlug) {
        const data = await listTeacherStudentTasks(studentSlug);
        setSharedTasks(data.tasks ?? []);
      } else if (mode === "student" && teacherSlug) {
        const data = await listLearningTasks(teacherSlug);
        setSharedTasks(data.tasks ?? []);
      } else {
        setSharedTasks([]);
      }
    } catch {
      setSharedTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [mode, studentSlug, teacherSlug]);

  useEffect(() => {
    void reloadSharedTasks();
  }, [reloadSharedTasks, tasksTick]);

  useEffect(() => {
    if (
      activeFolder === "tasks" ||
      activeFolder === "calendar" ||
      activeFolder === "overview"
    ) {
      setLoading(false);
      setObjects([]);
      setPrefix(link ? `${link.s3Prefix}/tasks` : "");
      return;
    }
    if (!isHomescoolS3Folder(activeFolder)) {
      setLoading(false);
      setObjects([]);
      setPrefix("");
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

  const selectFolder = (folder: string) => {
    setActiveFolder(folder);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("folder", folder);
      if (folder !== "tasks") url.searchParams.delete("task");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const toggleFolders = () => {
    setFoldersOpen((prev) => {
      const next = !prev;
      writeHomescoolFoldersOpen(next);
      return next;
    });
  };

  const bumpTasks = () => setTasksTick((n) => n + 1);

  const rootClass = [
    "homescool-workspace",
    mode === "student" ? "homescool-workspace--learning" : "",
    foldersOpen ? "" : "homescool-workspace--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <HomescoolHeaderMenu foldersOpen={foldersOpen} onToggleFolders={toggleFolders} />

      {foldersOpen ? (
        <aside className="homescool-workspace__aside" aria-label="Student folders">
          <div className="homescool-workspace__aside-head">
            <p className="homescool-workspace__aside-title">Folders</p>
          </div>
          <div className="homescool-folder-cards" role="list">
            {folderList.map((folder) => (
              <button
                key={folder}
                type="button"
                role="listitem"
                className={`homescool-folder-card${
                  activeFolder === folder ? " homescool-folder-card--active" : ""
                }`}
                onClick={() => selectFolder(folder)}
              >
                <span className="homescool-folder-card__label">{folderLabel(folder)}</span>
                <span className="homescool-folder-card__hint">{folder}</span>
              </button>
            ))}
          </div>
          {mode === "teacher" ? (
            <div className="homescool-aside-extra">
              <CatalogsPanel onCatalogsChanged={() => setCatalogsTick((n) => n + 1)} />
              <TaskTemplatesPanel
                catalogsTick={catalogsTick}
                onTemplatesChanged={bumpTasks}
              />
            </div>
          ) : null}
        </aside>
      ) : null}

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

        {activeFolder === "overview" && mode === "student" && teacherSlug ? (
          <div className="homescool-learning-home">
            <TasksCalendarBoard
              mode="student"
              teacherSlug={teacherSlug}
              tasks={sharedTasks}
              loading={tasksLoading}
              embedded
            />
            <StudentTasksBoard
              teacherSlug={teacherSlug}
              initialTaskId={deepTaskId}
              tasks={sharedTasks}
              loading={tasksLoading}
              onChanged={bumpTasks}
              embedded
            />
          </div>
        ) : activeFolder === "tasks" ? (
          mode === "teacher" && studentSlug ? (
            <TeacherTasksBoard
              key={tasksTick}
              studentSlug={studentSlug}
              onChanged={bumpTasks}
            />
          ) : mode === "student" && teacherSlug ? (
            <StudentTasksBoard
              teacherSlug={teacherSlug}
              initialTaskId={deepTaskId}
              tasks={sharedTasks}
              loading={tasksLoading}
              onChanged={bumpTasks}
            />
          ) : (
            <p className="homescool-empty">Tasks board unavailable.</p>
          )
        ) : activeFolder === "calendar" ? (
          <TasksCalendarBoard
            mode={mode}
            teacherSlug={teacherSlug}
            studentSlug={studentSlug}
            tasks={sharedTasks}
            loading={tasksLoading}
          />
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
          onAssigned={bumpTasks}
        />
      ) : null}
    </div>
  );
}
