/**
 * Payments client — subscription intents, entitlements, access checks.
 */

import { PAYMENT_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken, isPlatformAdmin, getAuthEmailFromToken } from "./auth";
import { CHURCH_FEATURE_ENABLED } from "./churchFeature";
import { createCorrelationId } from "./correlation";

export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionService = {
  id: string;
  label: string;
  description: string;
  monthlyUsd: number;
  /** Material Symbol ligature — matches tray icons (spec 053). */
  icon: string;
};

/** Billable catalog — services still offered on Subscribe. */
const SUBSCRIPTION_SERVICES_ALL: SubscriptionService[] = [
  {
    id: "playlist",
    label: "Music",
    description: "Worship playlist builder and lyrics.",
    monthlyUsd: 1,
    icon: "music_note",
  },
  {
    id: "pamphlet",
    label: "Pamphlet",
    description: "Cloud pamphlet editor and print export.",
    monthlyUsd: 1,
    icon: "description",
  },
  {
    id: "homescool",
    label: "Homescool",
    description: "Homescool learning surface.",
    monthlyUsd: 1,
    icon: "school",
  },
  {
    id: "church-management",
    label: "Church Management",
    description: "Register and manage churches, activities, and reports.",
    monthlyUsd: 1,
    icon: "church",
  },
  {
    id: "scrib",
    label: "Scrib",
    description: "Layered US Letter manuscript sheets with cloud books.",
    monthlyUsd: 1,
    icon: "edit_note",
  },
  {
    id: "ereport",
    label: "eReport",
    description: "Issue tracker reports (.ereport) with cloud storage and sharing.",
    monthlyUsd: 1,
    icon: "assignment",
  },
  {
    id: "evoice",
    label: "eVoice",
    description: "Text-to-audio projects (docs → MP3) with cloud storage under evoice/.",
    monthlyUsd: 1,
    icon: "record_voice_over",
  },
];

/** Temporary eVoice access until those users subscribe (spec 044). */
export const EVOICE_ALLOWLIST_EMAILS = [
  "eliasosteic@gmail.com",
  "laleskavf.2una@gmail.com",
] as const;

export function isEvoiceAllowlisted(email?: string | null): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return EVOICE_ALLOWLIST_EMAILS.some((a) => a === e);
}

/** Public subscribe catalog — church-management hidden while Church is offline. */
export const SUBSCRIPTION_SERVICES: SubscriptionService[] = CHURCH_FEATURE_ENABLED
  ? SUBSCRIPTION_SERVICES_ALL
  : SUBSCRIPTION_SERVICES_ALL.filter((s) => s.id !== "church-management");

export type PaymentIntentResponse = {
  intent_id: string;
  email: string;
  plan_id: string;
  product_name: string;
  hosted_button_id: string;
  currency: string;
  amount: string;
  services?: string[];
  billing_period?: BillingPeriod;
  paypal_checkout_mode?: "xclick" | "hosted";
  paypal_checkout_url?: string;
  paypal_business?: string;
  created_at?: string;
};

export type PaymentStatusResponse = {
  intent_id: string;
  email: string;
  plan_id: string;
  status: string;
  amount?: string;
  currency?: string;
};

export type EntitlementRecord = {
  service_id: string;
  service_label: string;
  billing_period: BillingPeriod;
  valid_from: string;
  valid_until: string;
};

export const PAYPAL_BUTTON_IMAGE =
  "https://www.paypalobjects.com/en_US/i/btn/btn_buynowCC_LG.gif";
export const PAYPAL_FORM_ACTION = "https://www.paypal.com/cgi-bin/webscr";

export function paypalHostedButtonIdFallback(): string {
  const fromEnv =
    (import.meta.env.PUBLIC_PAYPAL_HOSTED_BUTTON_ID as string | undefined) ??
    (import.meta.env.PAYPAL_HOSTED_BUTTON_ID as string | undefined);
  return (fromEnv ?? "").trim();
}

export function monthlyPriceFor(serviceId: string): number {
  const row = SUBSCRIPTION_SERVICES.find((s) => s.id === serviceId);
  return row?.monthlyUsd ?? 0;
}

export function quoteSubscription(
  serviceIds: string[],
  billingPeriod: BillingPeriod,
): number {
  const monthly = serviceIds.reduce((sum, id) => sum + monthlyPriceFor(id), 0);
  return billingPeriod === "yearly" ? monthly * 10 : monthly;
}

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to create a payment intent.");
  return token;
}

export async function createSubscriptionIntent(
  email: string,
  serviceIds: string[],
  billingPeriod: BillingPeriod,
): Promise<{ data: PaymentIntentResponse | null; error?: string }> {
  const result = await apiRequest<PaymentIntentResponse>(PAYMENT_ROUTES.intents, {
    method: "POST",
    body: {
      email,
      services: serviceIds,
      billing_period: billingPeriod,
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { data: null, error: formatApiError(result.error) };
  }
  return { data: result.data ?? null };
}

export async function getPaymentStatus(
  intentId: string,
): Promise<PaymentStatusResponse | null> {
  const result = await apiRequest<PaymentStatusResponse>(
    `${PAYMENT_ROUTES.status}/${encodeURIComponent(intentId)}`,
    { correlationId: createCorrelationId() },
  );
  return result.data ?? null;
}

export async function fetchMyEntitlements(): Promise<EntitlementRecord[]> {
  const token = getAuthToken();
  if (!token) return [];
  const result = await apiRequest<{ entitlements: EntitlementRecord[] }>(
    PAYMENT_ROUTES.entitlements,
    { correlationId: createCorrelationId(), authToken: token },
  );
  return result.data?.entitlements ?? [];
}

export async function fetchEntitlementsPreview(
  email: string,
): Promise<EntitlementRecord[]> {
  const result = await apiRequest<{ entitlements: EntitlementRecord[] }>(
    `${PAYMENT_ROUTES.entitlementsPreview}?email=${encodeURIComponent(email)}`,
    { correlationId: createCorrelationId() },
  );
  return result.data?.entitlements ?? [];
}

export function entitlementActive(row: EntitlementRecord, now = Date.now()): boolean {
  if (!row.valid_until) return true;
  const until = Date.parse(row.valid_until);
  return Number.isFinite(until) ? until >= now : true;
}

/** Admin always allowed; eVoice allowlist; otherwise requires an active entitlement. */
export function hasServiceAccess(
  serviceId: string,
  entitlements: EntitlementRecord[],
  email = getAuthEmailFromToken(),
  role?: string | null,
): boolean {
  if (isPlatformAdmin(email, role)) return true;
  if (serviceId === "evoice" && isEvoiceAllowlisted(email)) return true;
  return entitlements.some(
    (e) => e.service_id === serviceId && entitlementActive(e),
  );
}

export async function checkServiceAccess(
  serviceId: string,
): Promise<{
  allowed: boolean;
  isAdmin: boolean;
  hasEntitlement: boolean;
  isHomescoolStudent: boolean;
}> {
  const token = getAuthToken();
  if (!token) {
    return {
      allowed: false,
      isAdmin: false,
      hasEntitlement: false,
      isHomescoolStudent: false,
    };
  }
  if (isPlatformAdmin()) {
    return {
      allowed: true,
      isAdmin: true,
      hasEntitlement: true,
      isHomescoolStudent: false,
    };
  }
  const result = await apiRequest<{
    allowed: boolean;
    is_admin?: boolean;
    has_entitlement?: boolean;
    is_homescool_student?: boolean;
  }>(`${PAYMENT_ROUTES.access}/${encodeURIComponent(serviceId)}`, {
    correlationId: createCorrelationId(),
    authToken: token,
  });
  const isAdmin = Boolean(result.data?.is_admin);
  const hasEntitlement = Boolean(result.data?.has_entitlement);
  const isHomescoolStudent = Boolean(result.data?.is_homescool_student);
  return {
    allowed: Boolean(result.data?.allowed) || isAdmin,
    isAdmin,
    hasEntitlement: hasEntitlement || isAdmin,
    isHomescoolStudent,
  };
}
