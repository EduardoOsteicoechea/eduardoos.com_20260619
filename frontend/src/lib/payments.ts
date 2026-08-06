import { apiRequest } from "./api";
import { PAYMENT_ROUTES } from "../config/routes";
import { buildFlightLog, createCorrelationId, emitFlightLog, } from "./telemetry";
export interface PaymentIntentResponse {
    intent_id: string;
    email: string;
    plan_id: string;
    hosted_button_id: string;
    currency: string;
    paypal_checkout_url?: string;
    paypal_checkout_mode?: "xclick" | "hosted";
    paypal_business?: string;
    amount?: string;
    product_name?: string;
}
export interface PaymentStatusResponse {
    intent_id: string;
    email: string;
    plan_id: string;
    status: string;
    paypal_txn_id?: string;
}
export const PAYPAL_BUTTON_IMAGE = "https://www.paypalobjects.com/en_US/i/btn/btn_buynowCC_LG.gif";
export const PAYPAL_FORM_ACTION = "https://www.paypal.com/cgi-bin/webscr";
export async function createPaymentIntent(email: string, planId = "subscription_monthly_basic", fetchFn?: typeof fetch): Promise<{
    data: PaymentIntentResponse | null;
    correlationId: string;
    error?: {
        message: string;
        debugLogs?: string[];
    };
}> {
    const correlationId = createCorrelationId();
    await emitFlightLog(buildFlightLog("payments.intent", "started", correlationId, { email }), fetchFn);
    const response = await apiRequest<PaymentIntentResponse>(PAYMENT_ROUTES.intents, {
        method: "POST",
        body: { email, plan_id: planId },
        correlationId,
        fetchFn,
    });
    await emitFlightLog(buildFlightLog("payments.intent", response.error ? "error" : "success", correlationId, { email }), fetchFn);
    return {
        data: response.data ?? null,
        correlationId,
        error: response.error
            ? {
                message: response.error.message,
                debugLogs: response.error.debugLogs,
            }
            : undefined,
    };
}
export async function getPaymentStatus(intentId: string, fetchFn?: typeof fetch): Promise<PaymentStatusResponse | null> {
    const correlationId = createCorrelationId();
    const response = await apiRequest<PaymentStatusResponse>(`${PAYMENT_ROUTES.status}/${intentId}`, { correlationId, fetchFn });
    return response.data ?? null;
}
