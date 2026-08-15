/**
 * Payments client for Next subscription intents + status polling.
 * Intent create requires JWT (Bearer from eduardoos-next-auth-token).
 */

import { PAYMENT_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type BillingPeriod = "monthly" | "yearly";

export const SUBSCRIPTION_SERVICES = [
  {
    id: "ai_agent",
    label: "AI Agent",
    description: "Conversational assistant and automation tools.",
  },
  {
    id: "playlist",
    label: "Playlist",
    description: "Cloud worship playlist builder and storage.",
  },
  {
    id: "pamphlet",
    label: "Pamphlet",
    description: "Local pamphlet editor and print export.",
  },
] as const;

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

/** Public Vite/Astro env fallback when intent has not been created yet. */
export function paypalHostedButtonIdFallback(): string {
  const fromEnv =
    (import.meta.env.PUBLIC_PAYPAL_HOSTED_BUTTON_ID as string | undefined) ??
    (import.meta.env.PAYPAL_HOSTED_BUTTON_ID as string | undefined);
  return (fromEnv ?? "").trim();
}

export function quoteSubscription(
  serviceIds: string[],
  billingPeriod: BillingPeriod,
): number {
  const unit = billingPeriod === "yearly" ? 10 : 1;
  return unit * serviceIds.length;
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
