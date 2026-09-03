/**
 * Header Dynamic Menu — optional per-route tool section *inside* Header chrome.
 *
 * Header always renders an empty host in the rail / mobile bar. Product
 * surfaces mount tool buttons into `#header-dynamic-menu-host`.
 *
 * Desktop: stacked vertically in the left rail (after avatar + separator).
 * Phone (spec 062): a single toggle opens a left lateral drawer of HDS actions.
 *
 * Header is `client:only`, so product islands may hydrate first — use
 * `useHeaderDynamicHost` (retry + ready event) when portaling into the host.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import "./HeaderDynamicMenu.css";

/** Stable DOM id for vanilla / island mounts (pamphlet-generator shell). */
export const HEADER_DYNAMIC_MENU_HOST_ID = "header-dynamic-menu-host";

/** Window key used by pamphlet (and future routes) to register the menu root. */
export const HEADER_DYNAMIC_MENU_REGISTER_KEY = "__eduardoosHeaderDynamicMenu";

/** Fired when the HDS host is in the document (Header hydrated). */
export const HDS_HOST_READY_EVENT = "eduardoos:hds-host-ready";

declare global {
  interface Window {
    __eduardoosHeaderDynamicMenu?: HTMLElement | null;
  }
}

const PHONE_DRAWER_MQ = "(max-width: 767.98px)";

/**
 * Resolve `#header-dynamic-menu-host`, retrying until Header mounts (or 8s).
 * Clears `window.__eduardoosHeaderDynamicMenu` on unmount when it matches menuId.
 */
export function useHeaderDynamicHost(menuId: string): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    let intervalId = 0;
    let timeoutId = 0;

    function attach(): boolean {
      const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
      if (!el || cancelled) return false;
      setHost(el);
      return true;
    }

    function onReady() {
      attach();
    }

    if (!attach()) {
      intervalId = window.setInterval(() => {
        if (attach()) {
          window.clearInterval(intervalId);
          window.clearTimeout(timeoutId);
        }
      }, 50);
      timeoutId = window.setTimeout(() => {
        window.clearInterval(intervalId);
      }, 8000);
    }

    window.addEventListener(HDS_HOST_READY_EVENT, onReady);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      window.removeEventListener(HDS_HOST_READY_EVENT, onReady);
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === menuId) {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, [menuId]);

  return host;
}

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
    window.dispatchEvent(new Event(HDS_HOST_READY_EVENT));
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

  const closePhone = () => setPhoneOpen(false);

  return (
    <div
      className={`header-dynamic-menu-shell${phoneOpen ? " header-dynamic-menu-shell--phone-open" : ""}${
        hasTools ? " header-dynamic-menu-shell--has-tools" : ""
      }`}
    >
      <button
        type="button"
        className="header-dynamic-menu__phone-toggle"
        aria-expanded={phoneOpen}
        aria-controls={HEADER_DYNAMIC_MENU_HOST_ID}
        aria-label={phoneOpen ? "Close tools" : "Open tools"}
        title={phoneOpen ? "Close tools" : "Open tools"}
        hidden={!hasTools}
        onClick={() => setPhoneOpen((v) => !v)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {phoneOpen ? "close" : "tune"}
        </span>
      </button>
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
