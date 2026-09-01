/**
 * Pamphlet hub — dashboard + ?view=; non-dashboard mounts the mm/px generator
 * (specs 045 + 054). Dashboard uses the universal product chrome; editor views
 * toggle html.layout-editor-bleed for a full-bleed canvas under BaseLayout.
 * Generator canvas dimensions stay pass-through (do not rem-convert).
 */

import { useEffect, useRef } from "react";
import ServiceGate from "../ServiceGate/ServiceGate";
import {
  DashboardGrid,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import {
  mountPamphletGenerator,
  type PamphletMountHandle,
} from "../../lib/pamphlet-generator/src/index";
import "../ProductDashboard/ProductDashboard.css";
import "../../layouts/PamphletLayout.css";
import "./PamphletHub.css";

const EDITOR_BLEED_CLASS = "layout-editor-bleed";

const PAMPHLET_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "recent", label: "Recent", icon: "history" },
  { id: "open", label: "Open", icon: "folder_open" },
  { id: "new", label: "New", icon: "note_add" },
  { id: "manage", label: "Manage", icon: "folder_managed" },
  { id: "footers", label: "Footers", icon: "vertical_align_bottom" },
] as const;

const PAMPHLET_CARDS = [
  { id: "recent", title: "Recent", description: "Continue recent pamphlets.", icon: "history" },
  { id: "open", title: "Open", description: "Open a cloud pamphlet.", icon: "folder_open" },
  { id: "new", title: "New", description: "Create a new pamphlet.", icon: "note_add" },
  { id: "manage", title: "Manage", description: "Manage cloud documents.", icon: "folder_managed" },
  { id: "footers", title: "Footers", description: "Footer profiles.", icon: "vertical_align_bottom" },
];

export default function PamphletHub() {
  return (
    <ServiceGate serviceId="pamphlet" serviceLabel="Pamphlet">
      <PamphletHubInner />
    </ServiceGate>
  );
}

function PamphletHubInner() {
  const [view, setView] = useProductView("dashboard");
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PamphletMountHandle | null>(null);
  const isEditor = view !== "dashboard";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(EDITOR_BLEED_CLASS, isEditor);
    root.classList.toggle("page-pamphlet", isEditor);
    document.body.classList.toggle("page-pamphlet", isEditor);
    return () => {
      root.classList.remove(EDITOR_BLEED_CLASS, "page-pamphlet");
      document.body.classList.remove("page-pamphlet");
    };
  }, [isEditor]);

  useEffect(() => {
    if (!isEditor) {
      handleRef.current?.destroy();
      handleRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    handleRef.current?.destroy();
    handleRef.current = null;
    host.innerHTML = "";
    host.dataset.pamphletView = view;
    window.__eduardoosPamphletView = view;
    handleRef.current = mountPamphletGenerator(host);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [view, isEditor]);

  return (
    <div className={isEditor ? "pamphlet-hub pamphlet-hub--editor" : "pamphlet-hub"}>
      <ProductHeaderMenu
        menuId="pamphlet-product-header-menu"
        items={[...PAMPHLET_VIEWS]}
        activeId={view}
        onSelect={setView}
      />
      {!isEditor ? (
        <ProductHubShell title="Pamphlet">
          <DashboardGrid cards={PAMPHLET_CARDS} onSelect={setView} />
        </ProductHubShell>
      ) : (
        <div className="pamphlet-hub__hint-bar">
          <span>View: {view}</span>
          <button type="button" className="btn" onClick={() => setView("dashboard")}>
            Dashboard
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        id="pamphlet-root"
        className="pamphlet-route-root pamphlet-layout-workspace"
        hidden={!isEditor}
      />
    </div>
  );
}

declare global {
  interface Window {
    __eduardoosPamphletView?: string;
  }
}
