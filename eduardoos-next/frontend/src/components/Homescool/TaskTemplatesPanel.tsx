/**
 * Sidebar card: create reusable task templates (name, period, study area, time, score, description + images).
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createTaskTemplate,
  listTaskTemplates,
  uploadTemplateImage,
  type HomescoolTaskTemplate,
} from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  onTemplatesChanged?: () => void;
};

export default function TaskTemplatesPanel({ onTemplatesChanged }: Props) {
  const [templates, setTemplates] = useState<HomescoolTaskTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState("");
  const [studyArea, setStudyArea] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [maxScore, setMaxScore] = useState(10);
  const [image, setImage] = useState<File | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await listTaskTemplates();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
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
      setDurationMin(30);
      setMaxScore(10);
      setImage(null);
      setOpen(false);
      await reload();
      onTemplatesChanged?.();
    } catch {
      // ServerErrorModal
    } finally {
      setBusy(false);
    }
  }

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
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="e.g. 2026-Q1"
              disabled={busy}
            />
          </label>
          <label>
            Study area
            <input
              value={studyArea}
              onChange={(e) => setStudyArea(e.target.value)}
              placeholder="e.g. science"
              disabled={busy}
            />
          </label>
          <label>
            Time (minutes)
            <input
              type="number"
              min={1}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              disabled={busy}
            />
          </label>
          <label>
            Max score (1–10)
            <input
              type="number"
              min={1}
              max={10}
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
          <button className="btn btn--primary" type="submit" disabled={busy || !name.trim()}>
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
