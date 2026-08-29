/**
 * BIM IFC viewer header tools — portal into #header-dynamic-menu-host.
 * Spec 037: Material Symbols icon-only Upload (admin) / Browse / Lights /
 * Python+Output (admin) / Offload.
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HEADER_DYNAMIC_MENU_HOST_ID } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";

type BimIfcHeaderMenuProps = {
  isAdmin: boolean;
  uploadOpen: boolean;
  browseOpen: boolean;
  lightsOpen: boolean;
  consoleOpen: boolean;
  outputOpen: boolean;
  modelLoaded: boolean;
  onToggleUpload: () => void;
  onToggleBrowse: () => void;
  onToggleLights: () => void;
  onToggleConsole: () => void;
  onToggleOutput: () => void;
  onOffloadModel: () => void;
};

function MaterialIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined header-dynamic-menu__icon" aria-hidden>
      {name}
    </span>
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
          {props.isAdmin ? (
            <button
              type="button"
              className={`header-dynamic-menu__btn${props.uploadOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
              title="Upload IFC"
              aria-label="Upload IFC"
              aria-pressed={props.uploadOpen}
              onClick={props.onToggleUpload}
            >
              <MaterialIcon name="upload" />
            </button>
          ) : null}
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.browseOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Browse models"
            aria-label="Browse models"
            aria-pressed={props.browseOpen}
            onClick={props.onToggleBrowse}
          >
            <MaterialIcon name="folder_open" />
          </button>
          <button
            type="button"
            className={`header-dynamic-menu__btn${props.lightsOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Scene lights"
            aria-label="Scene lights"
            aria-pressed={props.lightsOpen}
            onClick={props.onToggleLights}
          >
            <MaterialIcon name="light_mode" />
          </button>
          {props.isAdmin ? (
            <>
              <button
                type="button"
                className={`header-dynamic-menu__btn${props.consoleOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
                title="Python console"
                aria-label="Python console"
                aria-pressed={props.consoleOpen}
                onClick={props.onToggleConsole}
              >
                <MaterialIcon name="terminal" />
              </button>
              <button
                type="button"
                className={`header-dynamic-menu__btn${props.outputOpen ? " header-dynamic-menu__btn--active is-active" : ""}`}
                title="Python output"
                aria-label="Python output"
                aria-pressed={props.outputOpen}
                onClick={props.onToggleOutput}
              >
                <MaterialIcon name="article" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="header-dynamic-menu__btn"
            title="Offload model"
            aria-label="Offload model"
            disabled={!props.modelLoaded}
            onClick={props.onOffloadModel}
          >
            <MaterialIcon name="eject" />
          </button>
        </div>
      </div>
    </section>
  );

  return createPortal(menu, host);
}
