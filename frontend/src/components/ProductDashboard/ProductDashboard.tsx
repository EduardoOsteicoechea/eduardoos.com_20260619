/**
 * Product hub helpers — ?view= routing + dashboard cards + header dynamic menu (spec 045).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";
import "./ProductDashboard.css";

export function readProductView(defaultView: string): string {
  if (typeof window === "undefined") return defaultView;
  const v = new URLSearchParams(window.location.search).get("view");
  return v && v.trim() ? v.trim() : defaultView;
}

export function useProductView(defaultView: string): [string, (next: string) => void] {
  const [view, setViewState] = useState(() => readProductView(defaultView));

  useEffect(() => {
    const onPop = () => setViewState(readProductView(defaultView));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [defaultView]);

  const setView = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      if (!next || next === defaultView) {
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", next);
      }
      window.history.replaceState({}, "", url.toString());
      setViewState(next || defaultView);
    },
    [defaultView],
  );

  return [view, setView];
}

export type DashboardCardItem = {
  id: string;
  title: string;
  description?: string;
};

export function DashboardGrid({
  cards,
  onSelect,
}: {
  cards: DashboardCardItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="product-dash__grid">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="product-dash__card"
          onClick={() => onSelect(c.id)}
        >
          <span className="product-dash__card-title">{c.title}</span>
          {c.description ? (
            <span className="product-dash__card-desc">{c.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export type HeaderMenuItem = {
  id: string;
  label: string;
};

export function ProductHeaderMenu({
  items,
  activeId,
  onSelect,
  menuId,
}: {
  items: HeaderMenuItem[];
  activeId: string;
  onSelect: (id: string) => void;
  menuId: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === menuId) {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, [menuId]);

  if (!host) return null;

  return createPortal(
    <div
      id={menuId}
      className="header-dynamic-menu product-dash__header-menu"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner product-dash__header-inner">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              item.id === activeId
                ? "product-dash__header-btn product-dash__header-btn--active"
                : "product-dash__header-btn"
            }
            onClick={() => onSelect(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={item.id === activeId ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    host,
  );
}

export function ProductHubShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="product-dash">
      {title ? <h1 className="product-dash__title">{title}</h1> : null}
      {children}
    </div>
  );
}
