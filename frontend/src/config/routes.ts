/** Central map of frontend page routes (Astro pages, not API). */
export const APP_ROUTES = {
  home: "/",
  login: "/auth/login",
  register: "/auth/register",
  verifyOtp: "/auth/verify-otp",
  logger: "/observability/logger",
  tester: "/observability/tester",
} as const;

/** Public gateway observability API endpoints. */
export const OBSERVABILITY_ROUTES = {
  logger: "/api/logger",
  tester: "/api/tester",
} as const;
