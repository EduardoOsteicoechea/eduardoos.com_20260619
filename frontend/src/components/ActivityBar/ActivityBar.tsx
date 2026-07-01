/**
 * ActivityBar.tsx — Global activity bar for editor-style pages.
 * Mobile: fixed bottom. Tablet/desktop: fixed left below the site header.
 * Each button carries its own click handler via the buttons prop.
 */
import type { ReactNode } from "react";
import "./ActivityBar.css";

export interface ActivityBarButton {
  id: string;
  label: string;
  title?: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

interface ActivityBarProps {
  buttons: ActivityBarButton[];
  ariaLabel?: string;
}

export function ActivityBar({
  buttons,
  ariaLabel = "Page actions",
}: ActivityBarProps) {
  return (
    <aside
      className="site-activity-bar"
      role="toolbar"
      aria-label={ariaLabel}
    >
      <div className="site-activity-bar__inner">
        {buttons.map((button) => (
          <button
            key={button.id}
            type="button"
            className={`site-activity-bar__btn${button.active ? " is-active" : ""}`}
            title={button.title ?? button.label}
            aria-label={button.label}
            disabled={button.disabled}
            onClick={button.onClick}
          >
            {button.icon ?? <span className="site-activity-bar__label">{button.label}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}

export default ActivityBar;
