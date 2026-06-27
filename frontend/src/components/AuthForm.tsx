/**
 * AuthForm.tsx — Login, register, and OTP verification with client validation.
 *
 * Register sends an OTP email first; the form then reveals the code field on the same page.
 * Login for unverified accounts also prompts for the pending OTP.
 */
import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../config/routes";
import { loginUser, registerUser, verifyOtp } from "../lib/auth";
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

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<FormStep>(
    needsOtpStep(mode) ? "otp" : "credentials",
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [redirectTo, setRedirectTo] = useState(APP_ROUTES.home);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/")) {
      setRedirectTo(next);
    }
  }, []);

  function finishAuth(messageText: string, traceId: string) {
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
    setStep("otp");
    setError("");
    setMessage(`${hint} (trace: ${traceId})`);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (showOtpField) {
        const { result, log } = await verifyOtp({ email, otp });
        if (!result?.token) {
          setError("OTP verification failed — check the code and try again");
          return;
        }
        setMessage(`${result.message} (trace: ${log.correlationId})`);
        finishAuth(result.message, log.correlationId);
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
        if (!result.token) {
          goToOtpStep(
            log.correlationId,
            "We emailed you a 6-digit code. Enter it below to finish creating your account.",
          );
          return;
        }
        setMessage(`${result.message} (trace: ${log.correlationId})`);
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
      setMessage(`${result.message} (trace: ${log.correlationId})`);
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

  const submitLabel = showOtpField
    ? "Verify email"
    : titles[mode];

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
          readOnly={showOtpField && mode === "register"}
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
          className={`form-field ${fieldErrors.otp ? "form-field--error" : ""}`}
        >
          <label htmlFor="auth-otp">One-time code</label>
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
