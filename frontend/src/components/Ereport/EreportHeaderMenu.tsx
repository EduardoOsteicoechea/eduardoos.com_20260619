/**
 * eReport editor tools — portal into #header-dynamic-menu-host.
 * Tracker topbar actions + Hub / Tema / Guardar / Compartir / Historial live here
 * so the iframe has no own chrome bar (spec 025 §4 amend 2026-09-03).
 */

import { useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APP_ROUTES } from "../../config/routes";
import type { EreportHistoryCard, EreportMeta } from "../../lib/ereport";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";
import "./Ereport.css";

export type EreportModalKind = "hub" | "tema" | "save" | "share" | "historial" | null;

/** Commands forwarded to the Issue Tracker iframe via postMessage. */
export type EreportTrackerCommand =
  | "tutorial"
  | "toggle-sidebar"
  | "font-up"
  | "font-down"
  | "upload"
  | "clear-all"
  | "progress"
  | "save-export";

type EreportHeaderMenuProps = {
  ownerSafe: string;
  tema: string;
  onTemaChange: (v: string) => void;
  onSaveTema: () => void | Promise<void>;
  onSaveCloud: () => void | Promise<void>;
  saving: boolean;
  canShare: boolean;
  /** Owner-only API overwrite history (flat reports). */
  canHistory: boolean;
  historyItems: EreportHistoryCard[];
  historyLoading: boolean;
  onLoadHistory: () => void | Promise<void>;
  onRestoreHistory: (snapshotId: string) => void | Promise<void>;
  historyBusy: boolean;
  meta: EreportMeta | null;
  shareInput: string;
  onShareInputChange: (v: string) => void;
  onAddShare: (e: FormEvent) => void | Promise<void>;
  onRemoveShare: (email: string) => void | Promise<void>;
  busyShare: boolean;
  error: string;
  modal: EreportModalKind;
  onOpenModal: (m: EreportModalKind) => void;
  onCloseModal: () => void;
  /** Tracker tools formerly in the iframe topbar. */
  onTrackerCommand: (command: EreportTrackerCommand) => void;
  sidebarCollapsed: boolean;
};

function MsIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined header-dynamic-menu__icon" aria-hidden>
      {name}
    </span>
  );
}

function IconHub() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h4v7H4v-7zm6 3h10v4H10v-4zm0-3h10v2H10v-2z" />
    </svg>
  );
}

function IconTema() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.41l-2.34-2.34a1.003 1.003 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
      />
    </svg>
  );
}

function IconShare() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
      />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 117 7 6.9 6.9 0 01-4.05-1.3l-1.43 1.45A9 9 0 1013 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
      />
    </svg>
  );
}

export default function EreportHeaderMenu(props: EreportHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;
    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "ereport-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

  const hubHref = props.meta
    ? APP_ROUTES.ereportUser(props.meta.ownerSafe)
    : APP_ROUTES.ereportUser(props.ownerSafe);

  const menu: ReactNode = host ? (
    <section
      id="ereport-header-menu"
      className="header-dynamic-menu"
      aria-label="eReport tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div className="header-dynamic-menu__actions" role="toolbar" aria-label="eReport actions">
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Cómo usarla"
            aria-label="Tutorial"
            onClick={() => props.onTrackerCommand("tutorial")}
          >
            <MsIcon name="help" />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.sidebarCollapsed ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Mostrar/ocultar sidebar"
            aria-label="Sidebar"
            aria-pressed={props.sidebarCollapsed}
            onClick={() => props.onTrackerCommand("toggle-sidebar")}
          >
            <MsIcon name="view_sidebar" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Agrandar fuente"
            aria-label="Agrandar fuente"
            onClick={() => props.onTrackerCommand("font-up")}
          >
            <MsIcon name="text_increase" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Reducir fuente"
            aria-label="Reducir fuente"
            onClick={() => props.onTrackerCommand("font-down")}
          >
            <MsIcon name="text_decrease" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Cargar .ereport"
            aria-label="Cargar reporte"
            onClick={() => props.onTrackerCommand("upload")}
          >
            <MsIcon name="upload_file" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Limpiar todo"
            aria-label="Limpiar todo"
            onClick={() => props.onTrackerCommand("clear-all")}
          >
            <MsIcon name="delete_sweep" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Progreso / qué falta"
            aria-label="Progreso"
            onClick={() => props.onTrackerCommand("progress")}
          >
            <MsIcon name="checklist" />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Descargar (.ereport + HTML + PDF)"
            aria-label="Descargar reporte"
            onClick={() => props.onTrackerCommand("save-export")}
          >
            <MsIcon name="download" />
          </button>

          <button
            type="button"
            className={`header-dynamic-menu__btn${props.modal === "hub" ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Hub"
            aria-label="Abrir hub"
            aria-haspopup="dialog"
            aria-expanded={props.modal === "hub"}
            onClick={() => props.onOpenModal(props.modal === "hub" ? null : "hub")}
          >
            <IconHub />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.modal === "tema" ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Editar tema"
            aria-label="Editar tema"
            aria-haspopup="dialog"
            aria-expanded={props.modal === "tema"}
            onClick={() => props.onOpenModal(props.modal === "tema" ? null : "tema")}
          >
            <IconTema />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn ereport-hds-cloud-save${props.modal === "save" ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Guardar en nube"
            aria-label="Guardar en nube"
            aria-haspopup="dialog"
            aria-expanded={props.modal === "save"}
            disabled={props.saving}
            onClick={() => props.onOpenModal(props.modal === "save" ? null : "save")}
          >
            <IconCloud />
          </button>
          {props.canShare ? (
            <button
              type="button"
              className={`header-dynamic-menu__btn${props.modal === "share" ? " header-dynamic-menu__btn--active is-active" : ""}`}
              title="Compartir"
              aria-label="Compartir con usuarios"
              aria-haspopup="dialog"
              aria-expanded={props.modal === "share"}
              onClick={() => props.onOpenModal(props.modal === "share" ? null : "share")}
            >
              <IconShare />
            </button>
          ) : null}
          {props.canHistory ? (
            <button
              type="button"
              className={`header-dynamic-menu__btn${props.modal === "historial" ? " header-dynamic-menu__btn--active is-active" : ""}`}
              title="Historial"
              aria-label="Historial de versiones API"
              aria-haspopup="dialog"
              aria-expanded={props.modal === "historial"}
              onClick={() => {
                const next = props.modal === "historial" ? null : "historial";
                props.onOpenModal(next);
                if (next === "historial") void props.onLoadHistory();
              }}
            >
              <IconHistory />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  ) : null;

  const modal =
    props.modal == null ? null : (
      <div
        className="ereport-modal"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onCloseModal();
        }}
      >
        <div
          className="ereport-modal__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ereport-modal-title"
        >
          {props.modal === "hub" ? (
            <>
              <h2 id="ereport-modal-title">Hub eReport</h2>
              <p className="ereport-modal__lead">
                Volvé al listado de reportes de este usuario. Los cambios no guardados en nube se
                pierden si no guardaste antes.
              </p>
              <div className="ereport-modal__actions">
                <button type="button" className="btn" onClick={props.onCloseModal}>
                  Seguir editando
                </button>
                <a className="btn btn--primary" href={hubHref}>
                  Ir al hub
                </a>
              </div>
            </>
          ) : null}

          {props.modal === "tema" ? (
            <>
              <h2 id="ereport-modal-title">Tema del reporte</h2>
              <label className="ereport-modal__field" htmlFor="ereport-modal-tema">
                Tema
                <input
                  id="ereport-modal-tema"
                  value={props.tema}
                  onChange={(e) => props.onTemaChange(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </label>
              <div className="ereport-modal__actions">
                <button type="button" className="btn" onClick={props.onCloseModal}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={props.saving}
                  onClick={() => void props.onSaveTema()}
                >
                  {props.saving ? "Guardando…" : "Guardar tema"}
                </button>
              </div>
            </>
          ) : null}

          {props.modal === "save" ? (
            <>
              <h2 id="ereport-modal-title">Guardar en nube</h2>
              <p className="ereport-modal__lead">
                Se recoge el estado del Issue Tracker (incluye títulos de sección y subsección) y se
                guarda en S3 bajo <code>ereport/</code>.
              </p>
              {props.error ? <p className="ereport-hub__error">{props.error}</p> : null}
              <div className="ereport-modal__actions">
                <button type="button" className="btn" onClick={props.onCloseModal}>
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={props.saving}
                  onClick={() => void props.onSaveCloud()}
                >
                  {props.saving ? "Guardando…" : "Guardar ahora"}
                </button>
              </div>
            </>
          ) : null}

          {props.modal === "share" && props.meta ? (
            <>
              <h2 id="ereport-modal-title">Compartir</h2>
              <p className="ereport-modal__lead">
                Solo usuarios registrados. Pueden abrir y editar el cuerpo; no administran shares.
              </p>
              <form className="ereport-share__form" onSubmit={(e) => void props.onAddShare(e)}>
                <label htmlFor="ereport-share-email-modal">Email</label>
                <div className="ereport-hub__row">
                  <input
                    id="ereport-share-email-modal"
                    type="email"
                    value={props.shareInput}
                    onChange={(e) => props.onShareInputChange(e.target.value)}
                    placeholder="email@ejemplo.com"
                    autoFocus
                  />
                  <button className="btn" type="submit" disabled={props.busyShare}>
                    Añadir
                  </button>
                </div>
              </form>
              <ul className="ereport-share__list">
                {(props.meta.sharedWith ?? []).map((s) => (
                  <li key={s.email}>
                    {s.email}
                    <button
                      type="button"
                      className="ereport-card__del"
                      onClick={() => void props.onRemoveShare(s.email)}
                      disabled={props.busyShare}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
              {props.error ? <p className="ereport-hub__error">{props.error}</p> : null}
              <div className="ereport-modal__actions">
                <button type="button" className="btn btn--primary" onClick={props.onCloseModal}>
                  Listo
                </button>
              </div>
            </>
          ) : null}

          {props.modal === "historial" ? (
            <>
              <h2 id="ereport-modal-title">Historial API</h2>
              <p className="ereport-modal__lead">
                Instantáneas guardadas antes de un reemplazo vía API (o restore). Máximo 50.
              </p>
              {props.historyLoading ? (
                <p className="ereport-hub__empty">Cargando historial…</p>
              ) : props.historyItems.length === 0 ? (
                <p className="ereport-hub__empty">Sin instantáneas todavía.</p>
              ) : (
                <ul className="ereport-share__list">
                  {props.historyItems.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.tema || "Sin tema"}</strong>
                        <span>
                          {" "}
                          · {item.source}
                          {item.keyPrefix ? ` · ${item.keyPrefix}` : ""} · {item.createdAt}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        disabled={props.historyBusy}
                        onClick={() => void props.onRestoreHistory(item.id)}
                      >
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {props.error ? <p className="ereport-hub__error">{props.error}</p> : null}
              <div className="ereport-modal__actions">
                <button type="button" className="btn" onClick={() => void props.onLoadHistory()}>
                  Actualizar
                </button>
                <button type="button" className="btn btn--primary" onClick={props.onCloseModal}>
                  Cerrar
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );

  return (
    <>
      {host && menu ? createPortal(menu, host) : null}
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
