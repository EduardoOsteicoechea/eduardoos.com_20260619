import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { PAYMENT_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";
import { validateEmail } from "./validation";
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
        description: "Pamphlet generator, cloud sync, and exports.",
    },
] as const;
export type SubscriptionServiceId = (typeof SUBSCRIPTION_SERVICES)[number]["id"];
export type BillingPeriod = "monthly" | "yearly";
export interface PaymentIntentResponse {
    intent_id: string;
    email: string;
    plan_id: string;
    product_name: string;
    hosted_button_id: string;
    currency: string;
    amount: string;
    services: string[];
    billing_period: BillingPeriod;
    paypal_checkout_mode: "xclick" | "hosted";
    paypal_checkout_url?: string;
    paypal_business?: string;
    created_at?: string;
}
export interface EntitlementRecord {
    service_id: string;
    service_label: string;
    billing_period: BillingPeriod;
    valid_from: string;
    valid_until: string;
}
const MONTHLY_PRICE = 1;
const YEARLY_PRICE = 10;
export function quoteSubscription(serviceIds: string[], billingPeriod: BillingPeriod): number {
    const unit = billingPeriod === "yearly" ? YEARLY_PRICE : MONTHLY_PRICE;
    return unit * serviceIds.length;
}
export async function createSubscriptionIntent(email: string, serviceIds: string[], billingPeriod: BillingPeriod): Promise<{
    data: PaymentIntentResponse | null;
    error?: {
        message: string;
        debugLogs?: string[];
    };
}> {
    const correlationId = createCorrelationId();
    const response = await apiRequest<PaymentIntentResponse>(PAYMENT_ROUTES.intents, {
        method: "POST",
        body: {
            email,
            services: serviceIds,
            billing_period: billingPeriod,
        },
        correlationId,
    });
    return {
        data: response.data ?? null,
        error: response.error
            ? {
                message: response.error.message,
                debugLogs: response.error.debugLogs,
            }
            : undefined,
    };
}
export async function fetchEntitlementsForEmail(email: string): Promise<EntitlementRecord[]> {
    if (validateEmail(email)) {
        return [];
    }
    const correlationId = createCorrelationId();
    const response = await apiRequest<{
        entitlements: EntitlementRecord[];
    }>(`${PAYMENT_ROUTES.entitlementsPreview}?email=${encodeURIComponent(email)}`, { correlationId });
    return response.data?.entitlements ?? [];
}
export async function fetchMyEntitlements(): Promise<EntitlementRecord[]> {
    const token = getAuthToken();
    if (!token) {
        return [];
    }
    const correlationId = createCorrelationId();
    const response = await apiRequest<{
        entitlements: EntitlementRecord[];
    }>("/api/subscriptions/entitlements", { correlationId, authToken: token });
    return response.data?.entitlements ?? [];
}
