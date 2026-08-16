/**
 * Header Dynamic Menu — optional per-route control strip in header chrome.
 *
 * Header always renders an empty host. Product surfaces (Pamphlet) mount their
 * tool buttons into `#header-dynamic-menu-host`. Music keeps the bottom
 * Activity Bar and does not use this host.
 *
 * Layout: horizontal strip with overflow-x: auto when controls do not fit.
 * Desktop: adjacent to the left rail (after --header_width). Mobile: below
 * the top bar.
 *
 * Important: vanilla mounts (pamphlet-generator) own the menu DOM. React must
 * not discard those nodes on Header re-renders — useLayoutEffect re-attaches
 * any registered menu element after each commit.
 */

import { useLayoutEffect, useRef } from "react";
import "./HeaderDynamicMenu.css";

/** Stable DOM id for vanilla / island mounts (pamphlet-generator shell). */
export const HEADER_DYNAMIC_MENU_HOST_ID = "header-dynamic-menu-host";

/** Window key used by pamphlet (and future routes) to register the menu root. */
export const HEADER_DYNAMIC_MENU_REGISTER_KEY = "__eduardoosHeaderDynamicMenu";

declare global {
  interface Window {
    __eduardoosHeaderDynamicMenu?: HTMLElement | null;
  }
}

export default function HeaderDynamicMenu() {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const menu = window.__eduardoosHeaderDynamicMenu;
    if (menu && menu.parentElement !== host) {
      host.replaceChildren(menu);
    }
  });

  return (
    <div
      ref={hostRef}
      id={HEADER_DYNAMIC_MENU_HOST_ID}
      className="header-dynamic-menu-host"
      data-header-dynamic-menu-host=""
    />
  );
}
