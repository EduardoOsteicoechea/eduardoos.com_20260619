/**
 * Teacher sidebar: create Period / Study area catalog entries.
 * Duration is a fixed preset list (not a catalog) — see HOMESCOOL_DURATION_PRESETS.
 * These feed dropdowns on task templates and assign-task filters.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createCatalogEntry,
  listCatalogEntries,
  type HomescoolCatalogEntry,
  type HomescoolCatalogKind,
} from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  onCatalogsChanged?: () => void;
};

type ActiveForm = HomescoolCatalogKind | null;

export default function CatalogsPanel({ onCatalogsChanged }: Props) {
  const [entries, setEntries] = useState<HomescoolCatalogEntry[]>([]);
  const [active, setActive] = useState<ActiveForm>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await listCatalogEntries();
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openForm(kind: HomescoolCatalogKind) {
    setActive(kind);
    setLabel("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!active || !label.trim()) return;
    setBusy(true);
    try {
      await createCatalogEntry({
        kind: active,
        label: label.trim(),
      });
      setLabel("");
      setActive(null);
      await reload();
      onCatalogsChanged?.();
    } catch {
      // ServerErrorModal
    } finally {
      setBusy(false);
    }
  }

  const periods = entries.filter((e) => e.kind === "period");
  const areas = entries.filter((e) => e.kind === "study_area");

  return (
    <div className="homescool-catalogs">
      <div className="homescool-workspace__aside-head">
        <p className="homescool-workspace__aside-title">Catalogs</p>
      </div>
      <div className="homescool-catalogs__actions" role="group" aria-label="Create catalog entries">
        <button type="button" className="btn" onClick={() => openForm("period")} disabled={busy}>
          Period
        </button>
        <button type="button" className="btn" onClick={() => openForm("study_area")} disabled={busy}>
          Study area
        </button>
      </div>

      {active ? (
        <form className="homescool-form homescool-form--compact" onSubmit={onSubmit}>
          <label>
            {active === "period" ? "Period label" : "Study area label"}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={active === "period" ? "e.g. 2026-Q1" : "e.g. science"}
              required
              disabled={busy}
            />
          </label>
          <div className="homescool-catalogs__form-actions">
            <button className="btn btn--primary" type="submit" disabled={busy || !label.trim()}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setActive(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <ul className="homescool-catalogs__summary">
        <li>
          <strong>Periods</strong>
          <span>{periods.length ? periods.map((p) => p.label).join(", ") : "None yet"}</span>
        </li>
        <li>
          <strong>Study areas</strong>
          <span>{areas.length ? areas.map((a) => a.label).join(", ") : "None yet"}</span>
        </li>
      </ul>
    </div>
  );
}
