/**
 * AuthForm.tsx — Login, register, and OTP verification with client validation.
 *
 * Register sends an OTP email first; the form then reveals the code field on the same page.
 * The OTP step is mirrored in the URL (?step=otp&email=…) so it survives hydration/remounts.
 */
import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../config/routes";
import { hasIssuedToken, loginUser, registerUser, verifyOtp } from "../lib/auth";
import {
  validateEmail,
  validateOtp,
  validatePassword,
} from "../lib/validation";
import "./AuthForm.css";

export type AuthMode = "login" | "register" | "verify-otp";

interface AuthFormProps {
  mode: AuthMode;
}

interface FieldErrors {
  email?: string;
  password?: string;
  otp?: string;
}

type FormStep = "credentials" | "otp";

function needsOtpStep(mode: AuthMode): boolean {
  return mode === "verify-otp";
}

function readOtpStepFromUrl(): { step: FormStep; email: string } {
  if (typeof window === "undefined") {
    return { step: "credentials", email: "" };
  }
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") ?? "";
  if (params.get("step") === "otp") {
    return { step: "otp", email };
  }
  return { step: "credentials", email };
}

function persistOtpStep(email: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("step", "otp");
  url.searchParams.set("email", email);
  window.history.replaceState({}, "", url);
}

function clearOtpStepFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("step");
  url.searchParams.delete("email");
  window.history.replaceState({}, "", url);
}

export default function AuthForm({ mode }: AuthFormProps) {
  const initialUrl = readOtpStepFromUrl();
  const [email, setEmail] = useState(initialUrl.email);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<FormStep>(
    needsOtpStep(mode) ? "otp" : initialUrl.step,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirectTo, setRedirectTo] = useState(APP_ROUTES.home);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/")) {
      setRedirectTo(next);
    }
    const fromUrl = readOtpStepFromUrl();
    if (fromUrl.step === "otp") {
      setStep("otp");
      if (fromUrl.email) {
        setEmail(fromUrl.email);
      }
    }
  }, []);

  function finishAuth(messageText: string, traceId: string) {
    clearOtpStepFromUrl();
    setMessage(`${messageText} (trace: ${traceId})`);
    window.location.href = redirectTo;
  }

  const showOtpField = step === "otp";
  const showPasswordField = !showOtpField && mode !== "verify-otp";

  function validateForm(): boolean {
    const errors: FieldErrors = {
      email: validateEmail(email) ?? undefined,
    };
    if (showPasswordField) {
      errors.password = validatePassword(password) ?? undefined;
    }
    if (showOtpField) {
      errors.otp = validateOtp(otp) ?? undefined;
    }
    setFieldErrors(errors);
    return !errors.email && !errors.password && !errors.otp;
  }

  function goToOtpStep(traceId: string, hint: string) {
    persistOtpStep(email);
    setStep("otp");
    setError("");
    setMessage(`${hint} (trace: ${traceId})`);
    setFieldErrors({});
    setOtp("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError("");
    if (!showOtpField) {
      setMessage("");
    }

    try {
      if (showOtpField) {
        const { result, log } = await verifyOtp({ email, otp });
        if (!hasIssuedToken(result)) {
          setError("OTP verification failed — check the code and try again");
          return;
        }
        finishAuth(result!.message, log.correlationId);
        return;
      }

      if (mode === "register") {
        const { result, log, error: apiError } = await registerUser({
          email,
          password,
        });
        if (!result) {
          setError(apiError?.message ?? "Registration failed");
          return;
        }
        if (!hasIssuedToken(result)) {
          goToOtpStep(
            log.correlationId,
            "We emailed you a 6-digit code. Enter it below to finish creating your account.",
          );
          return;
        }
        finishAuth(result.message, log.correlationId);
        return;
      }

      const { result, log, error: apiError } = await loginUser({ email, password });
      if (!result) {
        const apiMessage = apiError?.message ?? "";
        if (apiMessage.toLowerCase().includes("not verified")) {
          goToOtpStep(
            log.correlationId,
            "Your email is not verified yet. Enter the 6-digit code we sent when you registered.",
          );
          return;
        }
        setError(apiMessage || "Login failed");
        return;
      }
      finishAuth(result.message, log.correlationId);
    } catch {
      setError("Network error — is the gateway running?");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<AuthMode, string> = {
    login: "Sign in",
    register: "Create account",
    "verify-otp": "Verify email",
  };

  const submitLabel = showOtpField ? "Verify email" : titles[mode];

  return (
    <form className="auth-form panel" onSubmit={handleSubmit}>
      <h1 className="panel__title">
        {showOtpField && mode !== "verify-otp"
          ? "Verify your email"
          : titles[mode]}
      </h1>

      <div
        className={`form-field ${fieldErrors.email ? "form-field--error" : ""}`}
      >
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          readOnly={showOtpField}
        />
        {fieldErrors.email && (
          <span className="field-error">{fieldErrors.email}</span>
        )}
      </div>

      {showPasswordField && (
        <div
          className={`form-field ${fieldErrors.password ? "form-field--error" : ""}`}
        >
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
          {fieldErrors.password && (
            <span className="field-error">{fieldErrors.password}</span>
          )}
        </div>
      )}

      {showOtpField && (
        <div
          className={`form-field auth-form__otp-field ${fieldErrors.otp ? "form-field--error" : ""}`}
        >
          <label htmlFor="auth-otp">One-time code</label>
          <p className="auth-form__otp-hint">
            Check your inbox for a 6-digit code. If SMTP is not configured on the server, ask the admin for the code in the authenticator logs.
          </p>
          <input
            id="auth-otp"
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
          {fieldErrors.otp && (
            <span className="field-error">{fieldErrors.otp}</span>
          )}
        </div>
      )}

      {error && <p className="status-message status-message--error">{error}</p>}
      {message && (
        <p className="status-message status-message--success">{message}</p>
      )}

      <div className="panel__actions">
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Working…" : submitLabel}
        </button>
        {showOtpField && mode !== "verify-otp" && (
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => {
              clearOtpStepFromUrl();
              setStep("credentials");
              setOtp("");
              setMessage("");
              setError("");
            }}
          >
            Back
          </button>
        )}
      </div>
    </form>
  );
}
