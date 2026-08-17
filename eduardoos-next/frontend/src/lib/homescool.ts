/**
 * Homescool API client — register students, list folders, templates, tasks, grading.
 * Failures surface via ServerErrorModal (openApiErrorModal).
 */

import { APP_ROUTES, HOMESCOOL_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import { openApiErrorModal } from "../components/ServerErrorModal/ServerErrorModal";

export const HOMESCOOL_FOLDERS = [
  "portfolio",
  "period",
  "skills",
  "study_section",
  "tasks",
  "calendar",
] as const;

export type HomescoolFolder = (typeof HOMESCOOL_FOLDERS)[number];

/** S3-backed folders only (calendar is a virtual UI surface like tasks boards). */
export const HOMESCOOL_S3_FOLDERS = [
  "portfolio",
  "period",
  "skills",
  "study_section",
  "tasks",
] as const;

export function isHomescoolS3Folder(folder: string): boolean {
  return (HOMESCOOL_S3_FOLDERS as readonly string[]).includes(folder);
}

/** localStorage: Folders sidebar open/closed on workspace / learning routes. */
export const HOMESCOOL_FOLDERS_SIDEBAR_KEY = "eduardoos-homescool-folders-open";

/** Default open; persisted as "1" / "0" (same spirit as eduardoos-theme). */
export function readHomescoolFoldersOpen(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = localStorage.getItem(HOMESCOOL_FOLDERS_SIDEBAR_KEY);
    if (stored === null) return true;
    return stored === "1" || stored === "true";
  } catch {
    return true;
  }
}

export function writeHomescoolFoldersOpen(open: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HOMESCOOL_FOLDERS_SIDEBAR_KEY, open ? "1" : "0");
  } catch {
    /* quota / private mode — ignore */
  }
}

export type HomescoolLink = {
  id: string;
  teacherEmail: string;
  studentEmail: string;
  studentSlug: string;
  s3Prefix: string;
  folders: string[];
  createdAt: string;
};

export type HomescoolFolderObject = {
  key: string;
  name: string;
  size: number;
  lastModified?: string;
  url?: string;
};

/** Board columns for teacher Tasks UI. */
export type HomescoolTaskStatus = "pending" | "actioned" | "ready" | "archived";

export type HomescoolTaskFile = {
  key: string;
  name: string;
  size: number;
};

export type HomescoolTaskSubmission = {
  text: string;
  files: HomescoolTaskFile[];
  submittedAt: string;
};

export type HomescoolTaskGrade = {
  decision: "validate" | "reject";
  score: number;
  gradedAt: string;
  note?: string;
};

export type HomescoolTaskFrequencyKind = "once" | "daily" | "daily_except";

/**
 * Recurrence for an assigned task within startDate..endDate.
 * - once: calendar shows StartDate only (one-shot / specific day)
 * - daily: every day in the window
 * - daily_except: daily skipping ExcludeWeekdays (0=Sun … 6=Sat)
 *
 * Boards still show one card per assignment (submit/grade once for the window).
 * Calendar expands occurrence dates for display.
 */
export type HomescoolTaskFrequency = {
  kind: HomescoolTaskFrequencyKind | string;
  excludeWeekdays?: number[];
};

export type HomescoolTask = {
  id: string;
  templateId?: string;
  teacherEmail: string;
  studentEmail: string;
  studentSlug: string;
  name: string;
  description: string;
  period: string;
  /** Canonical multi-label study areas. */
  studyAreas?: string[];
  /** Deprecated single-label alias (legacy records / joined display). */
  studyArea?: string;
  startDate: string;
  endDate: string;
  frequency?: HomescoolTaskFrequency;
  durationMin: number;
  maxScore: number;
  status: HomescoolTaskStatus;
  imageKeys?: string[];
  submission?: HomescoolTaskSubmission;
  grade?: HomescoolTaskGrade;
  createdAt: string;
  updatedAt: string;
};

export type HomescoolTaskTemplate = {
  id: string;
  teacherEmail: string;
  name: string;
  description: string;
  period: string;
  /** Canonical multi-label study areas. */
  studyAreas?: string[];
  /** Deprecated single-label alias (legacy records / joined display). */
  studyArea?: string;
  durationMin: number;
  maxScore: number;
  imageKeys?: string[];
  createdAt: string;
  updatedAt: string;
};

export type HomescoolTaskBoards = Record<HomescoolTaskStatus, HomescoolTask[]>;

/**
 * Score band for the 5-segment bar (documented in CSS):
 * 1 mínimo (red), 2 pobre (yellow), 3 aprobado (pale lime), 4–5 bueno (green).
 */
export type HomescoolScoreBand = "minimo" | "pobre" | "aprobado" | "bueno" | "";

export const HOMESCOOL_MAX_SCORE = 5;

/** Teacher-created catalog kinds (period / study area only). Duration is fixed presets. */
export type HomescoolCatalogKind = "period" | "study_area";

export type HomescoolCatalogEntry = {
  id: string;
  teacherEmail: string;
  kind: HomescoolCatalogKind | string;
  label: string;
  createdAt: string;
};

/**
 * Fixed task-duration presets (not a user catalog).
 * Stored as durationMin (minutes equivalent); codes are for UI/API clarity.
 * Month ≈ 30 days; week = 7 days.
 */
export type HomescoolDurationPreset = {
  code: string;
  label: string;
  minutes: number;
};

const DAY_MIN = 24 * 60;
const WEEK_MIN = 7 * DAY_MIN;
const MONTH_MIN = 30 * DAY_MIN;

export const HOMESCOOL_DURATION_PRESETS: readonly HomescoolDurationPreset[] = [
  { code: "30m", label: "30min", minutes: 30 },
  { code: "1h", label: "1hr", minutes: 60 },
  { code: "2h", label: "2hrs", minutes: 120 },
  { code: "4h", label: "4hrs", minutes: 240 },
  { code: "1d", label: "1 día", minutes: 1 * DAY_MIN },
  { code: "2d", label: "2 días", minutes: 2 * DAY_MIN },
  { code: "3d", label: "3 días", minutes: 3 * DAY_MIN },
  { code: "4d", label: "4 días", minutes: 4 * DAY_MIN },
  { code: "5d", label: "5 días", minutes: 5 * DAY_MIN },
  { code: "6d", label: "6 días", minutes: 6 * DAY_MIN },
  { code: "1w", label: "1 semana", minutes: 1 * WEEK_MIN },
  { code: "2w", label: "2 semanas", minutes: 2 * WEEK_MIN },
  { code: "3w", label: "3 semanas", minutes: 3 * WEEK_MIN },
  { code: "1mo", label: "1 mes", minutes: 1 * MONTH_MIN },
  { code: "2mo", label: "2 meses", minutes: 2 * MONTH_MIN },
  { code: "3mo", label: "3 meses", minutes: 3 * MONTH_MIN },
  { code: "4mo", label: "4 meses", minutes: 4 * MONTH_MIN },
  { code: "5mo", label: "5 meses", minutes: 5 * MONTH_MIN },
  { code: "6mo", label: "6 meses", minutes: 6 * MONTH_MIN },
  { code: "7mo", label: "7 meses", minutes: 7 * MONTH_MIN },
  { code: "8mo", label: "8 meses", minutes: 8 * MONTH_MIN },
  { code: "9mo", label: "9 meses", minutes: 9 * MONTH_MIN },
  { code: "10mo", label: "10 meses", minutes: 10 * MONTH_MIN },
  { code: "11mo", label: "11 meses", minutes: 11 * MONTH_MIN },
  { code: "12mo", label: "12 meses (1 año)", minutes: 12 * MONTH_MIN },
];

const durationByMinutes = new Map(
  HOMESCOOL_DURATION_PRESETS.map((p) => [p.minutes, p] as const),
);
const durationByCode = new Map(
  HOMESCOOL_DURATION_PRESETS.map((p) => [p.code, p] as const),
);

/** Resolve a preset by structured code (`30m`, `1h`, `2d`, `1w`, `3mo`). */
export function durationPresetByCode(code: string): HomescoolDurationPreset | undefined {
  return durationByCode.get(String(code ?? "").trim());
}

/** Spanish human label for a stored durationMin; falls back to "N min" for legacy values. */
export function formatDurationLabel(durationMin: number): string {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return "";
  const preset = durationByMinutes.get(durationMin);
  if (preset) return preset.label;
  return `${durationMin} min`;
}

/** Minutes equivalent for a preset code, or 0 if unknown. */
export function durationMinutesFromCode(code: string): number {
  return durationPresetByCode(code)?.minutes ?? 0;
}

/**
 * Normalize study area labels from API/forms.
 * Legacy single `studyArea` string becomes a one-item array when `studyAreas` is empty.
 */
export function normalizeStudyAreas(
  areas?: string[] | null,
  legacy?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of areas ?? []) {
    const label = String(raw ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  if (out.length === 0) {
    const solo = String(legacy ?? "").trim();
    if (solo) out.push(solo);
  }
  return out;
}

/** Compact display for cards/modals (`dialectic · rhetoric`). */
export function formatStudyAreas(
  areas?: string[] | null,
  legacy?: string | null,
): string {
  return normalizeStudyAreas(areas, legacy).join(" · ");
}

/** True when the template/task includes the given study-area label. */
export function hasStudyArea(
  areas: string[] | undefined | null,
  legacy: string | undefined | null,
  needle: string,
): boolean {
  const want = String(needle ?? "").trim().toLowerCase();
  if (!want) return false;
  return normalizeStudyAreas(areas, legacy).some((a) => a.toLowerCase() === want);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function normalizeFrequency(
  freq?: HomescoolTaskFrequency | null,
): HomescoolTaskFrequency {
  const kind = String(freq?.kind ?? "once").trim().toLowerCase();
  const allowed: HomescoolTaskFrequencyKind[] = ["once", "daily", "daily_except"];
  const safeKind = (allowed as string[]).includes(kind)
    ? (kind as HomescoolTaskFrequencyKind)
    : "once";
  const exclude: number[] = [];
  if (safeKind === "daily_except") {
    const seen = new Set<number>();
    for (const d of freq?.excludeWeekdays ?? []) {
      const n = Number(d);
      if (!Number.isInteger(n) || n < 0 || n > 6 || seen.has(n)) continue;
      seen.add(n);
      exclude.push(n);
    }
  }
  return { kind: safeKind, excludeWeekdays: exclude };
}

export function formatFrequencyLabel(freq?: HomescoolTaskFrequency | null): string {
  const n = normalizeFrequency(freq);
  if (n.kind === "daily") return "Daily";
  if (n.kind === "daily_except") {
    if (!n.excludeWeekdays?.length) return "Daily";
    return `Daily except ${n.excludeWeekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  }
  return "Specific day";
}

/**
 * Expand assignment window into YYYY-MM-DD occurrence dates for the calendar.
 * Caps at 400 days (mirrors Go ExpandOccurrenceDates).
 */
export function expandOccurrenceDates(
  startDate: string,
  endDate: string,
  freq?: HomescoolTaskFrequency | null,
): string[] {
  const n = normalizeFrequency(freq);
  const start = parseDateOnly(startDate);
  if (!start) return [];
  let end = parseDateOnly(endDate) ?? start;
  if (end.getTime() < start.getTime()) return [];

  if (n.kind === "once") {
    return [formatDateOnly(start)];
  }

  const exclude = new Set(n.excludeWeekdays ?? []);
  const out: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && out.length < 400) {
    const dow = cursor.getUTCDay();
    if (!(n.kind === "daily_except" && exclude.has(dow))) {
      out.push(formatDateOnly(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function parseDateOnly(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function scoreBand(score: number): HomescoolScoreBand {
  if (score <= 0) return "";
  if (score === 1) return "minimo";
  if (score === 2) return "pobre";
  if (score === 3) return "aprobado";
  return "bueno";
}

export function scoreBandLabel(band: HomescoolScoreBand): string {
  switch (band) {
    case "minimo":
      return "Mínimo";
    case "pobre":
      return "Pobre";
    case "aprobado":
      return "Aprobado";
    case "bueno":
      return "Bueno";
    default:
      return "";
  }
}

export function taskStatusLabel(status: HomescoolTaskStatus): string {
  switch (status) {
    case "pending":
      return "Pendientes";
    case "actioned":
      return "Accionadas";
    case "ready":
      return "Listas";
    case "archived":
      return "Archivadas";
    default:
      return status;
  }
}

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to use Homescool.");
  return token;
}

function reportApiError(err: unknown, summary: string): never {
  const text = err instanceof Error ? err.message : String(err);
  openApiErrorModal(text, { summary });
  throw err instanceof Error ? err : new Error(text);
}

async function homescoolRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = requireToken();
  const result = await apiRequest<T>(path, {
    method: options.method ?? "GET",
    body: options.body,
    correlationId: createCorrelationId(),
    authToken: token,
  });
  if (result.error) {
    reportApiError(new Error(formatApiError(result.error)), "Homescool request failed");
  }
  if (result.data === undefined) {
    reportApiError(new Error("Empty Homescool response"), "Homescool request failed");
  }
  return result.data;
}

export function folderLabel(folder: string): string {
  switch (folder) {
    case "portfolio":
      return "Portfolio";
    case "period":
      return "Period";
    case "skills":
      return "Skills";
    case "study_section":
      return "Study section";
    case "tasks":
      return "Tasks";
    case "calendar":
      return "Calendar";
    default:
      return folder;
  }
}

/** Sanitize email the same way the Go backend does for URL/S3 segments. */
export function safeEmailKey(email: string): string {
  return email.trim().toLowerCase().replaceAll("@", "_at_").replaceAll("/", "_");
}

/**
 * Resolve student slug for the workspace page.
 * Supports pretty /homescool/students/{slug} (nginx rewrite) and ?student=.
 */
export function resolveStudentSlugFromLocation(
  pathname = typeof window !== "undefined" ? window.location.pathname : "",
  search = typeof window !== "undefined" ? window.location.search : "",
): string {
  const q = new URLSearchParams(search).get("student");
  if (q) return decodeURIComponent(q.trim());
  const base = APP_ROUTES.homescoolStudents.replace(/\/$/, "");
  const prefix = `${base}/`;
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length).replace(/\/$/, "");
  if (!rest || rest === "workspace") return "";
  return decodeURIComponent(rest);
}

export function studentWorkspaceHref(slug: string): string {
  // Query targets the built workspace shell (works in Astro static/dev).
  // Pretty /homescool/students/{slug} is also supported via nginx rewrite.
  return `${APP_ROUTES.homescoolStudentWorkspace}?student=${encodeURIComponent(slug)}`;
}

export async function registerHomescoolStudent(
  studentEmail: string,
): Promise<{ link: HomescoolLink; folders: string[] }> {
  return homescoolRequest(HOMESCOOL_ROUTES.students, {
    method: "POST",
    body: { studentEmail },
  });
}

export async function listHomescoolStudents(): Promise<{
  students: HomescoolLink[];
  count: number;
}> {
  return homescoolRequest(HOMESCOOL_ROUTES.students);
}

export async function getHomescoolStudent(
  slug: string,
): Promise<{ link: HomescoolLink; folders: string[] }> {
  return homescoolRequest(HOMESCOOL_ROUTES.student(slug));
}

export async function listTeacherStudentFolder(
  slug: string,
  folder: string,
): Promise<{
  folder: string;
  prefix: string;
  objects: HomescoolFolderObject[];
  count: number;
  link: HomescoolLink;
}> {
  return homescoolRequest(HOMESCOOL_ROUTES.teacherFolder(slug, folder));
}

export async function listHomescoolLearning(): Promise<{
  links: HomescoolLink[];
  count: number;
  folders: string[];
}> {
  return homescoolRequest(HOMESCOOL_ROUTES.learning);
}

export async function listLearningFolder(
  teacherSlug: string,
  folder: string,
): Promise<{
  folder: string;
  prefix: string;
  objects: HomescoolFolderObject[];
  count: number;
  link: HomescoolLink;
}> {
  return homescoolRequest(HOMESCOOL_ROUTES.learningFolder(teacherSlug, folder));
}

export async function createTaskTemplate(input: {
  name: string;
  description?: string;
  period?: string;
  studyAreas?: string[];
  /** @deprecated Prefer studyAreas. */
  studyArea?: string;
  durationMin?: number;
  maxScore?: number;
}): Promise<{ template: HomescoolTaskTemplate }> {
  return homescoolRequest(HOMESCOOL_ROUTES.taskTemplates, {
    method: "POST",
    body: input,
  });
}

export async function updateTaskTemplate(
  templateId: string,
  input: {
    name: string;
    description?: string;
    period?: string;
    studyAreas?: string[];
    /** @deprecated Prefer studyAreas. */
    studyArea?: string;
    durationMin?: number;
    maxScore?: number;
  },
): Promise<{ template: HomescoolTaskTemplate }> {
  return homescoolRequest(HOMESCOOL_ROUTES.taskTemplate(templateId), {
    method: "PUT",
    body: input,
  });
}

export async function listCatalogEntries(kind?: HomescoolCatalogKind): Promise<{
  entries: HomescoolCatalogEntry[];
  count: number;
}> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return homescoolRequest(`${HOMESCOOL_ROUTES.catalogs}${qs}`);
}

export async function createCatalogEntry(input: {
  kind: HomescoolCatalogKind;
  label: string;
}): Promise<{ entry: HomescoolCatalogEntry }> {
  return homescoolRequest(HOMESCOOL_ROUTES.catalogs, {
    method: "POST",
    body: input,
  });
}

export async function listTaskTemplates(filters?: {
  period?: string;
  studyArea?: string;
}): Promise<{ templates: HomescoolTaskTemplate[]; count: number }> {
  const q = new URLSearchParams();
  if (filters?.period) q.set("period", filters.period);
  if (filters?.studyArea) q.set("studyArea", filters.studyArea);
  const qs = q.toString();
  return homescoolRequest(
    qs ? `${HOMESCOOL_ROUTES.taskTemplates}?${qs}` : HOMESCOOL_ROUTES.taskTemplates,
  );
}

export async function uploadTemplateImage(
  templateId: string,
  file: File,
): Promise<{ template: HomescoolTaskTemplate; key: string }> {
  const token = requireToken();
  const correlationId = createCorrelationId();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(HOMESCOOL_ROUTES.taskTemplateImages(templateId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  const text = await response.text();
  let data:
    | { template?: HomescoolTaskTemplate; key?: string; message?: string; error?: string }
    | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    reportApiError(
      new Error(data?.message ?? data?.error ?? response.statusText ?? "Upload failed"),
      "Template image upload failed",
    );
  }
  if (!data?.template) {
    reportApiError(new Error("Empty template image response"), "Template image upload failed");
  }
  return { template: data.template, key: data.key ?? "" };
}

export async function assignStudentTasks(
  studentSlug: string,
  input: {
    templateIds?: string[];
    startDate?: string;
    endDate?: string;
    frequency?: HomescoolTaskFrequency;
    name?: string;
    description?: string;
    period?: string;
    studyAreas?: string[];
    /** @deprecated Prefer studyAreas. */
    studyArea?: string;
    durationMin?: number;
    maxScore?: number;
  },
): Promise<{ tasks: HomescoolTask[]; count: number }> {
  return homescoolRequest(HOMESCOOL_ROUTES.teacherTasks(studentSlug), {
    method: "POST",
    body: input,
  });
}

export async function listTeacherStudentTasks(studentSlug: string): Promise<{
  tasks: HomescoolTask[];
  count: number;
  boards: HomescoolTaskBoards;
  link: HomescoolLink;
}> {
  return homescoolRequest(HOMESCOOL_ROUTES.teacherTasks(studentSlug));
}

export async function gradeStudentTask(
  studentSlug: string,
  taskId: string,
  input: { decision: "validate" | "reject"; score: number; note?: string },
): Promise<{ task: HomescoolTask; scoreBand: HomescoolScoreBand }> {
  return homescoolRequest(HOMESCOOL_ROUTES.teacherTaskGrade(studentSlug, taskId), {
    method: "POST",
    body: input,
  });
}

export async function archiveStudentTask(
  studentSlug: string,
  taskId: string,
): Promise<{ task: HomescoolTask }> {
  return homescoolRequest(HOMESCOOL_ROUTES.teacherTaskArchive(studentSlug, taskId), {
    method: "POST",
  });
}

export async function listLearningTasks(
  teacherSlug: string,
  status?: HomescoolTaskStatus,
): Promise<{ tasks: HomescoolTask[]; count: number; link: HomescoolLink }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return homescoolRequest(`${HOMESCOOL_ROUTES.learningTasks(teacherSlug)}${qs}`);
}

export async function getLearningTask(
  teacherSlug: string,
  taskId: string,
): Promise<{ task: HomescoolTask; link: HomescoolLink }> {
  return homescoolRequest(HOMESCOOL_ROUTES.learningTask(teacherSlug, taskId));
}

export async function submitLearningTask(
  teacherSlug: string,
  taskId: string,
  input: { text: string; files: File[] },
): Promise<{ task: HomescoolTask }> {
  const token = requireToken();
  const correlationId = createCorrelationId();
  const body = new FormData();
  body.append("text", input.text);
  for (const file of input.files) {
    body.append("files", file);
  }
  const response = await fetch(HOMESCOOL_ROUTES.learningTaskSubmit(teacherSlug, taskId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  const text = await response.text();
  let data: { task?: HomescoolTask; message?: string; error?: string } | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    reportApiError(
      new Error(data?.message ?? data?.error ?? response.statusText ?? "Submit failed"),
      "Task response failed",
    );
  }
  if (!data?.task) {
    reportApiError(new Error("Empty submit response"), "Task response failed");
  }
  return { task: data.task };
}
