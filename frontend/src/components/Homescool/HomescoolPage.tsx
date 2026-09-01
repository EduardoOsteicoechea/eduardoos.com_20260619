/**
 * Homescool hub — sectioned ProductDashboard cards (spec 046).
 */

import { APP_ROUTES } from "../../config/routes";
import ServiceGate from "../ServiceGate/ServiceGate";
import {
  DashboardGrid,
  DashboardSection,
  ProductHubShell,
  ProductHeaderMenu,
  useProductView,
} from "../ProductDashboard/ProductDashboard";
import "../ProductDashboard/ProductDashboard.css";
import "./Homescool.css";

const MENU = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "students", label: "Students", icon: "groups" },
  { id: "register", label: "Register", icon: "person_add" },
  { id: "learning", label: "Learning", icon: "menu_book" },
];

export default function HomescoolPage() {
  const [view, setView] = useProductView("dashboard");

  function go(id: string) {
    if (id === "dashboard") {
      setView("dashboard");
      return;
    }
    if (id === "students") {
      window.location.href = APP_ROUTES.homescoolStudents;
      return;
    }
    if (id === "register") {
      window.location.href = APP_ROUTES.homescoolRegisterStudent;
      return;
    }
    if (id === "learning") {
      window.location.href = APP_ROUTES.homescoolLearning;
    }
  }

  return (
    <ServiceGate serviceId="homescool" serviceLabel="Homescool">
      <ProductHeaderMenu
        menuId="homescool-hub-menu"
        items={MENU}
        activeId={view}
        onSelect={go}
      />
      <ProductHubShell title="Homescool">
        <DashboardSection title="Classroom">
          <DashboardGrid
            cards={[
              {
                id: "students",
                title: "My students",
                description: "Roster and learning spaces",
              },
              {
                id: "register",
                title: "Register a student",
                description: "Enroll an existing platform user",
              },
            ]}
            onSelect={go}
          />
        </DashboardSection>
        <DashboardSection title="Learning">
          <DashboardGrid
            cards={[
              {
                id: "learning",
                title: "My learning space",
                description: "When another teacher enrolled you",
              },
            ]}
            onSelect={go}
          />
        </DashboardSection>
      </ProductHubShell>
    </ServiceGate>
  );
}
