/**
 * PamphletSettingPanel.tsx — Floating mm input for one preview layout setting.
 */
import { useEffect, useState } from "react";
import "./PamphletSettingPanel.css";

interface PamphletSettingPanelProps {
  open: boolean;
  label: string;
  valueMm: number;
  onSave: (valueMm: number) => void;
  onClose: () => void;
}

export function PamphletSettingPanel({
  open,
  label,
  valueMm,
  onSave,
  onClose,
}: PamphletSettingPanelProps) {
  const [draft, setDraft] = useState(String(valueMm));

  useEffect(() => {
    if (open) {
      setDraft(String(valueMm));
    }
  }, [open, valueMm]);

  if (!open) {
    return null;
  }

  function handleSave() {
    const parsed = Number.parseFloat(draft);
    onSave(Number.isFinite(parsed) ? parsed : valueMm);
    onClose();
  }

  const inputId = `pamphlet-setting-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="pamphlet-setting-panel pamphlet-no-print" role="dialog" aria-label={label}>
      <label className="pamphlet-setting-panel__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="pamphlet-setting-panel__input"
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        aria-label={`${label} (mm)`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <span className="pamphlet-setting-panel__unit">mm</span>
      <div className="pamphlet-setting-panel__actions">
        <button type="button" className="pamphlet-setting-panel__save" onClick={handleSave}>
          Save
        </button>
        <button type="button" className="pamphlet-setting-panel__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default PamphletSettingPanel;
