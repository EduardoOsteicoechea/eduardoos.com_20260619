/**
 * PayPalSubscriptionForm.tsx — Monthly basic subscription via PayPal hosted button.
 *
 * Flow:
 * 1. User enters the email used during registration/OTP verification.
 * 2. Frontend creates a payment intent via /api/payments/intents.
 * 3. PayPal form includes `custom=intent_id` so IPN links payment to user.
 */
import { useState, type FormEvent } from "react";
import {
  createPaymentIntent,
  getPaymentStatus,
  PAYPAL_BUTTON_IMAGE,
  PAYPAL_FORM_ACTION,
} from "../../lib/payments";
import { validateEmail } from "../../lib/validation";
import "./PayPalSubscriptionForm.css";

const PLAN_ID = "subscription_monthly_basic";
const HOSTED_BUTTON_ID = "QEVGD66SG7LXN";

export default function PayPalSubscriptionForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [intentId, setIntentId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePrepare(event: FormEvent) {
    event.preventDefault();
    const validationError = validateEmail(email);
    setEmailError(validationError ?? "");
    if (validationError) return;

    setLoading(true);
    setError("");
    setMessage("");
    setIntentId("");

    try {
      const { data } = await createPaymentIntent(email, PLAN_ID);
      if (!data) {
        setError(
          "Could not create payment intent. Register and verify your email first."
        );
        return;
      }
      setIntentId(data.intent_id);
      setMessage(
        `Intent ${data.intent_id} created for ${data.email}. Complete checkout with PayPal below.`
      );
    } catch {
      setError("Network error — is the gateway running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckStatus() {
    if (!intentId) return;
    setLoading(true);
    try {
      const status = await getPaymentStatus(intentId);
      if (!status) {
        setError("Could not load payment status");
        return;
      }
      setMessage(
        `Status: ${status.status}${status.paypal_txn_id ? ` (txn: ${status.paypal_txn_id})` : ""}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paypal-subscription panel">
      <h1 className="panel__title">Monthly Basic Subscription</h1>
      <p className="page-lead">
        Subscribe with PayPal. Use the same email you registered and verified on
        this site so we can associate the payment with your account.
      </p>

      <form className="paypal-subscription__prepare" onSubmit={handlePrepare}>
        <div className={`form-field ${emailError ? "form-field--error" : ""}`}>
          <label htmlFor="payment-email">Registered email</label>
          <input
            id="payment-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {emailError && <span className="field-error">{emailError}</span>}
        </div>
        <div className="panel__actions">
          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Preparing…" : "Prepare checkout"}
          </button>
          {intentId && (
            <button
              className="btn"
              type="button"
              onClick={handleCheckStatus}
              disabled={loading}
            >
              Check status
            </button>
          )}
        </div>
      </form>

      {error && <p className="status-message status-message--error">{error}</p>}
      {message && (
        <p className="status-message status-message--success">{message}</p>
      )}

      {intentId && (
        <form
          className="paypal-subscription__checkout"
          action={PAYPAL_FORM_ACTION}
          method="post"
          target="_top"
        >
          <input type="hidden" name="cmd" value="_s-xclick" />
          <input
            type="hidden"
            name="hosted_button_id"
            value={HOSTED_BUTTON_ID}
          />
          <input type="hidden" name="currency_code" value="USD" />
          <input type="hidden" name="custom" value={intentId} />
          <input type="hidden" name="invoice" value={intentId} />
          <input type="hidden" name="bn" value="EduardoOS_SP" />
          <button type="submit" className="paypal-subscription__image-btn">
            <img
              src={PAYPAL_BUTTON_IMAGE}
              alt="Buy Now"
              title="PayPal is a secure and easy way to pay online."
            />
          </button>
        </form>
      )}
    </div>
  );
}
