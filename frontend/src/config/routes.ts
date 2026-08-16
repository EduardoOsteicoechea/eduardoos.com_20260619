export const APP_ROUTES = {
    home: "/",
    contact: "/contact",
    login: "/auth/login",
    register: "/auth/register",
    verifyOtp: "/auth/verify-otp",
    resetPassword: "/auth/reset-password",
    logger: "/observability/logger",
    tester: "/observability/tester",
    subscription: "/payments/subscription",
    profile: "/auth/profile",
    mediaGallery: "/media/gallery",
    mediaPlaylist: "/media/musica",
    pamphlet: "/documents/pamphlet",
    articles: "/articulos",
    article: (id: string) => `/articulos/ver?id=${encodeURIComponent(id)}`,
    homescool: "/homescool",
    bim: "/bim",
    apsAdmin: "/aps-admin",
    /** UI: Debate App. Format/API remain `.edebat` / `/api/edebat`. */
    debateApp: "/debate-app",
    /** @deprecated Prefer debateApp — same path. */
    edebat: "/debate-app",
} as const;
export const EDEBAT_API_ROUTES = {
    list: "/api/edebat",
    create: "/api/edebat",
    item: (id: string) => `/api/edebat/${encodeURIComponent(id)}`,
    turn: (id: string) => `/api/edebat/${encodeURIComponent(id)}/turn`,
} as const;
export const APS_ROUTES = {
    triggerWorkItem: "/api/aps/trigger-workitem",
    workItemStatus: (id: string, outputObjectKey: string) =>
        `/api/aps/workitems/${encodeURIComponent(id)}?outputObjectKey=${encodeURIComponent(outputObjectKey)}`,
} as const;
export const MEDIA_ROUTES = {
    upload: "/api/media/upload",
    uploadMultiple: "/api/media/upload/multiple",
    objects: "/api/media/objects",
    images: "/api/media/images",
    file: "/api/media/file",
} as const;
export const PLAYLIST_ROUTES = {
    save: "/api/playlists",
    list: "/api/playlists",
} as const;
export const EPAM_ROUTES = {
    list: "/api/epams",
    save: "/api/epams",
    item: (epamId: string) => `/api/epams/${encodeURIComponent(epamId)}`,
} as const;
export const BIM_ROUTES = {
    list: "/api/bim/models",
    upload: "/api/bim/models",
    file: (modelId: string) => `/api/bim/models/${encodeURIComponent(modelId)}/file`,
    item: (modelId: string) => `/api/bim/models/${encodeURIComponent(modelId)}`,
} as const;
export const ARTICLE_ROUTES = {
    list: "/api/articles",
    item: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}`,
    quiz: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}/quiz`,
    ask: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}/ask`,
} as const;
export const DOCUMENT_ROUTES = {
    pamphletPdf: "/api/documents/pamphlet/pdf",
} as const;
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
export const PAYMENT_ROUTES = {
    intents: "/api/payments/intents",
    status: "/api/payments/status",
    entitlements: "/api/subscriptions/entitlements",
    entitlementsPreview: "/api/subscriptions/entitlements/preview",
    webhook: "/api/payments/webhook/paypal",
} as const;
