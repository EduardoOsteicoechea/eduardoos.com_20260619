/**
 * validation.ts — Client-side field validators for auth and observability forms.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^[0-9]{6}$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export function validateOtp(otp: string): string | null {
  const trimmed = otp.trim();
  if (!trimmed) return "One-time code is required";
  if (!OTP_PATTERN.test(trimmed)) return "Code must be exactly 6 digits";
  return null;
}

export function validateLoggerEvent(event: string): string | null {
  const trimmed = event.trim();
  if (!trimmed) return "Event name is required";
  if (trimmed.length < 3) return "Event name must be at least 3 characters";
  return null;
}

export function validateTesterScript(script: string): string | null {
  const trimmed = script.trim();
  if (!trimmed) return "Script name is required";
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return "Script may only contain letters, numbers, hyphens, and underscores";
  }
  return null;
}
