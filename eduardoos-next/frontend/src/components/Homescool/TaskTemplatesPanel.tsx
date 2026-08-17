/**
 * Sidebar card: create reusable task templates.
 * Period, Study area, and Time are dropdowns from the teacher catalogs (not free-text).
 * Max score is always 1–5.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  HOMESCOOL_MAX_SCORE,
  createTaskTemplate,
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
  const [times, setTimes] = useState<HomescoolCatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState("");
  const [studyArea, setStudyArea] = useState("");
  const [durationMin, setDurationMin] = useState(0);
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
      const [p, a, t] = await Promise.all([
        listCatalogEntries("period"),
        listCatalogEntries("study_area"),
        listCatalogEntries("time"),
      ]);
      setPeriods(p.entries ?? []);
      setAreas(a.entries ?? []);
      setTimes(t.entries ?? []);
    } catch {
      setPeriods([]);
      setAreas([]);
      setTimes([]);
    }
  }, []);

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  useEffect(() => {
    void reloadCatalogs();
  }, [reloadCatalogs, catalogsTick]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!period || !studyArea || !durationMin) return;
    setBusy(true);
    try {
      const { template } = await createTaskTemplate({
        name,
        description,
        period,
        studyArea,
        durationMin,
        maxScore,
      });
      if (image) {
        await uploadTemplateImage(template.id, image);
      }
      setName("");
      setDescription("");
      setPeriod("");
      setStudyArea("");
      setDurationMin(0);
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
    Boolean(name.trim()) && Boolean(period) && Boolean(studyArea) && durationMin >= 1;

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
          <label>
            Study area
            <select
              value={studyArea}
              onChange={(e) => setStudyArea(e.target.value)}
              required
              disabled={busy || areas.length === 0}
            >
              <option value="">{areas.length ? "Select study area…" : "Create a study area first"}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time
            <select
              value={durationMin || ""}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              required
              disabled={busy || times.length === 0}
            >
              <option value="">{times.length ? "Select time…" : "Create a time preset first"}</option>
              {times.map((t) => (
                <option key={t.id} value={t.durationMin ?? 0}>
                  {t.label}
                  {t.durationMin ? ` (${t.durationMin} min)` : ""}
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
        {templates.map((tpl) => (
          <li key={tpl.id} className="homescool-templates__item">
            <strong>{tpl.name}</strong>
            <span>
              {[tpl.period, tpl.studyArea].filter(Boolean).join(" · ") || "No period/area"}
              {tpl.durationMin ? ` · ${tpl.durationMin} min` : ""}
            </span>
          </li>
        ))}
        {templates.length === 0 ? <li className="homescool-empty">No templates yet.</li> : null}
      </ul>
    </div>
  );
}
