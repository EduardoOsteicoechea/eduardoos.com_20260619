/** Central map of frontend page routes (Astro pages, not API). */
export const APP_ROUTES = {
  home: "/",
  login: "/auth/login",
  register: "/auth/register",
  verifyOtp: "/auth/verify-otp",
  logger: "/observability/logger",
  tester: "/observability/tester",
  subscriptionMonthlyBasic: "/payments/subscription/montly/basic",
  mediaGallery: "/media/gallery",
  mediaPlaylist: "/media/playlist",
  pamphlet: "/documents/pamphlet",
  pamphletV2: "/documents/pamphlet-v2",
} as const;

/** Public gateway media API endpoints. */
export const MEDIA_ROUTES = {
  upload: "/api/media/upload",
  uploadMultiple: "/api/media/upload/multiple",
  objects: "/api/media/objects",
  images: "/api/media/images",
  file: "/api/media/file",
} as const;

/** Authenticated playlist gateway endpoints. */
export const PLAYLIST_ROUTES = {
  save: "/api/playlists",
  list: "/api/playlists",
} as const;

/** Public gateway observability API endpoints. */
export const OBSERVABILITY_ROUTES = {
  logger: "/api/logger",
  logs: "/api/logger/logs",
  stream: "/api/logger/stream",
  analytics: "/api/logger/analytics",
  trace: "/api/logger/trace",
  tester: "/api/tester",
  testerRuns: "/api/tester/runs",
  testerReport: "/api/tester/report",
} as const;

/** Public gateway payment API endpoints. */
export const PAYMENT_ROUTES = {
  intents: "/api/payments/intents",
  status: "/api/payments/status",
  webhook: "/api/payments/webhook/paypal",
} as const;
