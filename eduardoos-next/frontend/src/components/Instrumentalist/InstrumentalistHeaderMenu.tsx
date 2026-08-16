/**
 * Instrumentalist Header Dynamic Menu — mounts into #header-dynamic-menu-host
 * (same pattern as Pamphlet). Toggle Beliefs / tree canvas open-closed.
 * Does not touch Pamphlet’s menu; only active on /instrumentalist.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  HEADER_DYNAMIC_MENU_HOST_ID,
} from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type InstrumentalistHeaderMenuProps = {
  treeOpen: boolean;
  onToggleTree: () => void;
};

function BeliefsIcon() {
  return (
    <svg
      className="header-dynamic-menu__icon header-dynamic-menu__icon--svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3l7 4v5c0 4.5-3 8.2-7 9.5C8 20.2 5 16.5 5 12V7l7-4zm0 2.2L7 8v4c0 3.3 2.1 6.1 5 7.2 2.9-1.1 5-3.9 5-7.2V8l-5-2.8z"
        fill="currentColor"
      />
      <path d="M11 10h2v5h-2v-5zm0-3h2v2h-2V7z" fill="currentColor" />
    </svg>
  );
}

export default function InstrumentalistHeaderMenu({
  treeOpen,
  onToggleTree,
}: InstrumentalistHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;

    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "instrumentalist-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="instrumentalist-header-menu"
      className="header-dynamic-menu"
      aria-label="Instrumentalist tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div
          className="header-dynamic-menu__actions"
          role="toolbar"
          aria-label="Instrumentalist actions"
        >
          <button
            type="button"
            id="btn-instru-beliefs"
            className={`header-dynamic-menu__btn${treeOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title={treeOpen ? "Close belief tree" : "Open belief tree"}
            aria-label={treeOpen ? "Close belief tree" : "Open belief tree"}
            aria-pressed={treeOpen}
            onClick={onToggleTree}
          >
            <BeliefsIcon />
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
