/**
 * AuthForm.tsx — React island for login, register, and OTP verification.
 */
import { useState, type FormEvent } from "react";
import { loginUser, registerUser, verifyOtp } from "../lib/auth";
import "./AuthForm.css";

export type AuthMode = "login" | "register" | "verify-otp";

interface AuthFormProps {
  mode: AuthMode;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1 className="auth-form__title">{titles[mode]}</h1>

      <label className="auth-form__field">
        <span>Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>

      {mode !== "verify-otp" && (
        <label className="auth-form__field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        </label>
      )}

      {mode === "verify-otp" && (
        <label className="auth-form__field">
          <span>One-time code</span>
          <input
            type="text"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            autoComplete="one-time-code"
          />
        </label>
      )}

      {error && <p className="auth-form__error">{error}</p>}
      {message && <p className="auth-form__success">{message}</p>}

      <button className="auth-form__submit" type="submit" disabled={loading}>
        {loading ? "Working…" : titles[mode]}
      </button>
    </form>
  );
}
