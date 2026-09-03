/**
 * Homescool Header Dynamic Menu — mounts into #header-dynamic-menu-host
 * (same pattern as Pamphlet / Instrumentalist). Toggles the Folders sidebar
 * (Portfolio / Period / Skills / Study section / Tasks) on workspace routes.
 */

import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHeaderDynamicHost } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type HomescoolHeaderMenuProps = {
  foldersOpen: boolean;
  onToggleFolders: () => void;
};

/**
 * Sidebar / folders toggle — left rail + content lines (activity-bar language).
 * Uses currentColor only (same as menu / Beliefs), not a filled folder glyph.
 */
function FoldersIcon() {
  return (
    <svg
      className="header-dynamic-menu__icon header-dynamic-menu__icon--svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3.5 4h5v16h-5V4zm7 1.25h10v1.6H10.5v-1.6zm0 4.15h10v1.6H10.5v-1.6zm0 4.15h10v1.6H10.5v-1.6zm0 4.15h7v1.6h-7v-1.6z"
      />
    </svg>
  );
}

export default function HomescoolHeaderMenu({
  foldersOpen,
  onToggleFolders,
}: HomescoolHeaderMenuProps) {
  const host = useHeaderDynamicHost("homescool-header-menu");

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="homescool-header-menu"
      className="header-dynamic-menu"
      aria-label="Homescool tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div
          className="header-dynamic-menu__actions"
          role="toolbar"
          aria-label="Homescool actions"
        >
          <button
            type="button"
            id="btn-homescool-folders"
            className={`header-dynamic-menu__btn${
              foldersOpen ? " header-dynamic-menu__btn--active is-active" : ""
            }`}
            title={foldersOpen ? "Hide folders sidebar" : "Show folders sidebar"}
            aria-label={foldersOpen ? "Hide folders sidebar" : "Show folders sidebar"}
            aria-pressed={foldersOpen}
            onClick={onToggleFolders}
          >
            <FoldersIcon />
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
