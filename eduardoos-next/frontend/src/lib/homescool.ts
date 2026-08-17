/**
 * Homescool API client — register students, list teacher roster, list folder objects.
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
