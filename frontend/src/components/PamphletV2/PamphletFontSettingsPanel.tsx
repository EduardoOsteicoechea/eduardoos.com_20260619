/**
 * PamphletFontSettingsPanel.tsx — Floating panel for preview font sizes in mm.
 */
import { useEffect, useState } from "react";
import {
  PAMPHLET_FONT_SETTING_DEFINITIONS,
  type PamphletFontSettings,
} from "../../lib/pamphletFontSettings";
import "./PamphletFontSettingsPanel.css";

interface PamphletFontSettingsPanelProps {
  open: boolean;
  settings: PamphletFontSettings;
  onSave: (settings: PamphletFontSettings) => void;
  onClose: () => void;
}

export function PamphletFontSettingsPanel({ open, settings, onSave, onClose }: PamphletFontSettingsPanelProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="pamphlet-font-settings-panel pamphlet-no-print" role="dialog" aria-label="Font sizes">
      {PAMPHLET_FONT_SETTING_DEFINITIONS.map((def) => (
        <label key={def.key} className="pamphlet-font-settings-panel__field" htmlFor={`font-${def.key}`}>
          <span className="pamphlet-font-settings-panel__label">{def.label}</span>
          <input
            id={`font-${def.key}`}
            className="pamphlet-font-settings-panel__input"
            type="number"
            inputMode="decimal"
            step={def.step}
            min={def.min}
            max={def.max}
            aria-label={`${def.label} (mm)`}
            title={def.tooltip}
            value={draft[def.key]}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              setDraft((current) => ({
                ...current,
                [def.key]: Number.isFinite(parsed) ? parsed : current[def.key],
              }));
            }}
          />
          <span className="pamphlet-font-settings-panel__unit">mm</span>
        </label>
      ))}
      <div className="pamphlet-font-settings-panel__actions">
        <button type="button" className="pamphlet-font-settings-panel__save" onClick={handleSave}>
          Save
        </button>
        <button type="button" className="pamphlet-font-settings-panel__close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default PamphletFontSettingsPanel;
