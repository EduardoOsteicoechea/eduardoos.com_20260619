/**
 * Assign tasks modal: pick period → study area → select template cards → set dates → assign.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  assignStudentTasks,
  listTaskTemplates,
  type HomescoolTaskTemplate,
} from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  studentSlug: string;
  open: boolean;
  onClose: () => void;
  onAssigned?: () => void;
};

export default function AssignTasksModal({ studentSlug, open, onClose, onAssigned }: Props) {
  const [templates, setTemplates] = useState<HomescoolTaskTemplate[]>([]);
  const [period, setPeriod] = useState("");
  const [studyArea, setStudyArea] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await listTaskTemplates();
        if (!cancelled) setTemplates(data.templates ?? []);
      } catch {
        if (!cancelled) setTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) {
      if (t.period) set.add(t.period);
    }
    return Array.from(set).sort();
  }, [templates]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) {
      if (period && t.period !== period) continue;
      if (t.studyArea) set.add(t.studyArea);
    }
    return Array.from(set).sort();
  }, [templates, period]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (period && t.period !== period) return false;
      if (studyArea && t.studyArea !== studyArea) return false;
      return true;
    });
  }, [templates, period, studyArea]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await assignStudentTasks(studentSlug, {
        templateIds: Array.from(selected),
        startDate,
        endDate,
      });
      setSelected(new Set());
      onAssigned?.();
      onClose();
    } catch {
      // modal
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="homescool-modal" role="dialog" aria-modal="true" aria-labelledby="assign-modal-title">
      <div className="homescool-modal__panel homescool-modal__panel--wide">
        <header className="homescool-modal__head">
          <h2 id="assign-modal-title" className="homescool-modal__title">
            Assign tasks
          </h2>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>
        <form className="homescool-form homescool-form--wide" onSubmit={onAssign}>
          <div className="homescool-assign-filters">
            <label>
              Period
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setStudyArea("");
                }}
                disabled={busy}
              >
                <option value="">All periods</option>
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Study area
              <select
                value={studyArea}
                onChange={(e) => setStudyArea(e.target.value)}
                disabled={busy}
              >
                <option value="">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              End / conclusion
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
          <div className="homescool-task-board" role="list">
            {filtered.map((tpl) => {
              const on = selected.has(tpl.id);
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="listitem"
                  className={`homescool-task-card${on ? " homescool-task-card--selected" : ""}`}
                  onClick={() => toggle(tpl.id)}
                  disabled={busy}
                >
                  <span className="homescool-task-card__title">{tpl.name}</span>
                  <span className="homescool-task-card__meta">
                    {[tpl.period, tpl.studyArea].filter(Boolean).join(" · ")}
                    {tpl.durationMin ? ` · ${tpl.durationMin} min` : ""}
                    {` · max ${tpl.maxScore}`}
                  </span>
                  <span className="homescool-task-card__hint">{on ? "Selected" : "Click to select"}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="homescool-empty">No templates match. Create templates in the sidebar first.</p>
            ) : null}
          </div>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || selected.size === 0}
          >
            {busy ? "Assigning…" : `Assign ${selected.size || ""} task(s)`}
          </button>
        </form>
      </div>
    </div>
  );
}
