/**
 * Assign tasks modal: period → study areas (multi) → frequency → dates → templates.
 *
 * Frequency is stored on each assigned task. Calendar expands occurrences;
 * boards still show one card per assignment.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  assignStudentTasks,
  formatDurationLabel,
  formatStudyAreas,
  frequencyNeedsEndWindow,
  hasStudyArea,
  listCatalogEntries,
  listTaskTemplates,
  normalizeFrequency,
  suggestRecurrenceEndDate,
  type HomescoolCatalogEntry,
  type HomescoolTaskFrequencyKind,
  type HomescoolTaskTemplate,
} from "../../lib/homescool";
import "./Homescool.css";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

type Props = {
  studentSlug: string;
  open: boolean;
  onClose: () => void;
  onAssigned?: () => void;
};

export default function AssignTasksModal({ studentSlug, open, onClose, onAssigned }: Props) {
  const [templates, setTemplates] = useState<HomescoolTaskTemplate[]>([]);
  const [periods, setPeriods] = useState<HomescoolCatalogEntry[]>([]);
  const [areas, setAreas] = useState<HomescoolCatalogEntry[]>([]);
  const [period, setPeriod] = useState("");
  const [studyAreas, setStudyAreas] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [freqKind, setFreqKind] = useState<HomescoolTaskFrequencyKind>("once");
  const [excludeWeekdays, setExcludeWeekdays] = useState<number[]>([0, 6]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [tplData, periodData, areaData] = await Promise.all([
          listTaskTemplates(),
          listCatalogEntries("period"),
          listCatalogEntries("study_area"),
        ]);
        if (cancelled) return;
        setTemplates(tplData.templates ?? []);
        setPeriods(periodData.entries ?? []);
        setAreas(areaData.entries ?? []);
      } catch {
        if (!cancelled) {
          setTemplates([]);
          setPeriods([]);
          setAreas([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (period && t.period !== period) return false;
      if (studyAreas.length === 0) return true;
      return studyAreas.some((label) => hasStudyArea(t.studyAreas, t.studyArea, label));
    });
  }, [templates, period, studyAreas]);

  function toggleTemplate(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFilterArea(label: string) {
    setStudyAreas((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label);
      return [...prev, label];
    });
  }

  function toggleExcludeDay(day: number) {
    setExcludeWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      return [...prev, day].sort((a, b) => a - b);
    });
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0 || !startDate) return;
    const frequency = normalizeFrequency({
      kind: freqKind,
      excludeWeekdays: freqKind === "daily_except" ? excludeWeekdays : [],
    });
    const resolvedEnd = endDate || startDate;
    if (frequencyNeedsEndWindow(frequency) && resolvedEnd <= startDate) {
      window.alert(
        "Daily frequency needs an End date after Start — that window is what the calendar expands.",
      );
      return;
    }
    setBusy(true);
    try {
      await assignStudentTasks(studentSlug, {
        templateIds: Array.from(selected),
        startDate,
        endDate: resolvedEnd,
        frequency,
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

  const needsEnd = frequencyNeedsEndWindow({ kind: freqKind });
  const canAssign =
    selected.size > 0 &&
    Boolean(startDate) &&
    (!needsEnd || (Boolean(endDate) && endDate > startDate));

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
                onChange={(e) => setPeriod(e.target.value)}
                disabled={busy}
              >
                <option value="">All periods</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="homescool-multiselect" disabled={busy}>
              <legend>Study areas</legend>
              {areas.length === 0 ? (
                <p className="homescool-form__hint">No study areas yet</p>
              ) : (
                <ul className="homescool-multiselect__list" role="group" aria-label="Filter study areas">
                  {areas.map((a) => {
                    const checked = studyAreas.includes(a.label);
                    return (
                      <li key={a.id}>
                        <label className="homescool-multiselect__option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFilterArea(a.label)}
                            disabled={busy}
                          />
                          <span>{a.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="homescool-form__hint">
                {studyAreas.length === 0
                  ? "All areas (no filter)"
                  : `Filtering: ${studyAreas.join(" · ")}`}
              </p>
            </fieldset>
            <label>
              Frequency
              <select
                value={freqKind}
                onChange={(e) => {
                  const next = e.target.value as HomescoolTaskFrequencyKind;
                  setFreqKind(next);
                  if (
                    (next === "daily" || next === "daily_except") &&
                    startDate &&
                    (!endDate || endDate <= startDate)
                  ) {
                    setEndDate(suggestRecurrenceEndDate(startDate));
                  }
                }}
                disabled={busy}
              >
                <option value="once">Specific day (one-shot)</option>
                <option value="daily">Daily</option>
                <option value="daily_except">Daily excluding some days</option>
              </select>
            </label>
            {freqKind === "daily_except" ? (
              <fieldset className="homescool-multiselect" disabled={busy}>
                <legend>Exclude weekdays</legend>
                <ul className="homescool-multiselect__list homescool-multiselect__list--row" role="group">
                  {WEEKDAYS.map((d) => {
                    const checked = excludeWeekdays.includes(d.value);
                    return (
                      <li key={d.value}>
                        <label className="homescool-multiselect__option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleExcludeDay(d.value)}
                            disabled={busy}
                          />
                          <span>{d.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="homescool-form__hint">Checked days are skipped in the calendar window.</p>
              </fieldset>
            ) : null}
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate(next);
                  if (
                    needsEnd &&
                    next &&
                    (!endDate || endDate <= next)
                  ) {
                    setEndDate(suggestRecurrenceEndDate(next));
                  }
                }}
                required
                disabled={busy}
              />
            </label>
            <label>
              End / conclusion{needsEnd ? " (required for daily)" : ""}
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                required={needsEnd}
                disabled={busy}
              />
            </label>
          </div>
          <p className="homescool-form__hint">
            {freqKind === "once"
              ? "One calendar appearance on the start date. End date is the conclusion / due marker."
              : "Start and End define the recurrence window (End must be after Start). Boards keep one card; Calendar expands each occurrence day."}
          </p>
          <div className="homescool-task-board" role="list">
            {filtered.map((tpl) => {
              const on = selected.has(tpl.id);
              const areasLabel = formatStudyAreas(tpl.studyAreas, tpl.studyArea);
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="listitem"
                  className={`homescool-task-card${on ? " homescool-task-card--selected" : ""}`}
                  onClick={() => toggleTemplate(tpl.id)}
                  disabled={busy}
                >
                  <span className="homescool-task-card__title">{tpl.name}</span>
                  <span className="homescool-task-card__meta">
                    {[tpl.period, areasLabel].filter(Boolean).join(" · ")}
                    {tpl.durationMin ? ` · ${formatDurationLabel(tpl.durationMin)}` : ""}
                    {` · max ${tpl.maxScore}`}
                  </span>
                  <span className="homescool-task-card__hint">{on ? "Selected" : "Click to select"}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="homescool-empty">No templates match. Create catalogs and templates in the sidebar first.</p>
            ) : null}
          </div>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !canAssign}
          >
            {busy ? "Assigning…" : `Assign ${selected.size || ""} task(s)`}
          </button>
        </form>
      </div>
    </div>
  );
}
