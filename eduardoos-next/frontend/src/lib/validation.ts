/**
 * Client-side field validators used before auth / observability form submit.
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
