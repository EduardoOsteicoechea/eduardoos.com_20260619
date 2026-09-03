/**
 * Institutes Header Dynamic Menu — Capita sidebar toggle in #header-dynamic-menu-host
 * (same portal pattern as Homescool Folders).
 *
 * Header mounts with client:only, so this island may hydrate first — retry until
 * the host exists, then portal the toggler into the dynamic section.
 */

import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHeaderDynamicHost } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type CalvinsInstitutesHeaderMenuProps = {
  chaptersOpen: boolean;
  onToggleChapters: () => void;
  /** Spec 051 — return to product dashboard hub. */
  onGoDashboard?: () => void;
};

/** List / chapters glyph — currentColor only (rail language). */
function ChaptersIcon() {
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

export default function CalvinsInstitutesHeaderMenu({
  chaptersOpen,
  onToggleChapters,
  onGoDashboard,
}: CalvinsInstitutesHeaderMenuProps) {
  const host = useHeaderDynamicHost("calvins-institutes-header-menu");

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="calvins-institutes-header-menu"
      className="header-dynamic-menu"
      aria-label="Institutes tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div
          className="header-dynamic-menu__actions"
          role="toolbar"
          aria-label="Institutes actions"
        >
          {onGoDashboard ? (
            <button
              type="button"
              className="header-dynamic-menu__btn"
              title="Dashboard"
              aria-label="Dashboard"
              onClick={onGoDashboard}
            >
              <span
                className="material-symbols-outlined header-dynamic-menu__icon"
                aria-hidden="true"
              >
                dashboard
              </span>
            </button>
          ) : null}
          <button
            type="button"
            id="btn-calvins-chapters"
            className={`header-dynamic-menu__btn${
              chaptersOpen ? " header-dynamic-menu__btn--active is-active" : ""
            }`}
            title={chaptersOpen ? "Hide Capita sidebar" : "Show Capita sidebar"}
            aria-label={chaptersOpen ? "Hide Capita sidebar" : "Show Capita sidebar"}
            aria-pressed={chaptersOpen}
            onClick={onToggleChapters}
          >
            <ChaptersIcon />
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
