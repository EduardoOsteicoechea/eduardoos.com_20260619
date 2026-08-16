/**
 * Global Activity Bar — fixed bottom chrome for Eduardo OS product surfaces.
 *
 * Primary consumer: Music (PlaylistControls) multi-row transport.
 * Pamphlet uses Header Dynamic Menu in header chrome instead.
 *
 * Layouts:
 * - multi-row: optional top row (scrubber / continuous control) + actions row
 * - single-row: icon actions only (available for other surfaces)
 *
 * Optional expandable tray mirrors Music volume/settings overflow.
 * Tokens: --site-* from theme.css. Plain CSS only.
 */

import type { ReactNode } from "react";
import "./ActivityBar.css";

export type ActivityBarLayout = "multi-row" | "single-row";

export interface ActivityBarProps {
  /** Accessible name for the chrome region */
  label: string;
  layout?: ActivityBarLayout;
  /** Top row content (seek bar, etc.). Shown when layout is multi-row. */
  topRow?: ReactNode;
  /** Primary control buttons / controls row */
  actions: ReactNode;
  /** Expandable secondary panel */
  tray?: ReactNode;
  trayOpen?: boolean;
  trayId?: string;
  trayLabel?: string;
  className?: string;
}

export default function ActivityBar({
  label,
  layout = "single-row",
  topRow,
  actions,
  tray,
  trayOpen = false,
  trayId,
  trayLabel = "Additional controls",
  className = "",
}: ActivityBarProps) {
  const layoutClass =
    layout === "multi-row" ? "activity-bar--multi-row" : "activity-bar--single-row";
  const openClass = trayOpen ? " activity-bar--tray-open" : "";
  const extra = className ? ` ${className}` : "";

  return (
    <section
      className={`activity-bar ${layoutClass}${openClass}${extra}`}
      aria-label={label}
    >
      <div className="activity-bar__inner">
        {layout === "multi-row" && topRow ? (
          <div className="activity-bar__top">{topRow}</div>
        ) : null}
        <div className="activity-bar__deck">
          <div className="activity-bar__actions">{actions}</div>
        </div>
        {tray ? (
          <div
            id={trayId}
            className={`activity-bar__tray${trayOpen ? " activity-bar__tray--open" : ""}`}
            role="region"
            aria-label={trayLabel}
            hidden={!trayOpen}
          >
            {tray}
          </div>
        ) : null}
      </div>
    </section>
  );
}
