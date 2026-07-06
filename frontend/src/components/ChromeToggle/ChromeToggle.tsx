/**
 * ChromeToggle.tsx — Compact on/off control matching playlist chrome buttons.
 */
import "./ChromeToggle.css";

interface ChromeToggleProps {
  label: string;
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
}

export function ChromeToggle({ label, active, onChange, disabled = false }: ChromeToggleProps) {
  return (
    <button
      type="button"
      className={`chrome-toggle${active ? " chrome-toggle--on" : ""}`}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!active)}
    >
      <span className="chrome-toggle__label">{label}</span>
    </button>
  );
}

export default ChromeToggle;
