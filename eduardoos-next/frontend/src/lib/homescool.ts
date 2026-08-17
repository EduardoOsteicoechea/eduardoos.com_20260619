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
] as const;

export type HomescoolFolder = (typeof HOMESCOOL_FOLDERS)[number];

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

export type HomescoolTask = {
  id: string;
  templateId?: string;
  teacherEmail: string;
  studentEmail: string;
  studentSlug: string;
  name: string;
  description: string;
  period: string;
  studyArea: string;
  startDate: string;
  endDate: string;
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
  studyArea: string;
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

export type HomescoolCatalogKind = "period" | "study_area" | "time";

export type HomescoolCatalogEntry = {
  id: string;
  teacherEmail: string;
  kind: HomescoolCatalogKind | string;
  label: string;
  durationMin?: number;
  createdAt: string;
};

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
  studyArea?: string;
  durationMin?: number;
  maxScore?: number;
}): Promise<{ template: HomescoolTaskTemplate }> {
  return homescoolRequest(HOMESCOOL_ROUTES.taskTemplates, {
    method: "POST",
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
  durationMin?: number;
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
    name?: string;
    description?: string;
    period?: string;
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
