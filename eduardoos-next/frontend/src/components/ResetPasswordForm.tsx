/**
 * Forgot / reset password two-step form.
 */

import { useState, type FormEvent } from "react";
import { APP_ROUTES } from "../config/routes";
import { confirmPasswordReset, requestPasswordReset } from "../lib/auth";
import { validateEmail, validateOtp, validatePassword } from "../lib/validation";
import PasswordField from "./PasswordField/PasswordField";
import "./AuthForm.css";

type ResetStep = "email" | "code";

export default function ResetPasswordForm() {
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    otp?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateEmailStep(): boolean {
    const emailErr = validateEmail(email) ?? undefined;
    setFieldErrors({ email: emailErr });
    return !emailErr;
  }

  function validateCodeStep(): boolean {
    const errors = {
      otp: validateOtp(otp) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirm: password !== confirm ? "Passwords do not match" : undefined,
    };
    setFieldErrors(errors);
    return !errors.otp && !errors.password && !errors.confirm;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (step === "email") {
      if (!validateEmailStep()) return;
      setLoading(true);
      try {
        const { result, correlationId, error: apiError } = await requestPasswordReset(email);
        if (!result) {
          setError(apiError?.message ?? "Could not send reset code");
          return;
        }
        setMessage(`${result.message} (trace: ${correlationId})`);
        setStep("code");
        setOtp("");
        setPassword("");
        setConfirm("");
      } catch {
        setError("Network error — is the Next backend running on :3001?");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!validateCodeStep()) return;
    setLoading(true);
    try {
      const { result, correlationId, error: apiError } = await confirmPasswordReset({
        email,
        otp,
        password,
      });
      if (!result) {
        setError(apiError?.message ?? "Could not reset password");
        return;
      }
      setMessage(`${result.message} (trace: ${correlationId})`);
      window.location.href = `${APP_ROUTES.login}?reset=1`;
    } catch {
      setError("Network error — is the Next backend running on :3001?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form panel" onSubmit={(e) => void handleSubmit(e)}>
      <h1 className="panel__title">Reset password</h1>
      <p className="auth-form__otp-hint">
        {step === "email"
          ? "Enter the email on your account. If it is registered, we will send a 6-digit code."
          : "Enter the code from your inbox and choose a new password."}
      </p>

      <div className={`form-field ${fieldErrors.email ? "form-field--error" : ""}`}>
        <label htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          readOnly={step === "code"}
        />
        {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
      </div>

      {step === "code" ? (
        <>
          <div
            className={`form-field auth-form__otp-field ${fieldErrors.otp ? "form-field--error" : ""}`}
          >
            <label htmlFor="reset-otp">Reset code</label>
            <input
              id="reset-otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              placeholder="123456"
              autoFocus
            />
            {fieldErrors.otp ? <span className="field-error">{fieldErrors.otp}</span> : null}
          </div>
          <PasswordField
            id="reset-password"
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <PasswordField
            id="reset-confirm"
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={fieldErrors.confirm}
          />
        </>
      ) : null}

      {error ? <p className="status-message status-message--error">{error}</p> : null}
      {message ? <p className="status-message status-message--success">{message}</p> : null}

      <div className="panel__actions">
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Working…" : step === "email" ? "Send code" : "Update password"}
        </button>
        {step === "code" ? (
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => {
              setStep("email");
              setOtp("");
              setPassword("");
              setConfirm("");
              setError("");
            }}
          >
            Back
          </button>
        ) : null}
      </div>
      <p className="auth-form__links">
        <a href={APP_ROUTES.login}>Back to sign in</a>
      </p>
    </form>
  );
}
