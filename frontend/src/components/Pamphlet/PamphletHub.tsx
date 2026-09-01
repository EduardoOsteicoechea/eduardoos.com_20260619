/**
 * Pamphlet hub — dashboard + ?view=; non-dashboard mounts the mm/px generator (spec 045).
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
import "./PamphletHub.css";

const PAMPHLET_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "recent", label: "Recent", icon: "history" },
  { id: "open", label: "Open", icon: "folder_open" },
  { id: "new", label: "New", icon: "note_add" },
  { id: "manage", label: "Manage", icon: "folder_managed" },
  { id: "footers", label: "Footers", icon: "vertical_align_bottom" },
] as const;

const PAMPHLET_CARDS = [
  { id: "recent", title: "Recent", description: "Continue recent pamphlets." },
  { id: "open", title: "Open", description: "Open a cloud pamphlet." },
  { id: "new", title: "New", description: "Create a new pamphlet." },
  { id: "manage", title: "Manage", description: "Manage cloud documents." },
  { id: "footers", title: "Footers", description: "Footer profiles." },
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

  useEffect(() => {
    if (view === "dashboard") {
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
  }, [view]);

  return (
    <div className="pamphlet-hub">
      <ProductHeaderMenu
        menuId="pamphlet-product-header-menu"
        items={[...PAMPHLET_VIEWS]}
        activeId={view}
        onSelect={setView}
      />
      {view === "dashboard" ? (
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
        className="pamphlet-route-root"
        hidden={view === "dashboard"}
      />
    </div>
  );
}

declare global {
  interface Window {
    __eduardoosPamphletView?: string;
  }
}
