/**
 * Homescool Header Dynamic Menu — mounts into #header-dynamic-menu-host
 * (same pattern as Pamphlet / Instrumentalist). Toggles the Folders sidebar
 * (Portfolio / Period / Skills / Study section / Tasks) on workspace routes.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type HomescoolHeaderMenuProps = {
  foldersOpen: boolean;
  onToggleFolders: () => void;
};

function FoldersIcon() {
  return (
    <svg
      className="header-dynamic-menu__icon header-dynamic-menu__icon--svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4.1l1.6 1.6h8.8A1.75 1.75 0 0 1 21 8.35v9.9A1.75 1.75 0 0 1 19.25 20H4.75A1.75 1.75 0 0 1 3 18.25V6.75z"
        fill="currentColor"
      />
      <path
        d="M6 11h12v1.35H6V11zm0 3.15h8v1.35H6v-1.35z"
        fill="var(--site-body-bg, #f2f3f6)"
      />
    </svg>
  );
}

export default function HomescoolHeaderMenu({
  foldersOpen,
  onToggleFolders,
}: HomescoolHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;

    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "homescool-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

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
