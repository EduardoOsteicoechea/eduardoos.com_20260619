/**
 * Agent Sandbox tools — portal into #header-dynamic-menu-host.
 * Sidebar, Sites, chat history, files editor, agent console.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type AgentSandboxHeaderMenuProps = {
  sidebarOpen: boolean;
  sitesOpen: boolean;
  consoleOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSites: () => void;
  onOpenHistory: () => void;
  onOpenFiles: () => void;
  onToggleConsole: () => void;
};

function IconSidebar() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3.5 4h5v16h-5V4zm7 1.25h10v1.6H10.5v-1.6zm0 4.15h10v1.6H10.5v-1.6zm0 4.15h10v1.6H10.5v-1.6zm0 4.15h7v1.6h-7v-1.6z"
      />
    </svg>
  );
}

function IconSites() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2L2 7l10 5 10-5-10-5zm0 9.2L4.5 7.6 12 3.9l7.5 3.7L12 11.2zM4 10.3v5.2L12 20l8-4.5v-5.2l-8 4-8-4z"
      />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 117 7 7.1 7.1 0 01-4.95-2.05l-1.42 1.42A9 9 0 1013 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
      />
    </svg>
  );
}

function IconFiles() {
  return (
    <svg className="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm0 2l2 2h8v10H4V6h6z"
      />
    </svg>
  );
}

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

export default function AgentSandboxHeaderMenu(props: AgentSandboxHeaderMenuProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(HEADER_DYNAMIC_MENU_HOST_ID);
    setHost(el);
    if (!el) return;
    return () => {
      const registered = window.__eduardoosHeaderDynamicMenu;
      if (registered?.id === "agent-sandbox-header-menu") {
        window.__eduardoosHeaderDynamicMenu = null;
      }
    };
  }, []);

  if (!host) return null;

  const menu: ReactNode = (
    <section
      id="agent-sandbox-header-menu"
      className="header-dynamic-menu"
      aria-label="Agent Sandbox tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div className="header-dynamic-menu__actions" role="toolbar" aria-label="Agent Sandbox actions">
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.sidebarOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title={props.sidebarOpen ? "Ocultar chat" : "Mostrar chat"}
            aria-label={props.sidebarOpen ? "Ocultar chat" : "Mostrar chat"}
            aria-pressed={props.sidebarOpen}
            onClick={props.onToggleSidebar}
          >
            <IconSidebar />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.sitesOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Sites"
            aria-label="Sites"
            aria-pressed={props.sitesOpen}
            onClick={props.onOpenSites}
          >
            <IconSites />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Historial de chat"
            aria-label="Historial de chat"
            onClick={props.onOpenHistory}
          >
            <IconHistory />
          </button>
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Editor de archivos"
            aria-label="Editor de archivos"
            onClick={props.onOpenFiles}
          >
            <IconFiles />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.consoleOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Consola del agente"
            aria-label="Consola del agente"
            aria-pressed={props.consoleOpen}
            onClick={props.onToggleConsole}
          >
            <IconConsole />
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
