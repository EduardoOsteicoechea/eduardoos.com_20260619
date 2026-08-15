/**
 * Application page paths and API route helpers for Eduardo OS Next.
 * Mirrors production IA so cutover can keep the same URLs.
 */

export const APP_ROUTES = {
  home: "/",
  contact: "/contact",
  login: "/auth/login",
  register: "/auth/register",
  verifyOtp: "/auth/verify-otp",
  resetPassword: "/auth/reset-password",
  profile: "/auth/profile",
  subscription: "/payments/subscription",
  mediaGallery: "/media/gallery",
  mediaPlaylist: "/media/musica",
  pamphlet: "/documents/pamphlet",
  articles: "/articulos",
  article: (id: string) => `/articulos/ver?id=${encodeURIComponent(id)}`,
  homescool: "/homescool",
  bim: "/bim",
  apsAdmin: "/aps-admin",
  edebat: "/edebat",
} as const;

export const AUTH_API_ROUTES = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  verifyOtp: "/api/auth/verify-otp",
  forgotPassword: "/api/auth/forgot-password",
  resetPassword: "/api/auth/reset-password",
  logout: "/api/auth/logout",
  profile: "/api/auth/profile",
} as const;

export const APS_ROUTES = {
  triggerWorkItem: "/api/aps/trigger-workitem",
  workItemStatus: (id: string, outputObjectKey: string) =>
    `/api/aps/workitems/${encodeURIComponent(id)}?outputObjectKey=${encodeURIComponent(outputObjectKey)}`,
  registry: "/api/aps/registry",
  hubs: "/api/aps/hubs",
  projects: (hubId: string) =>
    `/api/aps/hubs/${encodeURIComponent(hubId)}/projects`,
  contents: (hubId: string, projectId: string, folderId?: string) => {
    const base = `/api/aps/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/contents`;
    if (!folderId) return base;
    return `${base}?folderId=${encodeURIComponent(folderId)}`;
  },
} as const;

export const CONTACT_API_ROUTES = {
  ask: "/api/contact/ask",
  profileAsk: "/api/profile/ask",
} as const;

export const BIM_ROUTES = {
  list: "/api/bim/models",
  upload: "/api/bim/models",
  file: (modelId: string) =>
    `/api/bim/models/${encodeURIComponent(modelId)}/file`,
  item: (modelId: string) => `/api/bim/models/${encodeURIComponent(modelId)}`,
} as const;

export const PAYMENT_ROUTES = {
  intents: "/api/payments/intents",
  status: "/api/payments/status",
} as const;
