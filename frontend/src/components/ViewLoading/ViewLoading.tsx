/**
 * Centered view loading state — Material Symbols `progress_activity` spinner
 * (spec 065). Replaces left-stuck “Loading…” / “Checking subscription…” text.
 */

import "./ViewLoading.css";

type ViewLoadingProps = {
  /** Short status for screen readers and optional visible caption. */
  label?: string;
  /** Hide the visible caption (icon + sr-only text only). */
  labelHidden?: boolean;
};

export function ViewLoading({
  label = "Loading",
  labelHidden = false,
}: ViewLoadingProps) {
  return (
    <div className="view-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="material-symbols-outlined view-loading__icon" aria-hidden="true">
        progress_activity
      </span>
      <span className={labelHidden ? "view-loading__sr" : "view-loading__label"}>{label}</span>
    </div>
  );
}

export default ViewLoading;
