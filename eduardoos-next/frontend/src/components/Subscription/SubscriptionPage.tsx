/**
 * Minimal subscription builder: prepare JWT-backed intent + PayPal hosted button.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  getAuthEmailFromToken,
  isAuthenticated,
} from "../../lib/auth";
import {
  createSubscriptionIntent,
  fetchMyEntitlements,
  getPaymentStatus,
  PAYPAL_BUTTON_IMAGE,
  PAYPAL_FORM_ACTION,
  paypalHostedButtonIdFallback,
  quoteSubscription,
  SUBSCRIPTION_SERVICES,
  type BillingPeriod,
  type EntitlementRecord,
  type PaymentIntentResponse,
} from "../../lib/payments";
import "./SubscriptionPage.css";

export default function SubscriptionPage() {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [selected, setSelected] = useState<string[]>(["playlist"]);
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const total = useMemo(
    () => quoteSubscription(selected, billingPeriod),
    [selected, billingPeriod],
  );

  const buttonId =
    intent?.hosted_button_id || paypalHostedButtonIdFallback() || "PLACEHOLDER_HOSTED_BUTTON";

  useEffect(() => {
    const ok = isAuthenticated();
    setAuthed(ok);
    if (!ok) return;
    const sessionEmail = getAuthEmailFromToken() ?? "";
    setEmail(sessionEmail);
    void fetchMyEntitlements().then(setEntitlements);
  }, []);

  function toggleService(serviceId: string) {
    setSelected((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
    setIntent(null);
    setMessage("");
    setError("");
  }

  async function handlePrepare(event: FormEvent) {
    event.preventDefault();
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
        billingPeriod,
      );
      if (!data) {
        setError(apiError ?? "Could not create payment intent.");
        return;
      }
      setIntent(data);
      setMessage(
        `Intent ${data.intent_id} ready for ${data.product_name}. Total: $${data.amount} ${data.currency}.`,
      );
    } catch {
      setError("Network error — is the Next backend running on :3001?");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckStatus() {
    if (!intent?.intent_id) return;
    setLoading(true);
    try {
      const status = await getPaymentStatus(intent.intent_id);
      if (!status) {
        setError("Could not load payment status.");
        return;
      }
      setMessage(`Payment status: ${status.status}`);
      setEntitlements(await fetchMyEntitlements());
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <section className="subscription-page subscription-page--gate">
        <p className="subscription-page__brand">Payments</p>
        <h1 className="subscription-page__title">Subscription</h1>
        <p className="subscription-page__lead">
          Sign in so payment intents attach to your verified email via{" "}
          <code>POST /api/payments/intents</code> (JWT required).
        </p>
        <div className="subscription-page__cta-row">
          <a
            className="btn btn--primary"
            href={`${APP_ROUTES.login}?next=${encodeURIComponent(APP_ROUTES.subscription)}`}
          >
            Sign in to subscribe
          </a>
          <a className="btn" href={APP_ROUTES.contact}>
            Talk to Eduardo
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="subscription-page">
      <header>
        <p className="subscription-page__brand">Payments</p>
        <h1 className="subscription-page__title">Subscription</h1>
        <p className="subscription-page__lead">
          Music, Pamphlet, Homescool, and Videos are $1/month each; Debate App is
          $3/month. Yearly is 10× the monthly total. Prepare a checkout intent,
          then use the PayPal hosted button (
          <code>PAYPAL_HOSTED_BUTTON_ID</code>).
        </p>
      </header>

      <div className="subscription-page__period" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`btn ${billingPeriod === "monthly" ? "btn--primary" : ""}`}
          onClick={() => {
            setBillingPeriod("monthly");
            setIntent(null);
          }}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`btn ${billingPeriod === "yearly" ? "btn--primary" : ""}`}
          onClick={() => {
            setBillingPeriod("yearly");
            setIntent(null);
          }}
        >
          Yearly
        </button>
      </div>

      <div className="subscription-page__services">
        {SUBSCRIPTION_SERVICES.map((service) => {
          const checked = selected.includes(service.id);
          return (
            <label
              key={service.id}
              className={`subscription-page__service${checked ? " subscription-page__service--selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleService(service.id)}
              />
              <span>
                <strong>
                  {service.label}{" "}
                  <span className="subscription-page__price">
                    ${service.monthlyUsd}/mo
                  </span>
                </strong>
                <span className="subscription-page__service-desc">{service.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="subscription-page__total">
        Total: <strong>${total.toFixed(2)} USD</strong>
      </p>

      <form className="subscription-page__prepare" onSubmit={(e) => void handlePrepare(e)}>
        <div className="form-field">
          <label htmlFor="subscription-email">Registered email</label>
          <input id="subscription-email" type="email" value={email} readOnly />
        </div>
        <div className="subscription-page__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={loading || selected.length === 0}
          >
            {loading ? "Preparing…" : "Prepare checkout"}
          </button>
          {intent ? (
            <button
              className="btn"
              type="button"
              onClick={() => void handleCheckStatus()}
              disabled={loading}
            >
              Check status
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="subscription-page__error">{error}</p> : null}
      {message ? <p className="subscription-page__status">{message}</p> : null}

      <form
        className="subscription-page__checkout"
        action={intent?.paypal_checkout_url || PAYPAL_FORM_ACTION}
        method="post"
        target="_top"
      >
        <input type="hidden" name="cmd" value="_s-xclick" />
        <input type="hidden" name="hosted_button_id" value={buttonId} />
        <input type="hidden" name="currency_code" value={intent?.currency || "USD"} />
        {intent ? (
          <>
            <input type="hidden" name="custom" value={intent.intent_id} />
            <input type="hidden" name="invoice" value={intent.intent_id} />
          </>
        ) : null}
        <input type="hidden" name="bn" value="EduardoOS_SP" />
        <button type="submit" className="subscription-page__paypal-btn" disabled={!intent}>
          <img src={PAYPAL_BUTTON_IMAGE} alt="Pay with PayPal" />
        </button>
        {!intent ? (
          <p className="subscription-page__hint">
            Prepare checkout to enable the PayPal button (hosted id: {buttonId}).
          </p>
        ) : null}
      </form>

      {entitlements.length > 0 ? (
        <section className="subscription-page__entitlements" aria-label="Active services">
          <h2>Your active services</h2>
          <ul>
            {entitlements.map((item) => (
              <li key={item.service_id}>
                <strong>{item.service_label}</strong> until{" "}
                {new Date(item.valid_until).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
