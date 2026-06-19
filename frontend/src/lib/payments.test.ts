import { describe, expect, it, vi } from "vitest";
import { PAYMENT_ROUTES } from "../config/routes";
import {
  createPaymentIntent,
  PAYPAL_FORM_ACTION,
  PAYPAL_BUTTON_IMAGE,
} from "./payments";

describe("payments client", () => {
  it("exposes gateway payment routes", () => {
    expect(PAYMENT_ROUTES.intents).toBe("/api/payments/intents");
    expect(PAYMENT_ROUTES.status).toBe("/api/payments/status");
  });

  it("uses official PayPal endpoints", () => {
    expect(PAYPAL_FORM_ACTION).toContain("paypal.com");
    expect(PAYPAL_BUTTON_IMAGE).toContain("paypalobjects.com");
  });

  it("createPaymentIntent posts email and plan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            intent_id: "intent-1",
            email: "user@example.com",
            plan_id: "subscription_monthly_basic",
            hosted_button_id: "QEVGD66SG7LXN",
            currency: "USD",
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    const { data } = await createPaymentIntent(
      "user@example.com",
      "subscription_monthly_basic",
      fetchMock
    );

    expect(data?.intent_id).toBe("intent-1");
    expect(fetchMock).toHaveBeenCalledWith(
      PAYMENT_ROUTES.intents,
      expect.objectContaining({ method: "POST" })
    );
  });
});
