/**
 * Product hub helpers — ?view= routing + dashboard cards + header dynamic menu (spec 045).
 * HDS buttons are always icon-only Material Symbols (no visible text labels).
 */

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useHeaderDynamicHost } from "../HeaderDynamicMenu/HeaderDynamicMenu";
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
  /** Material Symbol ligature — required on every dashboard card (spec 047). */
  icon: string;
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
          <span className="product-dash__card-head">
            <span
              className="material-symbols-outlined product-dash__card-icon"
              aria-hidden="true"
            >
              {c.icon}
            </span>
            <span className="product-dash__card-title">{c.title}</span>
          </span>
          {c.description ? (
            <span className="product-dash__card-desc">{c.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** HDS item: label is accessibility-only; icon is the only visible chrome. */
export type HeaderMenuItem = {
  id: string;
  label: string;
  /** Google Material Symbols ligature name (required — icon-only, no text). */
  icon: string;
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
  const host = useHeaderDynamicHost(menuId);

  if (!host) return null;

  return createPortal(
    <div
      id={menuId}
      className="header-dynamic-menu product-dash__header-menu"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div
        className="header-dynamic-menu__inner header-dynamic-menu__actions product-dash__header-inner"
        role="toolbar"
        aria-label="Product views"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              className={
                active
                  ? "header-dynamic-menu__btn header-dynamic-menu__btn--active is-active"
                  : "header-dynamic-menu__btn"
              }
              onClick={() => onSelect(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              aria-pressed={active}
            >
              <span
                className="material-symbols-outlined header-dynamic-menu__icon"
                aria-hidden="true"
              >
                {item.icon}
              </span>
            </button>
          );
        })}
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

/** Sectioned dashboard block — each product defines its own sections/cards. */
export function DashboardSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="product-dash__section">
      <h2 className="product-dash__section-title">{title}</h2>
      {children}
    </section>
  );
}
