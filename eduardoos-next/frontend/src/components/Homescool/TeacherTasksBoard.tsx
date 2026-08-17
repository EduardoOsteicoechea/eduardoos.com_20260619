/**
 * Teacher Tasks UI — four boards: Pendientes, Accionadas, Listas, Archivadas.
 * Accionadas cards open a grading modal (validate/reject + score 1–10).
 */

import { useCallback, useEffect, useState } from "react";
import {
  archiveStudentTask,
  gradeStudentTask,
  listTeacherStudentTasks,
  taskStatusLabel,
  type HomescoolTask,
  type HomescoolTaskStatus,
} from "../../lib/homescool";
import ScoreBar from "./ScoreBar";
import "./Homescool.css";

const BOARD_ORDER: HomescoolTaskStatus[] = ["pending", "actioned", "ready", "archived"];

type Props = {
  studentSlug: string;
  onChanged?: () => void;
};

export default function TeacherTasksBoard({ studentSlug, onChanged }: Props) {
  const [boards, setBoards] = useState<Record<HomescoolTaskStatus, HomescoolTask[]>>({
    pending: [],
    actioned: [],
    ready: [],
    archived: [],
  });
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<HomescoolTask | null>(null);
  const [score, setScore] = useState(7);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTeacherStudentTasks(studentSlug);
      setBoards({
        pending: data.boards?.pending ?? [],
        actioned: data.boards?.actioned ?? [],
        ready: data.boards?.ready ?? [],
        archived: data.boards?.archived ?? [],
      });
    } catch {
      setBoards({ pending: [], actioned: [], ready: [], archived: [] });
    } finally {
      setLoading(false);
    }
  }, [studentSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onGrade(decision: "validate" | "reject") {
    if (!active) return;
    setBusy(true);
    try {
      await gradeStudentTask(studentSlug, active.id, { decision, score, note });
      setActive(null);
      await reload();
      onChanged?.();
    } catch {
      // modal
    } finally {
      setBusy(false);
    }
  }

  async function onArchive(task: HomescoolTask) {
    setBusy(true);
    try {
      await archiveStudentTask(studentSlug, task.id);
      await reload();
      onChanged?.();
    } catch {
      // modal
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="homescool-tasks">
      <p className="homescool-tasks__legend">
        Four boards for this student. Open an Accionada card to validate or reject with a score (1–10).
      </p>
      {loading ? <p className="homescool-empty">Loading boards…</p> : null}
      <div className="homescool-kanban">
        {BOARD_ORDER.map((status) => (
          <section key={status} className="homescool-kanban__col" aria-label={taskStatusLabel(status)}>
            <h3 className="homescool-kanban__title">
              {taskStatusLabel(status)}
              <span className="homescool-kanban__count">{boards[status].length}</span>
            </h3>
            <div className="homescool-task-board homescool-task-board--stack" role="list">
              {boards[status].map((task) => (
                <article key={task.id} className="homescool-task-card homescool-task-card--static" role="listitem">
                  <span className="homescool-task-card__title">{task.name}</span>
                  <span className="homescool-task-card__meta">
                    {task.startDate || "—"} → {task.endDate || "—"}
                  </span>
                  {task.submission ? (
                    <span className="homescool-task-card__flag">Response received</span>
                  ) : null}
                  {task.grade ? <ScoreBar score={task.grade.score} maxScore={task.maxScore} /> : null}
                  <div className="homescool-task-card__actions">
                    {status === "actioned" ? (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => {
                          setActive(task);
                          setScore(Math.min(7, task.maxScore || 10));
                          setNote("");
                        }}
                      >
                        Grade
                      </button>
                    ) : null}
                    {status === "ready" ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void onArchive(task)}
                      >
                        Archive
                      </button>
                    ) : null}
                    {status === "actioned" || status === "pending" ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setActive(task);
                          setScore(task.grade?.score ?? 7);
                          setNote("");
                        }}
                      >
                        Details
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {active ? (
        <div className="homescool-modal" role="dialog" aria-modal="true" aria-labelledby="grade-modal-title">
          <div className="homescool-modal__panel">
            <header className="homescool-modal__head">
              <h2 id="grade-modal-title" className="homescool-modal__title">
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
                <dt>End</dt>
                <dd>{active.endDate || "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{taskStatusLabel(active.status)}</dd>
              </div>
            </dl>
            <p className="homescool-modal__desc">{active.description || "No description."}</p>
            {active.submission ? (
              <div className="homescool-modal__submission">
                <h3 className="homescool-workspace__aside-title">Student response</h3>
                <pre className="homescool-modal__pre">{active.submission.text || "(no text)"}</pre>
                {active.submission.files?.length ? (
                  <ul className="homescool-file-list">
                    {active.submission.files.map((f) => (
                      <li key={f.key}>
                        {f.name} ({f.size} B)
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="homescool-empty">No response yet.</p>
            )}
            {active.status === "actioned" ? (
              <div className="homescool-form homescool-form--wide">
                <label htmlFor="grade-score">
                  Score (1–{active.maxScore || 10})
                  <input
                    id="grade-score"
                    type="number"
                    min={1}
                    max={active.maxScore || 10}
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    disabled={busy}
                  />
                </label>
                <ScoreBar score={score} maxScore={active.maxScore || 10} />
                <p className="homescool-score-legend">
                  Bands: 1–3 mínimo (red) · 4–5 pobre (yellow) · 6–7 aprobado (pale lime) · 8–10 bueno
                  (green)
                </p>
                <label htmlFor="grade-note">
                  Note (optional)
                  <textarea
                    id="grade-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <div className="product-page__cta-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void onGrade("validate")}
                  >
                    Validate
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void onGrade("reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
