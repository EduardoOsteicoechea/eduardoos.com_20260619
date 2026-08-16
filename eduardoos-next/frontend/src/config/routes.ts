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
  /** Public page path (UI label: Debate App). Format/API stay `.edebat` / `/api/edebat`. */
  debateApp: "/debate-app",
  /** @deprecated Prefer debateApp — same path; kept for existing imports. */
  edebat: "/debate-app",
  /** The Instrumentalist — belief tree + formal-logic agent (.instru). */
  instrumentalist: "/instrumentalist",
  adminUsers: "/admin/users",
} as const;

export const AUTH_API_ROUTES = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  verifyOtp: "/api/auth/verify-otp",
  forgotPassword: "/api/auth/forgot-password",
  resetPassword: "/api/auth/reset-password",
  logout: "/api/auth/logout",
  profile: "/api/auth/profile",
  profileImage: "/api/auth/profile/image",
} as const;

export const APS_ROUTES = {
  triggerWorkItem: "/api/aps/trigger-workitem",
  workItemStatus: (id: string, outputObjectKey: string) =>
    `/api/aps/workitems/${encodeURIComponent(id)}?outputObjectKey=${encodeURIComponent(outputObjectKey)}`,
  registry: "/api/aps/registry",
  hubs: "/api/aps/hubs",
  projects: (hubId: string) =>
    `/api/aps/hubs/${encodeURIComponent(hubId)}/projects`,
  /** Matches Next backend: GET /api/aps/projects/{projectId}/contents?folderId= */
  contents: (projectId: string, folderId: string) =>
    `/api/aps/projects/${encodeURIComponent(projectId)}/contents?folderId=${encodeURIComponent(folderId)}`,
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

export const EPAM_ROUTES = {
  list: "/api/epams",
  save: "/api/epams",
  seriesTree: "/api/epams/series-tree",
  item: (epamId: string) => `/api/epams/${encodeURIComponent(epamId)}`,
} as const;

/** Server PDF print for the pamphlet generator (Next may stub until documents service lands). */
export const DOCUMENT_ROUTES = {
  pamphletPdf: "/api/documents/pamphlet/pdf",
} as const;

export const EDEBAT_ROUTES = {
  list: "/api/edebat",
  create: "/api/edebat",
  item: (id: string) => `/api/edebat/${encodeURIComponent(id)}`,
  turn: (id: string) => `/api/edebat/${encodeURIComponent(id)}/turn`,
} as const;

export const INSTRUMENTALIST_ROUTES = {
  list: "/api/instrumentalist",
  create: "/api/instrumentalist",
  item: (id: string) => `/api/instrumentalist/${encodeURIComponent(id)}`,
  analyze: (id: string) => `/api/instrumentalist/${encodeURIComponent(id)}/analyze`,
  chat: (id: string) => `/api/instrumentalist/${encodeURIComponent(id)}/chat`,
} as const;

export const PLAYLIST_ROUTES = {
  list: "/api/playlists",
  save: "/api/playlists",
  item: (playlistId: string) =>
    `/api/playlists/${encodeURIComponent(playlistId)}`,
  tracks: (playlistId: string) =>
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
} as const;

export const PAYMENT_ROUTES = {
  intents: "/api/payments/intents",
  status: "/api/payments/status",
  entitlements: "/api/subscriptions/entitlements",
  entitlementsPreview: "/api/subscriptions/entitlements/preview",
  access: "/api/subscriptions/access",
  catalog: "/api/subscriptions/catalog",
} as const;

export const ADMIN_ROUTES = {
  users: "/api/admin/users",
  services: "/api/admin/services",
  userEntitlements: (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}/entitlements?email=${encodeURIComponent(email)}`,
  // Prefer ?email= so dotted / encoded local-parts are not lost if the path
  // param stays percent-encoded (%40) after chi routing.
  deleteUser: (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}?email=${encodeURIComponent(email)}`,
} as const;
