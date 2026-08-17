/**
 * Sidebar card: create reusable task templates.
 * Period and Study area are dropdowns from teacher catalogs.
 * Time is a fixed Spanish preset list (not a catalog) — stored as durationMin.
 * Max score is always 1–5.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  HOMESCOOL_DURATION_PRESETS,
  HOMESCOOL_MAX_SCORE,
  createTaskTemplate,
  formatDurationLabel,
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
  const [studyArea, setStudyArea] = useState("");
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const preset = HOMESCOOL_DURATION_PRESETS.find((p) => p.code === durationCode);
    if (!period || !studyArea || !preset) return;
    setBusy(true);
    try {
      const { template } = await createTaskTemplate({
        name,
        description,
        period,
        studyArea,
        durationMin: preset.minutes,
        maxScore,
      });
      if (image) {
        await uploadTemplateImage(template.id, image);
      }
      setName("");
      setDescription("");
      setPeriod("");
      setStudyArea("");
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
    Boolean(name.trim()) && Boolean(period) && Boolean(studyArea) && Boolean(durationCode);

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
        {templates.map((tpl) => (
          <li key={tpl.id} className="homescool-templates__item">
            <strong>{tpl.name}</strong>
            <span>
              {[tpl.period, tpl.studyArea].filter(Boolean).join(" · ") || "No period/area"}
              {tpl.durationMin ? ` · ${formatDurationLabel(tpl.durationMin)}` : ""}
            </span>
          </li>
        ))}
        {templates.length === 0 ? <li className="homescool-empty">No templates yet.</li> : null}
      </ul>
    </div>
  );
}
