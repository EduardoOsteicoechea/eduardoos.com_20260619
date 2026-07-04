/**
 * ActivityBar.tsx — Global activity bar for editor-style pages.
 * Mobile: fixed bottom. Tablet/desktop: fixed left below the site header.
 * Optional pinnedButtons stay visible while the rest scroll.
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
  pinnedButtons?: ActivityBarButton[];
  ariaLabel?: string;
}

function renderButton(button: ActivityBarButton) {
  return (
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
  );
}

export function ActivityBar({
  buttons,
  pinnedButtons = [],
  ariaLabel = "Page actions",
}: ActivityBarProps) {
  return (
    <aside
      className="site-activity-bar"
      role="toolbar"
      aria-label={ariaLabel}
    >
      {pinnedButtons.length > 0 ? (
        <div className="site-activity-bar__pinned" aria-label="Primary actions">
          {pinnedButtons.map(renderButton)}
        </div>
      ) : null}
      <div className="site-activity-bar__scroll">
        <div className="site-activity-bar__inner">{buttons.map(renderButton)}</div>
      </div>
    </aside>
  );
}

export default ActivityBar;
