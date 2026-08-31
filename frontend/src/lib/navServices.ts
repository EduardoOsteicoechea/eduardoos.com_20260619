/**
 * Global tray product links (spec 038 + 044).
 * Public rows are always shown. Billable rows require admin, an active
 * entitlement, allowlist (eVoice), or (Homescool only) a linked-student bypass.
 */

import { APP_ROUTES } from "../config/routes";
import { CHURCH_FEATURE_ENABLED } from "./churchFeature";
import { hasServiceAccess, type EntitlementRecord } from "./payments";

export type TrayNavLink = {
  href: string;
  label: string;
  /** Google Material Symbols ligature (Outlined). */
  icon: string;
  /** Billable catalog id; omit for always-visible public links. */
  serviceId?: string;
};

export const PRIMARY_TRAY_LINKS: TrayNavLink[] = [
  { href: APP_ROUTES.contact, label: "Contact", icon: "mail" },
];

export const PRODUCT_TRAY_LINKS: TrayNavLink[] = [
  { href: APP_ROUTES.homescool, label: "Homescool", serviceId: "homescool", icon: "school" },
  ...(CHURCH_FEATURE_ENABLED
    ? ([
        {
          href: APP_ROUTES.church,
          label: "Church",
          serviceId: "church-management",
          icon: "church",
        },
      ] as TrayNavLink[])
    : []),
  { href: APP_ROUTES.mediaPlaylist, label: "Music", serviceId: "playlist", icon: "music_note" },
  { href: APP_ROUTES.pamphlet, label: "Pamphlet", serviceId: "pamphlet", icon: "description" },
  { href: APP_ROUTES.scrib, label: "Scrib", serviceId: "scrib", icon: "edit_note" },
  { href: APP_ROUTES.ereport, label: "eReport", serviceId: "ereport", icon: "assignment" },
  { href: APP_ROUTES.evoice, label: "eVoice", serviceId: "evoice", icon: "record_voice_over" },
  { href: APP_ROUTES.articles, label: "Articles", icon: "article" },
  { href: APP_ROUTES.calvinsInstitutes, label: "Calvin’s Institutes", icon: "menu_book" },
  { href: APP_ROUTES.bimIfcViewer, label: "BIM IFC viewer", icon: "view_in_ar" },
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
