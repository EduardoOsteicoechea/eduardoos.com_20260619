/**
 * BIM IFC viewer header tools — portal into #header-dynamic-menu-host.
 * Spec 037: Python console control only on /bim/ifc/viewer.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type BimIfcHeaderMenuProps = {
  consoleOpen: boolean;
  onToggleConsole: () => void;
};

function IconConsole() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v12h16V6H4zm2.5 2.5l1.4 1.4L6.5 11.3l1.1 1.1 2.5-2.5L6.5 6.9l-1.1 1.1 1.1 1.5zm5.5 5.5h5v1.5h-5V14z"
      />
    </svg>
  );
}

export default function BimIfcHeaderMenu(props: BimIfcHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;
    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "bim-ifc-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="bim-ifc-header-menu"
      className="header-dynamic-menu"
      aria-label="BIM IFC tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div className="header-dynamic-menu__actions" role="toolbar" aria-label="BIM IFC actions">
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.consoleOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Python console"
            aria-label="Python console"
            aria-pressed={props.consoleOpen}
            onClick={props.onToggleConsole}
          >
            <IconConsole />
            <span className="header-dynamic-menu__label">Python</span>
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
