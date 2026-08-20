/**
 * Scrib editor header tools — portal into #header-dynamic-menu-host.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APP_ROUTES } from "../../config/routes";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

export type ScribToolMode = "draw" | "zoom" | "erase";

type ScribHeaderMenuProps = {
  mode: ScribToolMode;
  strokeWidthMm: number;
  canUndo: boolean;
  saving: boolean;
  onDashboard: () => void;
  onToggleZoom: () => void;
  onStrokePlus: () => void;
  onStrokeMinus: () => void;
  onToggleErase: () => void;
  onOpenLayers: () => void;
  onUndo: () => void;
};

function IconDashboard() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h4v7H4v-7zm6 3h10v4H10v-4zm0-3h10v2H10v-2z" />
    </svg>
  );
}

function IconZoom() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5L20.49 19l-5-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M19 13H5v-2h14v2z" />
    </svg>
  );
}

function IconErase() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53 2.81 11.34c-.78-.79-.78-2.05 0-2.84l4.95-4.95c.79-.78 2.05-.78 2.84 0L12 5.76l1.41-1.2c.79-.78 2.05-.78 2.83 0zM5.41 11.34L12 17.92l6.59-6.58L12 4.75 5.41 11.34z" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zm0 9L2 6v2l10 5 10-5V6l-10 5zm0 4L2 10v2l10 5 10-5v-2l-10 5z" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  );
}

export default function ScribHeaderMenu(props: ScribHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;
    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "scrib-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="scrib-header-menu"
      className="header-dynamic-menu"
      aria-label="Scrib tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div className="header-dynamic-menu__actions" role="toolbar" aria-label="Scrib actions">
          <a
            className="header-dynamic-menu__btn"
            href={APP_ROUTES.scrib}
            title="Dashboard"
            aria-label="Ir al dashboard"
            onClick={(e) => {
              e.preventDefault();
              props.onDashboard();
            }}
          >
            <IconDashboard />
          </a>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.mode === "zoom" ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Zoom mode"
            aria-label="Modo zoom"
            aria-pressed={props.mode === "zoom"}
            onClick={props.onToggleZoom}
          >
            <IconZoom />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Aumentar grosor"
            aria-label="Aumentar grosor de trazo"
            onClick={props.onStrokePlus}
          >
            <IconPlus />
          </button>
          <span className="scrib-stroke-widget" title="Grosor (mm)" aria-live="polite">
            {props.strokeWidthMm.toFixed(2)}
          </span>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Reducir grosor"
            aria-label="Reducir grosor de trazo"
            onClick={props.onStrokeMinus}
          >
            <IconMinus />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.mode === "erase" ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Borrador"
            aria-label="Modo borrador"
            aria-pressed={props.mode === "erase"}
            onClick={props.onToggleErase}
          >
            <IconErase />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Capas"
            aria-label="Modal de capas"
            onClick={props.onOpenLayers}
          >
            <IconLayers />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Deshacer"
            aria-label="Revertir última acción"
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            <IconUndo />
          </button>
          {props.saving ? (
            <span className="scrib-save-hint" aria-live="polite">
              …
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
