/**
 * Global tray product links (spec 038).
 * Public rows are always shown. Billable rows require admin, an active
 * entitlement, or (Homescool only) a linked-student bypass.
 */

import { APP_ROUTES } from "../config/routes";
import { CHURCH_FEATURE_ENABLED } from "./churchFeature";
import { hasServiceAccess, type EntitlementRecord } from "./payments";

export type TrayNavLink = {
  href: string;
  label: string;
  /** Billable catalog id; omit for always-visible public links. */
  serviceId?: string;
};

export const PRIMARY_TRAY_LINKS: TrayNavLink[] = [
  { href: APP_ROUTES.contact, label: "Contact" },
];

export const PRODUCT_TRAY_LINKS: TrayNavLink[] = [
  { href: APP_ROUTES.homescool, label: "Homescool", serviceId: "homescool" },
  ...(CHURCH_FEATURE_ENABLED
    ? ([{ href: APP_ROUTES.church, label: "Church", serviceId: "church-management" }] as TrayNavLink[])
    : []),
  { href: APP_ROUTES.mediaPlaylist, label: "Music", serviceId: "playlist" },
  { href: APP_ROUTES.pamphlet, label: "Pamphlet", serviceId: "pamphlet" },
  { href: APP_ROUTES.scrib, label: "Scrib", serviceId: "scrib" },
  { href: APP_ROUTES.ereport, label: "eReport", serviceId: "ereport" },
  { href: APP_ROUTES.articles, label: "Articles" },
  { href: APP_ROUTES.calvinsInstitutes, label: "Calvin’s Institutes" },
  { href: APP_ROUTES.bimIfcViewer, label: "BIM IFC viewer" },
];

export type NavVisibilityInput = {
  isAdmin: boolean;
  entitlements: EntitlementRecord[];
  isHomescoolStudent?: boolean;
  email?: string | null;
  role?: string | null;
};

export function isProductNavLinkVisible(
  link: TrayNavLink,
  input: NavVisibilityInput,
): boolean {
  if (!link.serviceId) return true;
  if (input.isAdmin) return true;
  if (link.serviceId === "homescool" && input.isHomescoolStudent) return true;
  return hasServiceAccess(link.serviceId, input.entitlements, input.email, input.role);
}

export function visibleProductNavLinks(input: NavVisibilityInput): TrayNavLink[] {
  return PRODUCT_TRAY_LINKS.filter((link) => isProductNavLinkVisible(link, input));
}
