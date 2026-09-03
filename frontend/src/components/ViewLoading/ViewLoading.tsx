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
  /** Smaller min-height for modals, side panes, and inline panels. */
  compact?: boolean;
};

export function ViewLoading({
  label = "Loading",
  labelHidden = false,
  compact = false,
}: ViewLoadingProps) {
  const className = compact ? "view-loading view-loading--compact" : "view-loading";
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="material-symbols-outlined view-loading__icon" aria-hidden="true">
        progress_activity
      </span>
      <span className={labelHidden ? "view-loading__sr" : "view-loading__label"}>{label}</span>
    </div>
  );
}

export default ViewLoading;
