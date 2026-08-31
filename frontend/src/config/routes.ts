/**
 * Application page paths and API route helpers for Eduardo OS.
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
  mediaPlaylist: "/media/musica",
  pamphlet: "/documents/pamphlet",
  articles: "/articulos",
  article: (id: string) => `/articulos/ver?id=${encodeURIComponent(id)}`,
  homescool: "/homescool",
  homescoolRegisterStudent: "/homescool/register-student",
  homescoolStudents: "/homescool/students",
  homescoolStudent: (slug: string) =>
    `/homescool/students/${encodeURIComponent(slug)}`,
  homescoolStudentWorkspace: "/homescool/students/workspace",
  homescoolLearning: "/homescool/learning",
  /** Church registry, overview, activities (JWT + church-* membership). */
  church: "/church",
  churchRegister: "/church/register",
  churchOverview: "/church/overview",
  churchActivity: "/church/activity",
  churchGroups: "/church/groups",
  churchLeaders: "/church/leaders",
  churchDetail: (denomId: string, churchId: string) =>
    `/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}`,
  churchWorkspace: "/church/workspace",
  /** Scrib layered manuscript books (subscription). */
  scrib: "/scrib",
  scribSheet: (userSafe: string, bookId: string, sheetId: string) =>
    `/scrib/${encodeURIComponent(userSafe)}/${encodeURIComponent(bookId)}/${encodeURIComponent(sheetId)}`,
  scribSheetWorkspace: "/scrib/sheet",
  /** eReport Issue Tracker (subscription). */
  ereport: "/ereport",
  ereportUser: (userSafe: string) =>
    `/ereport/${encodeURIComponent(userSafe)}`,
  ereportReport: (userSafe: string, reportId: string) =>
    `/ereport/${encodeURIComponent(userSafe)}/${encodeURIComponent(reportId)}`,
  ereportHub: "/ereport/hub",
  ereportWorkspace: "/ereport/workspace",
  /** eVoice text-to-audio projects (subscription / allowlist). */
  evoice: "/evoice",
  /** Public Calvin’s Institutes reader (S3-backed). */
  calvinsInstitutes: "/latin/calvins-institutes",
  adminUsers: "/admin/users",
  agentSandbox: "/admin/agent-sandbox",
  /** Admin-only BIM IFC viewer (That Open + host Python console). */
  bimIfcViewer: "/bim/ifc/viewer",
  /** Admin-only APS webhook live monitor (product-tests). */
  apsWebhookMonitor: "/product-tests/mps/aps-webhook",
  /** Admin-only MPS meeting probes console. */
  mpsMeetingProbes: "/product-tests/mps/meeting-probes",
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

export const CONTACT_API_ROUTES = {
  ask: "/api/contact/ask",
  profileAsk: "/api/profile/ask",
} as const;

export const EPAM_ROUTES = {
  list: "/api/epams",
  save: "/api/epams",
  seriesTree: "/api/epams/series-tree",
  footers: "/api/epams/footers",
  footer: (footerId: string) => `/api/epams/footers/${encodeURIComponent(footerId)}`,
  item: (epamId: string) => `/api/epams/${encodeURIComponent(epamId)}`,
  copy: (epamId: string) => `/api/epams/${encodeURIComponent(epamId)}/copy`,
} as const;

/** Public pamphlet-as-article APIs (no JWT required; Bearer scopes to that user). */
export const ARTICLE_ROUTES = {
  list: "/api/articles",
  indexHtml: "/api/articles/index.html",
  item: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}`,
  text: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}/text`,
  html: (epamId: string) => `/api/articles/${encodeURIComponent(epamId)}/html`,
} as const;

/** Server PDF print for the pamphlet generator. */
export const DOCUMENT_ROUTES = {
  pamphletPdf: "/api/documents/pamphlet/pdf",
} as const;

/** Homescool teacher→student registry + folders + tasks (JWT). */
export const HOMESCOOL_ROUTES = {
  students: "/api/homescool/students",
  student: (slug: string) =>
    `/api/homescool/students/${encodeURIComponent(slug)}`,
  teacherFolder: (slug: string, folder: string) =>
    `/api/homescool/students/${encodeURIComponent(slug)}/folders/${encodeURIComponent(folder)}`,
  teacherTasks: (slug: string) =>
    `/api/homescool/students/${encodeURIComponent(slug)}/tasks`,
  teacherTaskGrade: (slug: string, taskId: string) =>
    `/api/homescool/students/${encodeURIComponent(slug)}/tasks/${encodeURIComponent(taskId)}/grade`,
  teacherTaskArchive: (slug: string, taskId: string) =>
    `/api/homescool/students/${encodeURIComponent(slug)}/tasks/${encodeURIComponent(taskId)}/archive`,
  learning: "/api/homescool/learning",
  learningFolder: (teacherSlug: string, folder: string) =>
    `/api/homescool/learning/${encodeURIComponent(teacherSlug)}/folders/${encodeURIComponent(folder)}`,
  learningTasks: (teacherSlug: string) =>
    `/api/homescool/learning/${encodeURIComponent(teacherSlug)}/tasks`,
  learningTask: (teacherSlug: string, taskId: string) =>
    `/api/homescool/learning/${encodeURIComponent(teacherSlug)}/tasks/${encodeURIComponent(taskId)}`,
  learningTaskSubmit: (teacherSlug: string, taskId: string) =>
    `/api/homescool/learning/${encodeURIComponent(teacherSlug)}/tasks/${encodeURIComponent(taskId)}/submit`,
  taskTemplates: "/api/homescool/task-templates",
  taskTemplate: (id: string) =>
    `/api/homescool/task-templates/${encodeURIComponent(id)}`,
  taskTemplateImages: (id: string) =>
    `/api/homescool/task-templates/${encodeURIComponent(id)}/images`,
  catalogs: "/api/homescool/catalogs",
} as const;

/** Church registry under S3 church/ (JWT + membership roles). */
export const CHURCH_ROUTES = {
  list: "/api/church",
  overview: "/api/church/overview",
  activity: "/api/church/activity",
  authorization: "/api/church/authorization",
  requestAuthorization: "/api/church/authorization/request",
  groups: "/api/church/groups",
  group: (id: string) => `/api/church/groups/${encodeURIComponent(id)}`,
  leaders: "/api/church/leaders",
  leader: (id: string) => `/api/church/leaders/${encodeURIComponent(id)}`,
  leaderRoles: "/api/church/leader-roles",
  church: (denomId: string, churchId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}`,
  members: (denomId: string, churchId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/members`,
  activities: (denomId: string, churchId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/activities`,
  report: (denomId: string, churchId: string, activityId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/activities/${encodeURIComponent(activityId)}/report`,
  image: (denomId: string, churchId: string, activityId: string, name: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/activities/${encodeURIComponent(activityId)}/images/${encodeURIComponent(name)}`,
  networkActivities: (groupId: string) =>
    `/api/church/groups/${encodeURIComponent(groupId)}/network-activities`,
  networkActivity: (groupId: string, activityId: string) =>
    `/api/church/groups/${encodeURIComponent(groupId)}/network-activities/${encodeURIComponent(activityId)}`,
  networkActivityRollup: (groupId: string, activityId: string) =>
    `/api/church/groups/${encodeURIComponent(groupId)}/network-activities/${encodeURIComponent(activityId)}/rollup`,
  churchNetworkActivities: (denomId: string, churchId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-activities`,
  networkMemberPool: (denomId: string, churchId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-member-pool`,
  networkOccurrences: (denomId: string, churchId: string, activityId: string) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-activities/${encodeURIComponent(activityId)}/occurrences`,
  networkOccurrence: (
    denomId: string,
    churchId: string,
    activityId: string,
    occurrenceId: string,
  ) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}`,
  networkOccurrenceImages: (
    denomId: string,
    churchId: string,
    activityId: string,
    occurrenceId: string,
  ) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/images`,
  networkOccurrenceImage: (
    denomId: string,
    churchId: string,
    activityId: string,
    occurrenceId: string,
    name: string,
  ) =>
    `/api/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}/network-activities/${encodeURIComponent(activityId)}/occurrences/${encodeURIComponent(occurrenceId)}/images/${encodeURIComponent(name)}`,
} as const;

/** Scrib books + layered US Letter sheets (JWT + scrib entitlement). */
export const SCRIB_ROUTES = {
  library: "/api/scrib/library",
  books: "/api/scrib/books",
  book: (bookId: string) => `/api/scrib/books/${encodeURIComponent(bookId)}`,
  sheets: (bookId: string) =>
    `/api/scrib/books/${encodeURIComponent(bookId)}/sheets`,
  sheet: (bookId: string, sheetId: string) =>
    `/api/scrib/books/${encodeURIComponent(bookId)}/sheets/${encodeURIComponent(sheetId)}`,
} as const;

/** eReport Issue Tracker cloud library (JWT + ereport entitlement for create). */
export const EREPORT_ROUTES = {
  library: "/api/ereport/library",
  reports: "/api/ereport/reports",
  import: "/api/ereport/reports/import",
  report: (ownerSafe: string, reportId: string) =>
    `/api/ereport/reports/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(reportId)}`,
  shares: (ownerSafe: string, reportId: string) =>
    `/api/ereport/reports/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(reportId)}/shares`,
} as const;

/** eVoice text-to-audio (JWT + evoice entitlement / allowlist / admin). */
export const EVOICE_ROUTES = {
  me: "/api/evoice/me",
  users: "/api/evoice/users",
  projects: "/api/evoice/projects",
  projectDocs: (ownerSafe: string, project: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/docs`,
  projectDocsText: (ownerSafe: string, project: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/docs/text`,
  projectDoc: (ownerSafe: string, project: string, name: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/docs?name=${encodeURIComponent(name)}`,
  projectAudios: (ownerSafe: string, project: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/audios`,
  projectAudio: (ownerSafe: string, project: string, name: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/audios?name=${encodeURIComponent(name)}`,
  generate: (ownerSafe: string, project: string) =>
    `/api/evoice/projects/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/generate`,
  job: (jobId: string) => `/api/evoice/jobs/${encodeURIComponent(jobId)}`,
  jobStop: (jobId: string) =>
    `/api/evoice/jobs/${encodeURIComponent(jobId)}/stop`,
  jobResume: (jobId: string) =>
    `/api/evoice/jobs/${encodeURIComponent(jobId)}/resume`,
  file: (ownerSafe: string, project: string, kind: "docs" | "audios", name: string) =>
    `/api/evoice/file/${encodeURIComponent(ownerSafe)}/${encodeURIComponent(project)}/${kind}?name=${encodeURIComponent(name)}`,
} as const;

export const PLAYLIST_ROUTES = {
  list: "/api/playlists",
  save: "/api/playlists",
  item: (playlistId: string) =>
    `/api/playlists/${encodeURIComponent(playlistId)}`,
  tracks: (playlistId: string) =>
    `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
} as const;

/** Media library + admin recording upload (S3 worship_playlists). */
export const MEDIA_ROUTES = {
  audioList: (prefix = "worship_playlists") =>
    `/api/media/audio?prefix=${encodeURIComponent(prefix)}`,
  audioUpload: "/api/media/audio/upload",
  /** Soft-delete library listing reference; keeps S3 audio object. */
  audioLibraryRemove: "/api/media/audio/library",
  file: (relativeKey: string) =>
    `/api/media/file/${relativeKey.split("/").map(encodeURIComponent).join("/")}`,
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
  bulkRegister: "/api/admin/users/bulk-register",
  services: "/api/admin/services",
  churchAuthRequests: "/api/admin/church-authorization-requests",
  approveChurchAuth: (email: string) =>
    `/api/admin/church-authorization-requests/${encodeURIComponent(email)}/approve?email=${encodeURIComponent(email)}`,
  rejectChurchAuth: (email: string) =>
    `/api/admin/church-authorization-requests/${encodeURIComponent(email)}/reject?email=${encodeURIComponent(email)}`,
  userEntitlements: (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}/entitlements?email=${encodeURIComponent(email)}`,
  deleteUser: (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}?email=${encodeURIComponent(email)}`,
  apsWebhookEvents: "/api/admin/aps/webhook-events",
  apsWebhookStream: "/api/admin/aps/webhook-events/stream",
  apsProbes: "/api/admin/aps/probes",
  apsProbe: (id: string) => `/api/admin/aps/probes/${encodeURIComponent(id)}`,
} as const;

/** Admin-only BIM host Python runner + shared IFC library (spec 037). */
export const BIM_ROUTES = {
  pythonRun: "/api/bim/python/run",
  models: "/api/bim/models",
  modelUpload: "/api/bim/models/upload",
  modelFile: (name: string) =>
    `/api/bim/models/file/${name.split("/").map(encodeURIComponent).join("/")}`,
} as const;

/** Public APS webhook ingest (Autodesk → Eduardo OS). */
export const APS_WEBHOOK_ROUTES = {
  ingest: "/api/aps/webhooks",
} as const;

/** Public Calvin’s Institutes (S3 proxy). */
export const LATIN_API_ROUTES = {
  institutesIndex: "/api/latin/calvins-institutes",
  institutesSection: (id: string) =>
    `/api/latin/calvins-institutes/sections/${encodeURIComponent(id)}`,
} as const;
