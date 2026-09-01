/**
 * BIM IFC viewer hub — /dashboard/bim/ifc/viewer?view= (spec 051).
 * Viewer stays full-bleed — not wrapped in product-dash padding.
 */

import {
  DashboardGrid,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import BimIfcViewer from "./BimIfcViewer";
import "../ProductDashboard/ProductDashboard.css";

const BIM_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "viewer", label: "Viewer", icon: "view_in_ar" },
] as const;

const DASH_CARDS = [
  {
    id: "viewer",
    title: "Open IFC viewer",
    description: "Browse the shared library and orbit models.",
    icon: "view_in_ar",
  },
];

export default function BimIfcViewerHub() {
  const [view, setView] = useProductView("dashboard");

  if (view === "viewer") {
    return <BimIfcViewer onGoDashboard={() => setView("dashboard")} />;
  }

  return (
    <ProductHubShell title="BIM IFC viewer">
      <ProductHeaderMenu
        menuId="bim-product-header-menu"
        items={[...BIM_VIEWS]}
        activeId={view}
        onSelect={setView}
      />
      <DashboardGrid cards={DASH_CARDS} onSelect={setView} />
    </ProductHubShell>
  );
}
