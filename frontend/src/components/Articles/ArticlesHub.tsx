/**
 * Articles product hub — /dashboard/articulos?view=dashboard|browse (spec 051).
 */

import {
  DashboardGrid,
  ProductHeaderMenu,
  ProductHubShell,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import ArticlesList from "./ArticlesList";
import "../ProductDashboard/ProductDashboard.css";

const ARTICLE_VIEWS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "browse", label: "Browse", icon: "article" },
] as const;

const DASH_CARDS = [
  {
    id: "browse",
    title: "Browse articles",
    description: "Pamphlets grouped by series and chapter.",
    icon: "article",
  },
];

export default function ArticlesHub() {
  const [view, setView] = useProductView("dashboard");

  return (
    <ProductHubShell title={view === "dashboard" ? "Articles" : undefined}>
      <ProductHeaderMenu
        menuId="articles-product-header-menu"
        items={[...ARTICLE_VIEWS]}
        activeId={view}
        onSelect={setView}
      />

      {view === "dashboard" ? (
        <DashboardGrid cards={DASH_CARDS} onSelect={setView} />
      ) : null}

      {view === "browse" ? <ArticlesList /> : null}
    </ProductHubShell>
  );
}
