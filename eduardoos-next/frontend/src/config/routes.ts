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
  homescoolRegisterStudent: "/homescool/register-student",
  homescoolStudents: "/homescool/students",
  homescoolStudent: (slug: string) =>
    `/homescool/students/${encodeURIComponent(slug)}`,
  homescoolStudentWorkspace: "/homescool/students/workspace",
  homescoolLearning: "/homescool/learning",
  /** Greek letter-by-letter book builder (admin only). */
  greek: "/greek",
  greekBuild: "/greek/build",
  greekGroup: (grupo: string) => `/greek/build/${encodeURIComponent(grupo)}`,
  greekGroupWorkspace: "/greek/build/workspace",
  /** Church registry, overview, activities (JWT + church-* membership). */
  church: "/church",
  churchRegister: "/church/register",
  churchOverview: "/church/overview",
  churchActivity: "/church/activity",
  churchGroups: "/church/groups",
  churchDetail: (denomId: string, churchId: string) =>
    `/church/${encodeURIComponent(denomId)}/${encodeURIComponent(churchId)}`,
  churchWorkspace: "/church/workspace",
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
} as const;

/** Greek builder — admin-only letter hierarchy under S3 greek/. */
export const GREEK_ROUTES = {
  groups: "/api/greek/groups",
  group: (slug: string) => `/api/greek/groups/${encodeURIComponent(slug)}`,
  chapters: (groupSlug: string) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters`,
  verses: (groupSlug: string, chapterSlug: string) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters/${encodeURIComponent(chapterSlug)}/verses`,
  words: (groupSlug: string, chapterSlug: string, verseSlug: string) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters/${encodeURIComponent(chapterSlug)}/verses/${encodeURIComponent(verseSlug)}/words`,
  word: (
    groupSlug: string,
    chapterSlug: string,
    verseSlug: string,
    wordSlug: string,
  ) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters/${encodeURIComponent(chapterSlug)}/verses/${encodeURIComponent(verseSlug)}/words/${encodeURIComponent(wordSlug)}`,
  letters: (
    groupSlug: string,
    chapterSlug: string,
    verseSlug: string,
    wordSlug: string,
  ) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters/${encodeURIComponent(chapterSlug)}/verses/${encodeURIComponent(verseSlug)}/words/${encodeURIComponent(wordSlug)}/letters`,
  letter: (
    groupSlug: string,
    chapterSlug: string,
    verseSlug: string,
    wordSlug: string,
    index: number,
  ) =>
    `/api/greek/groups/${encodeURIComponent(groupSlug)}/chapters/${encodeURIComponent(chapterSlug)}/verses/${encodeURIComponent(verseSlug)}/words/${encodeURIComponent(wordSlug)}/letters/${index}`,
  gallery: "/api/greek/gallery",
  galleryGlyph: (slug: string) =>
    `/api/greek/gallery/${encodeURIComponent(slug)}`,
  catalog: "/api/greek/catalog",
  catalogSeed: "/api/greek/catalog/seed",
  catalogGlyph: (slug: string) =>
    `/api/greek/catalog/${encodeURIComponent(slug)}`,
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
  // Prefer ?email= so dotted / encoded local-parts are not lost if the path
  // param stays percent-encoded (%40) after chi routing.
  deleteUser: (email: string) =>
    `/api/admin/users/${encodeURIComponent(email)}?email=${encodeURIComponent(email)}`,
} as const;
