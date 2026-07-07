/**
 * SubscriptionBuilder.tsx — Pick services, see live pricing, and start PayPal checkout.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isAuthenticated } from "../../lib/auth";
import { APP_ROUTES } from "../../config/routes";
import { getPaymentStatus, PAYPAL_BUTTON_IMAGE, PAYPAL_FORM_ACTION } from "../../lib/payments";
import {
  createSubscriptionIntent,
  fetchMyEntitlements,
  quoteSubscription,
  SUBSCRIPTION_SERVICES,
  type BillingPeriod,
  type EntitlementRecord,
  type PaymentIntentResponse,
} from "../../lib/subscriptions";
import { validateEmail } from "../../lib/validation";
import "./SubscriptionBuilder.css";

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

  const total = useMemo(
    () => quoteSubscription(selected, billingPeriod),
    [selected, billingPeriod]
  );

  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }
    void fetchMyEntitlements().then(setEntitlements);
  }, []);

  function toggleService(serviceId: string) {
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
    if (selected.length === 0) {
      setError("Select at least one service.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setIntent(null);

    try {
      const { data, error: apiError } = await createSubscriptionIntent(
        email,
        selected,
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
      if (isAuthenticated()) {
        setEntitlements(await fetchMyEntitlements());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="subscription-builder panel">
      <h1 className="panel__title">Build your subscription</h1>
      <p className="page-lead">
        Choose the services you want. Each service costs $1/month or $10/year.
        Use the same email you registered and verified on this site.
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
          const checked = selected.includes(service.id);
          const unit = billingPeriod === "yearly" ? 10 : 1;
          return (
            <label
              key={service.id}
              className={`subscription-builder__service ${checked ? "subscription-builder__service--selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleService(service.id)}
              />
              <span className="subscription-builder__service-copy">
                <strong>{service.label}</strong>
                <span>{service.description}</span>
                <span className="subscription-builder__service-price">${unit}/period</span>
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
          <button className="btn btn--primary" type="submit" disabled={loading || selected.length === 0}>
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
          action={PAYPAL_FORM_ACTION}
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
