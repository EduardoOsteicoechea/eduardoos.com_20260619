/**
 * SubscriptionBuilder.tsx — Pick services, see live pricing, and start PayPal checkout.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getAuthEmailFromToken, isAuthenticated } from "../../lib/auth";
import { APP_ROUTES } from "../../config/routes";
import { getPaymentStatus, PAYPAL_BUTTON_IMAGE, PAYPAL_FORM_ACTION } from "../../lib/payments";
import {
  createSubscriptionIntent,
  fetchEntitlementsForEmail,
  fetchMyEntitlements,
  quoteSubscription,
  SUBSCRIPTION_SERVICES,
  type BillingPeriod,
  type EntitlementRecord,
  type PaymentIntentResponse,
} from "../../lib/subscriptions";
import { validateEmail } from "../../lib/validation";
import "./SubscriptionBuilder.css";

function entitlementMap(records: EntitlementRecord[]): Map<string, EntitlementRecord> {
  return new Map(records.map((record) => [record.service_id, record]));
}

export default function SubscriptionBuilder() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const activeByService = useMemo(() => entitlementMap(entitlements), [entitlements]);
  const activeServiceIds = useMemo(
    () => new Set(entitlements.map((record) => record.service_id)),
    [entitlements]
  );
  const checkoutSelected = useMemo(() => {
    if (billingPeriod === "yearly") {
      return selected;
    }
    return selected.filter((serviceId) => !activeServiceIds.has(serviceId));
  }, [selected, activeServiceIds, billingPeriod]);

  const total = useMemo(
    () => quoteSubscription(checkoutSelected, billingPeriod),
    [checkoutSelected, billingPeriod]
  );

  useEffect(() => {
    const sessionEmail = getAuthEmailFromToken();
    if (sessionEmail) {
      setEmail(sessionEmail);
    }
  }, []);

  useEffect(() => {
    const validationError = validateEmail(email);
    setEmailError(validationError ?? "");
    if (validationError) {
      setEntitlements([]);
      return;
    }

    const timer = window.setTimeout(() => {
      if (isAuthenticated() && getAuthEmailFromToken() === email.trim().toLowerCase()) {
        void fetchMyEntitlements().then(setEntitlements);
        return;
      }
      void fetchEntitlementsForEmail(email).then(setEntitlements);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [email]);

  useEffect(() => {
    if (billingPeriod === "yearly") {
      return;
    }
    setSelected((current) => current.filter((serviceId) => !activeServiceIds.has(serviceId)));
  }, [activeServiceIds, billingPeriod]);

  function toggleService(serviceId: string) {
    if (billingPeriod === "monthly" && activeServiceIds.has(serviceId)) {
      return;
    }
    setSelected((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    );
    setIntent(null);
    setMessage("");
    setError("");
  }

  async function handlePrepare(event: FormEvent) {
    event.preventDefault();
    const validationError = validateEmail(email);
    setEmailError(validationError ?? "");
    if (validationError) {
      return;
    }
    if (checkoutSelected.length === 0) {
      setError(
        activeServiceIds.size > 0 && billingPeriod === "monthly"
          ? "You are already subscribed to the selected services."
          : "Select at least one service."
      );
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setIntent(null);

    try {
      const { data, error: apiError } = await createSubscriptionIntent(
        email,
        checkoutSelected,
        billingPeriod
      );
      if (!data) {
        const lines = [apiError?.message ?? "Could not create payment intent."];
        if (apiError?.debugLogs?.length) {
          lines.push(...apiError.debugLogs);
        }
        setError(lines.join("\n"));
        return;
      }
      setIntent(data);
      setMessage(
        `Intent ${data.intent_id} ready for ${data.product_name}. Total: $${data.amount} ${data.currency}.`
      );
    } catch {
      setError("Network error — is the gateway running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckStatus() {
    if (!intent?.intent_id) {
      return;
    }
    setLoading(true);
    try {
      const status = await getPaymentStatus(intent.intent_id);
      if (!status) {
        setError("Could not load payment status.");
        return;
      }
      setMessage(`Payment status: ${status.status}`);
      if (validateEmail(email)) {
        setEntitlements(await fetchEntitlementsForEmail(email));
      }
    } finally {
      setLoading(false);
    }
  }

  const allServicesActiveMonthly =
    billingPeriod === "monthly" &&
    SUBSCRIPTION_SERVICES.every((service) => activeServiceIds.has(service.id));

  return (
    <div className="subscription-builder panel">
      <h1 className="panel__title">Build your subscription</h1>
      <p className="page-lead">
        Choose the services you want. Each service costs $1/month or $10/year.
        Yearly checkout adds one year to any active service. Use the same email you
        registered and verified on this site.
      </p>

      <div className="subscription-builder__pricing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`btn ${billingPeriod === "monthly" ? "btn--primary" : ""}`}
          onClick={() => {
            setBillingPeriod("monthly");
            setIntent(null);
          }}
        >
          Monthly ($1 / service)
        </button>
        <button
          type="button"
          className={`btn ${billingPeriod === "yearly" ? "btn--primary" : ""}`}
          onClick={() => {
            setBillingPeriod("yearly");
            setIntent(null);
          }}
        >
          Yearly ($10 / service)
        </button>
      </div>

      <div className="subscription-builder__services">
        {SUBSCRIPTION_SERVICES.map((service) => {
          const active = activeByService.get(service.id);
          const isActive = Boolean(active);
          const isExtendable = isActive && billingPeriod === "yearly";
          const isBlocked = isActive && billingPeriod === "monthly";
          const checked = selected.includes(service.id);
          const unit = billingPeriod === "yearly" ? 10 : 1;
          return (
            <label
              key={service.id}
              className={`subscription-builder__service ${checked ? "subscription-builder__service--selected" : ""}${isBlocked ? " subscription-builder__service--active" : ""}${isExtendable ? " subscription-builder__service--extendable" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isBlocked}
                onChange={() => toggleService(service.id)}
              />
              <span className="subscription-builder__service-copy">
                <strong>{service.label}</strong>
                <span>{service.description}</span>
                {isExtendable ? (
                  <span className="subscription-builder__service-status">
                    Add 1 year — active until {new Date(active!.valid_until).toLocaleString()}
                  </span>
                ) : isActive ? (
                  <span className="subscription-builder__service-status">
                    Subscribed until {new Date(active!.valid_until).toLocaleString()}
                  </span>
                ) : (
                  <span className="subscription-builder__service-price">${unit}/period</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <p className="subscription-builder__total" aria-live="polite">
        Total: <strong>${total.toFixed(2)} USD</strong>
      </p>

      <form className="subscription-builder__prepare" onSubmit={handlePrepare}>
        <div className={`form-field ${emailError ? "form-field--error" : ""}`}>
          <label htmlFor="subscription-email">Registered email</label>
          <input
            id="subscription-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {emailError && <span className="field-error">{emailError}</span>}
        </div>
        <div className="panel__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={loading || checkoutSelected.length === 0 || allServicesActiveMonthly}
          >
            {loading ? "Preparing…" : "Prepare checkout"}
          </button>
          {intent && (
            <button className="btn" type="button" onClick={handleCheckStatus} disabled={loading}>
              Check status
            </button>
          )}
        </div>
      </form>

      {error && <p className="status-message status-message--error">{error}</p>}
      {message && <p className="status-message status-message--success">{message}</p>}

      {intent && (
        <form
          className="subscription-builder__checkout"
          action={intent.paypal_checkout_url || PAYPAL_FORM_ACTION}
          method="post"
          target="_top"
        >
          {intent.paypal_checkout_mode === "xclick" && intent.paypal_business ? (
            <>
              <input type="hidden" name="cmd" value="_xclick" />
              <input type="hidden" name="business" value={intent.paypal_business} />
              <input type="hidden" name="item_name" value={intent.product_name} />
              <input type="hidden" name="amount" value={intent.amount} />
            </>
          ) : (
            <>
              <input type="hidden" name="cmd" value="_s-xclick" />
              <input type="hidden" name="hosted_button_id" value={intent.hosted_button_id} />
            </>
          )}
          <input type="hidden" name="currency_code" value={intent.currency || "USD"} />
          <input type="hidden" name="custom" value={intent.intent_id} />
          <input type="hidden" name="invoice" value={intent.intent_id} />
          <input type="hidden" name="bn" value="EduardoOS_SP" />
          <button type="submit" className="subscription-builder__image-btn">
            <img src={PAYPAL_BUTTON_IMAGE} alt="Pay with PayPal" />
          </button>
        </form>
      )}

      {entitlements.length > 0 && (
        <section className="subscription-builder__active" aria-label="Active services">
          <h2>Your active services</h2>
          <ul>
            {entitlements.map((item) => (
              <li key={item.service_id}>
                <strong>{item.service_label}</strong> until {new Date(item.valid_until).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isAuthenticated() && (
        <p className="subscription-builder__hint">
          <a href={APP_ROUTES.login}>Sign in</a> to see active services after payment.
        </p>
      )}
    </div>
  );
}
