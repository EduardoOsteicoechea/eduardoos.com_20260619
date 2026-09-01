/**
 * Calvin’s Institutes hub — /dashboard/latin/calvins-institutes?view= (spec 051).
 * Tool (read) stays flush — not wrapped in product-dash padding.
 */

import {
  DashboardGrid,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import CalvinsInstitutesReader from "./CalvinsInstitutesReader";
import "../ProductDashboard/ProductDashboard.css";

const INSTITUTES_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "read", label: "Read", icon: "menu_book" },
] as const;

const DASH_CARDS = [
  {
    id: "read",
    title: "Read Institutes",
    description: "Latin 1559 Capita — Liber I–IV.",
    icon: "menu_book",
  },
];

export default function CalvinsInstitutesHub() {
  const [view, setView] = useProductView("dashboard");

  if (view === "read") {
    return <CalvinsInstitutesReader onGoDashboard={() => setView("dashboard")} />;
  }

  return (
    <ProductHubShell title="Calvin’s Institutes">
      <ProductHeaderMenu
        menuId="calvins-product-header-menu"
        items={[...INSTITUTES_VIEWS]}
        activeId={view}
        onSelect={setView}
      />
      <DashboardGrid cards={DASH_CARDS} onSelect={setView} />
    </ProductHubShell>
  );
}
