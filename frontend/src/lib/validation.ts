/**
 * Client-side field validators used before auth / observability form submit.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^[0-9]{6}$/;
const PHONE_PATTERN = /^[\d\s+\-()./]{7,22}$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required";
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address";
  return null;
}

/** Optional correo: empty OK; otherwise must look like an email. */
export function validateOptionalEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address";
  return null;
}

/** Optional teléfono: empty OK; otherwise digits + common separators, ≥7 digits. */
export function validateOptionalPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (!PHONE_PATTERN.test(trimmed)) return "Enter a valid phone number";
  const digits = (trimmed.match(/\d/g) || []).length;
  if (digits < 7 || digits > 15) return "Enter a valid phone number";
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
