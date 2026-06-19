/**
 * AuthForm.tsx — Login, register, and OTP verification with client validation.
 */
import { useState, type FormEvent } from "react";
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

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validateForm(): boolean {
    const errors: FieldErrors = {
      email: validateEmail(email) ?? undefined,
    };
    if (mode !== "verify-otp") {
      errors.password = validatePassword(password) ?? undefined;
    }
    if (mode === "verify-otp") {
      errors.otp = validateOtp(otp) ?? undefined;
    }
    setFieldErrors(errors);
    return !errors.email && !errors.password && !errors.otp;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "register") {
        const { result, log } = await registerUser({ email, password });
        if (!result) {
          setError("Registration failed");
          return;
        }
        setMessage(`${result.message} (trace: ${log.correlationId})`);
      } else if (mode === "login") {
        const { result, log } = await loginUser({ email, password });
        if (!result) {
          setError("Login failed");
          return;
        }
        setMessage(`${result.message} (trace: ${log.correlationId})`);
      } else {
        const { result, log } = await verifyOtp({ email, otp });
        if (!result) {
          setError("OTP verification failed");
          return;
        }
        setMessage(`${result.message} (trace: ${log.correlationId})`);
      }
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

  return (
    <form className="auth-form panel" onSubmit={handleSubmit}>
      <h1 className="panel__title">{titles[mode]}</h1>

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
        />
        {fieldErrors.email && (
          <span className="field-error">{fieldErrors.email}</span>
        )}
      </div>

      {mode !== "verify-otp" && (
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

      {mode === "verify-otp" && (
        <div
          className={`form-field ${fieldErrors.otp ? "form-field--error" : ""}`}
        >
          <label htmlFor="auth-otp">One-time code</label>
          <input
            id="auth-otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            autoComplete="one-time-code"
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
          {loading ? "Working…" : titles[mode]}
        </button>
      </div>
    </form>
  );
}
