/**
 * Student Tasks board — pending cards; click opens response modal (text/md + files).
 * Accepts optional shared task list so Learning Home / Calendar stay in sync.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import {
  formatFrequencyLabel,
  formatStudyAreas,
  listLearningTasks,
  submitLearningTask,
  type HomescoolTask,
} from "../../lib/homescool";
import ScoreBar from "./ScoreBar";
import "./Homescool.css";

type Props = {
  teacherSlug: string;
  /** Deep-link from email CTA (?task=…). Opens the response modal when found. */
  initialTaskId?: string;
  /** Shared assignment list; when set, filters pending locally and skips fetch. */
  tasks?: HomescoolTask[];
  loading?: boolean;
  onChanged?: () => void;
  /** Hide legend when embedded under Learning Home. */
  embedded?: boolean;
};

export default function StudentTasksBoard({
  teacherSlug,
  initialTaskId = "",
  tasks: sharedTasks,
  loading: sharedLoading,
  onChanged,
  embedded = false,
}: Props) {
  const controlled = sharedTasks !== undefined;
  const [localTasks, setLocalTasks] = useState<HomescoolTask[]>([]);
  const [localLoading, setLocalLoading] = useState(!controlled);
  const [active, setActive] = useState<HomescoolTask | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [openedDeepLink, setOpenedDeepLink] = useState(false);

  const reload = useCallback(async () => {
    if (controlled) {
      onChanged?.();
      return;
    }
    setLocalLoading(true);
    try {
      const data = await listLearningTasks(teacherSlug, "pending");
      setLocalTasks(data.tasks ?? []);
    } catch {
      setLocalTasks([]);
    } finally {
      setLocalLoading(false);
    }
  }, [controlled, onChanged, teacherSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const tasks = useMemo(() => {
    const source = controlled ? sharedTasks : localTasks;
    return (source ?? []).filter((t) => t.status === "pending");
  }, [controlled, sharedTasks, localTasks]);

  const loading = controlled ? Boolean(sharedLoading) : localLoading;

  useEffect(() => {
    if (openedDeepLink || !initialTaskId || loading) return;
    const match = tasks.find((t) => t.id === initialTaskId);
    if (match) {
      setActive(match);
      setOpenedDeepLink(true);
    }
  }, [initialTaskId, tasks, loading, openedDeepLink]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    setStatus("");
    try {
      await submitLearningTask(teacherSlug, active.id, { text, files });
      setStatus("Response sent. Your teacher can review it now.");
      setActive(null);
      setText("");
      setFiles([]);
      await reload();
    } catch {
      // ServerErrorModal already opened.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="homescool-tasks">
      {!embedded ? (
        <p className="homescool-tasks__legend">
          Pending tasks assigned to you. Open a card to paste text or markdown and attach proof
          files.
        </p>
      ) : (
        <h2 className="homescool-workspace__aside-title">Pending tasks</h2>
      )}
      {status ? <p className="homescool-form__status">{status}</p> : null}
      {loading ? <ViewLoading label="Loading tasks" /> : null}
      {!loading && tasks.length === 0 ? (
        <p className="homescool-empty">No pending tasks right now.</p>
      ) : null}
      <div className="homescool-task-board homescool-task-board--stack" role="list">
        {tasks.map((task) => {
          const areasLabel = formatStudyAreas(task.studyAreas, task.studyArea);
          const freqLabel = formatFrequencyLabel(task.frequency);
          return (
            <button
              key={task.id}
              type="button"
              role="listitem"
              className="homescool-task-card"
              onClick={() => {
                setActive(task);
                setText("");
                setFiles([]);
                setStatus("");
              }}
            >
              <span className="homescool-task-card__title">{task.name}</span>
              <span className="homescool-task-card__meta">
                {task.startDate || "—"} → {task.endDate || "—"}
                {areasLabel ? ` · ${areasLabel}` : ""}
                {` · ${freqLabel}`}
              </span>
              {task.grade?.decision === "reject" && task.grade.score ? (
                <ScoreBar score={task.grade.score} maxScore={task.maxScore} />
              ) : null}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="homescool-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
          <div className="homescool-modal__panel">
            <header className="homescool-modal__head">
              <h2 id="task-modal-title" className="homescool-modal__title">
                {active.name}
              </h2>
              <button type="button" className="btn" onClick={() => setActive(null)} disabled={busy}>
                Close
              </button>
            </header>
            <dl className="homescool-modal__meta">
              <div>
                <dt>Start</dt>
                <dd>{active.startDate || "—"}</dd>
              </div>
              <div>
                <dt>End / conclusion</dt>
                <dd>{active.endDate || "—"}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{active.period || "—"}</dd>
              </div>
              <div>
                <dt>Study areas</dt>
                <dd>{formatStudyAreas(active.studyAreas, active.studyArea) || "—"}</dd>
              </div>
              <div>
                <dt>Frequency</dt>
                <dd>{formatFrequencyLabel(active.frequency)}</dd>
              </div>
              <div>
                <dt>Max score</dt>
                <dd>{active.maxScore}</dd>
              </div>
            </dl>
            <p className="homescool-modal__desc">{active.description || "No description."}</p>
            <form className="homescool-form homescool-form--wide" onSubmit={onSubmit}>
              <label htmlFor="task-response">
                Response (text or markdown)
                <textarea
                  id="task-response"
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your answer or .md content…"
                  disabled={busy}
                />
              </label>
              <label htmlFor="task-files">
                Proof files
                <input
                  id="task-files"
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  disabled={busy}
                />
              </label>
              {files.length > 0 ? (
                <ul className="homescool-file-list">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              ) : null}
              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Submit response"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
