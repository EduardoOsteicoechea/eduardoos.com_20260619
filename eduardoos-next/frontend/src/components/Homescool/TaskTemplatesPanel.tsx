/**
 * Sidebar card: create reusable task templates.
 * Period is a single catalog dropdown; Study area is a checkbox multi-picker
 * (one or more labels). Time is a fixed Spanish preset list — stored as durationMin.
 * Max score is always 1–5.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  HOMESCOOL_DURATION_PRESETS,
  HOMESCOOL_MAX_SCORE,
  createTaskTemplate,
  formatDurationLabel,
  formatStudyAreas,
  listCatalogEntries,
  listTaskTemplates,
  uploadTemplateImage,
  type HomescoolCatalogEntry,
  type HomescoolTaskTemplate,
} from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  onTemplatesChanged?: () => void;
  /** Bump when catalogs change so dropdowns reload. */
  catalogsTick?: number;
};

export default function TaskTemplatesPanel({ onTemplatesChanged, catalogsTick = 0 }: Props) {
  const [templates, setTemplates] = useState<HomescoolTaskTemplate[]>([]);
  const [periods, setPeriods] = useState<HomescoolCatalogEntry[]>([]);
  const [areas, setAreas] = useState<HomescoolCatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState("");
  const [studyAreas, setStudyAreas] = useState<string[]>([]);
  const [durationCode, setDurationCode] = useState("");
  const [maxScore, setMaxScore] = useState(HOMESCOOL_MAX_SCORE);
  const [image, setImage] = useState<File | null>(null);

  const reloadTemplates = useCallback(async () => {
    try {
      const data = await listTaskTemplates();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  const reloadCatalogs = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        listCatalogEntries("period"),
        listCatalogEntries("study_area"),
      ]);
      setPeriods(p.entries ?? []);
      setAreas(a.entries ?? []);
    } catch {
      setPeriods([]);
      setAreas([]);
    }
  }, []);

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  useEffect(() => {
    void reloadCatalogs();
  }, [reloadCatalogs, catalogsTick]);

  function toggleStudyArea(label: string) {
    setStudyAreas((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label);
      return [...prev, label];
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const preset = HOMESCOOL_DURATION_PRESETS.find((p) => p.code === durationCode);
    if (!period || studyAreas.length === 0 || !preset) return;
    setBusy(true);
    try {
      const { template } = await createTaskTemplate({
        name,
        description,
        period,
        studyAreas,
        durationMin: preset.minutes,
        maxScore,
      });
      if (image) {
        await uploadTemplateImage(template.id, image);
      }
      setName("");
      setDescription("");
      setPeriod("");
      setStudyAreas([]);
      setDurationCode("");
      setMaxScore(HOMESCOOL_MAX_SCORE);
      setImage(null);
      setOpen(false);
      await reloadTemplates();
      onTemplatesChanged?.();
    } catch {
      // ServerErrorModal
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    Boolean(name.trim()) &&
    Boolean(period) &&
    studyAreas.length > 0 &&
    Boolean(durationCode);

  return (
    <div className="homescool-templates">
      <div className="homescool-workspace__aside-head">
        <p className="homescool-workspace__aside-title">Task templates</p>
        <button type="button" className="homescool-workspace__collapse" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "New"}
        </button>
      </div>
      {open ? (
        <form className="homescool-form homescool-form--compact" onSubmit={onCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </label>
          <label>
            Period
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
              disabled={busy || periods.length === 0}
            >
              <option value="">{periods.length ? "Select period…" : "Create a period first"}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="homescool-multiselect" disabled={busy || areas.length === 0}>
            <legend>Study areas</legend>
            {areas.length === 0 ? (
              <p className="homescool-form__hint">Create a study area first</p>
            ) : (
              <ul className="homescool-multiselect__list" role="group" aria-label="Study areas">
                {areas.map((a) => {
                  const checked = studyAreas.includes(a.label);
                  return (
                    <li key={a.id}>
                      <label className="homescool-multiselect__option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudyArea(a.label)}
                          disabled={busy}
                        />
                        <span>{a.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {studyAreas.length > 0 ? (
              <p className="homescool-multiselect__summary">
                Selected: {studyAreas.join(" · ")}
              </p>
            ) : null}
          </fieldset>
          <label>
            Time
            <select
              value={durationCode}
              onChange={(e) => setDurationCode(e.target.value)}
              required
              disabled={busy}
            >
              <option value="">Select time…</option>
              {HOMESCOOL_DURATION_PRESETS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Max score (1–{HOMESCOOL_MAX_SCORE})
            <input
              type="number"
              min={1}
              max={HOMESCOOL_MAX_SCORE}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={busy || !canSave}>
            {busy ? "Saving…" : "Save template"}
          </button>
        </form>
      ) : null}
      <ul className="homescool-templates__list">
        {templates.map((tpl) => {
          const areasLabel = formatStudyAreas(tpl.studyAreas, tpl.studyArea);
          return (
            <li key={tpl.id} className="homescool-templates__item">
              <strong>{tpl.name}</strong>
              <span>
                {[tpl.period, areasLabel].filter(Boolean).join(" · ") || "No period/area"}
                {tpl.durationMin ? ` · ${formatDurationLabel(tpl.durationMin)}` : ""}
              </span>
            </li>
          );
        })}
        {templates.length === 0 ? <li className="homescool-empty">No templates yet.</li> : null}
      </ul>
    </div>
  );
}
