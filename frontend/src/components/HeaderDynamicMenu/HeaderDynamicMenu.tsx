/**
 * Header Dynamic Menu — optional per-route tool section *inside* Header chrome.
 *
 * Header always renders an empty host in the rail / mobile bar. Product
 * surfaces (Pamphlet, Instrumentalist, Homescool) mount tool buttons into
 * `#header-dynamic-menu-host`.
 * Music keeps the bottom Activity Bar and does not use this host.
 *
 * Desktop: stacked vertically in the 60px left rail (after avatar + separator).
 * Phone (spec 062): a single toggle opens a left lateral drawer of HDS actions
 * so tools do not overflow the top bar; tablet/desktop keep the rail layout.
 *
 * Important: vanilla mounts (pamphlet-generator) own the menu DOM. React must
 * not discard those nodes on Header re-renders — useLayoutEffect re-attaches
 * any registered menu element after each commit.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

const PHONE_DRAWER_MQ = "(max-width: 767.98px)";

export default function HeaderDynamicMenu() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hasTools, setHasTools] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const syncHasTools = useCallback(() => {
    const host = hostRef.current;
    if (!host) {
      setHasTools(false);
      return;
    }
    setHasTools(host.childElementCount > 0);
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const menu = window.__eduardoosHeaderDynamicMenu;
    if (menu && menu.parentElement !== host) {
      host.replaceChildren(menu);
    }
    syncHasTools();
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new MutationObserver(() => {
      syncHasTools();
    });
    observer.observe(host, { childList: true });
    syncHasTools();
    return () => observer.disconnect();
  }, [syncHasTools]);

  useEffect(() => {
    if (!hasTools) setPhoneOpen(false);
  }, [hasTools]);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_DRAWER_MQ);
    const onChange = () => {
      if (!mq.matches) setPhoneOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!phoneOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhoneOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phoneOpen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !phoneOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button.header-dynamic-menu__btn")) {
        window.setTimeout(() => setPhoneOpen(false), 0);
      }
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [phoneOpen]);

  const closePhone = () => setPhoneOpen(false);

  return (
    <div
      className={`header-dynamic-menu-shell${phoneOpen ? " header-dynamic-menu-shell--phone-open" : ""}${
        hasTools ? " header-dynamic-menu-shell--has-tools" : ""
      }`}
    >
      {hasTools ? (
        <button
          type="button"
          className="header-dynamic-menu__phone-toggle"
          aria-expanded={phoneOpen}
          aria-controls={HEADER_DYNAMIC_MENU_HOST_ID}
          aria-label={phoneOpen ? "Close tools" : "Open tools"}
          title={phoneOpen ? "Close tools" : "Open tools"}
          onClick={() => setPhoneOpen((v) => !v)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {phoneOpen ? "close" : "tune"}
          </span>
        </button>
      ) : null}
      <div
        className="header-dynamic-menu__phone-backdrop"
        hidden={!phoneOpen}
        aria-hidden="true"
        onClick={closePhone}
      />
      <div
        ref={hostRef}
        id={HEADER_DYNAMIC_MENU_HOST_ID}
        className={`header-dynamic-menu-host${phoneOpen ? " header-dynamic-menu-host--phone-open" : ""}`}
        data-header-dynamic-menu-host=""
      />
    </div>
  );
}
