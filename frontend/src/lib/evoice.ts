/**
 * eVoice client — projects / docs / audios / generate jobs under S3 evoice/.
 */

import { EVOICE_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type EvoiceObjectMeta = {
  name: string;
  key: string;
  size: number;
  lastModified?: string;
  url?: string;
};

export type EvoiceJobStep = {
  id: string;
  label: string;
  state: "pending" | "active" | "done" | "failed" | "skipped" | string;
};

export type EvoiceJobFile = {
  name: string;
  state: "pending" | "active" | "done" | "skipped" | "failed" | string;
  progress: number;
  detail?: string;
};

export type EvoiceJob = {
  id: string;
  state: "queued" | "running" | "done" | "failed" | "stopped" | string;
  ownerSafe: string;
  project: string;
  onlyFiles?: string[];
  premium?: boolean;
  logs: string[];
  steps?: EvoiceJobStep[];
  files?: EvoiceJobFile[];
  progress?: number;
  currentStep?: string;
  error?: string;
  stats?: {
    docs: number;
    generated: number;
    skipped: number;
    failed: number;
  };
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in required for eVoice.");
  return token;
}

export async function fetchEvoiceMe(): Promise<{
  userSafe: string;
  isAdmin: boolean;
  error?: string;
}> {
  const result = await apiRequest<{ userSafe: string; isAdmin: boolean }>(
    EVOICE_ROUTES.me,
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    return { userSafe: "", isAdmin: false, error: formatApiError(result.error) };
  }
  return {
    userSafe: result.data?.userSafe ?? "",
    isAdmin: Boolean(result.data?.isAdmin),
  };
}

export async function fetchEvoiceUsers(): Promise<{
  users: string[];
  error?: string;
}> {
  const result = await apiRequest<{ users: string[] }>(EVOICE_ROUTES.users, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { users: [], error: formatApiError(result.error) };
  }
  return { users: result.data?.users ?? [] };
}

export async function fetchEvoiceProjects(ownerSafe?: string): Promise<{
  ownerSafe: string;
  projects: string[];
  error?: string;
}> {
  const q = ownerSafe
    ? `?owner=${encodeURIComponent(ownerSafe)}`
    : "";
  const result = await apiRequest<{ ownerSafe: string; projects: string[] }>(
    `${EVOICE_ROUTES.projects}${q}`,
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    return { ownerSafe: "", projects: [], error: formatApiError(result.error) };
  }
  return {
    ownerSafe: result.data?.ownerSafe ?? "",
    projects: result.data?.projects ?? [],
  };
}

export async function createEvoiceProject(
  name: string,
  ownerSafe?: string,
): Promise<{ ownerSafe: string; project: string; error?: string }> {
  const result = await apiRequest<{ ownerSafe: string; project: string }>(
    EVOICE_ROUTES.projects,
    {
      method: "POST",
      body: { name, owner: ownerSafe || undefined },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { ownerSafe: "", project: "", error: formatApiError(result.error) };
  }
  return {
    ownerSafe: result.data?.ownerSafe ?? "",
    project: result.data?.project ?? "",
  };
}

export async function fetchEvoiceDocs(
  ownerSafe: string,
  project: string,
): Promise<{ docs: EvoiceObjectMeta[]; error?: string }> {
  const result = await apiRequest<{ docs: EvoiceObjectMeta[] }>(
    EVOICE_ROUTES.projectDocs(ownerSafe, project),
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    return { docs: [], error: formatApiError(result.error) };
  }
  return { docs: result.data?.docs ?? [] };
}

export async function uploadEvoiceDoc(
  ownerSafe: string,
  project: string,
  file: File,
): Promise<{ name: string; error?: string }> {
  const token = requireToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(EVOICE_ROUTES.projectDocs(ownerSafe, project), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": createCorrelationId(),
    },
    body: form,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as {
    name?: string;
    error?: string;
  };
  if (!res.ok) {
    return { name: "", error: data.error || `Upload failed (${res.status})` };
  }
  return { name: data.name ?? file.name };
}

export async function pasteEvoiceDocText(
  ownerSafe: string,
  project: string,
  text: string,
): Promise<{ name: string; error?: string }> {
  const result = await apiRequest<{ name: string }>(
    EVOICE_ROUTES.projectDocsText(ownerSafe, project),
    {
      method: "POST",
      body: { text },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { name: "", error: formatApiError(result.error) };
  }
  return { name: result.data?.name ?? "" };
}

export async function deleteEvoiceDoc(
  ownerSafe: string,
  project: string,
  name: string,
): Promise<{ error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    EVOICE_ROUTES.projectDoc(ownerSafe, project, name),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { error: formatApiError(result.error) };
  }
  return {};
}

export async function deleteEvoiceAudio(
  ownerSafe: string,
  project: string,
  name: string,
): Promise<{ error?: string }> {
  const result = await apiRequest<{ deleted: boolean }>(
    EVOICE_ROUTES.projectAudio(ownerSafe, project, name),
    {
      method: "DELETE",
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { error: formatApiError(result.error) };
  }
  return {};
}

export async function fetchEvoiceAudios(
  ownerSafe: string,
  project: string,
): Promise<{ audios: EvoiceObjectMeta[]; error?: string }> {
  const result = await apiRequest<{ audios: EvoiceObjectMeta[] }>(
    EVOICE_ROUTES.projectAudios(ownerSafe, project),
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    return { audios: [], error: formatApiError(result.error) };
  }
  return { audios: result.data?.audios ?? [] };
}

export async function startEvoiceGenerate(
  ownerSafe: string,
  project: string,
  files?: string[],
  premium = false,
): Promise<{ jobId: string; error?: string }> {
  const body: { files?: string[]; premium?: boolean } = {};
  if (files && files.length > 0) body.files = files;
  if (premium) body.premium = true;
  const result = await apiRequest<{ jobId: string }>(
    EVOICE_ROUTES.generate(ownerSafe, project),
    {
      method: "POST",
      body: Object.keys(body).length ? body : premium ? { premium: true } : undefined,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    return { jobId: "", error: formatApiError(result.error) };
  }
  return { jobId: result.data?.jobId ?? "" };
}

export async function fetchEvoiceJob(
  jobId: string,
): Promise<{ job: EvoiceJob | null; error?: string; status?: number }> {
  const result = await apiRequest<EvoiceJob>(EVOICE_ROUTES.job(jobId), {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return {
      job: null,
      error: formatApiError(result.error),
      status: result.error.status,
    };
  }
  return { job: result.data ?? null, status: 200 };
}

export async function stopEvoiceJob(
  jobId: string,
): Promise<{ job: EvoiceJob | null; error?: string }> {
  const result = await apiRequest<EvoiceJob>(EVOICE_ROUTES.jobStop(jobId), {
    method: "POST",
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { job: null, error: formatApiError(result.error) };
  }
  return { job: result.data ?? null };
}

export async function resumeEvoiceJob(
  jobId: string,
): Promise<{ jobId: string; files?: string[]; premium?: boolean; error?: string }> {
  const result = await apiRequest<{
    jobId: string;
    files?: string[];
    premium?: boolean;
  }>(EVOICE_ROUTES.jobResume(jobId), {
    method: "POST",
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) {
    return { jobId: "", error: formatApiError(result.error) };
  }
  return {
    jobId: result.data?.jobId ?? "",
    files: result.data?.files,
    premium: result.data?.premium,
  };
}

/** Lightweight backend liveness check used before auto-resume. */
export async function fetchBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch("/health", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Authenticated audio URL (browser <audio> needs Authorization — use blob fetch). */
export function evoiceAudioPath(
  ownerSafe: string,
  project: string,
  name: string,
): string {
  return EVOICE_ROUTES.file(ownerSafe, project, "audios", name);
}

export async function fetchEvoiceAudioBlobUrl(
  ownerSafe: string,
  project: string,
  name: string,
): Promise<string> {
  const token = requireToken();
  const path = evoiceAudioPath(ownerSafe, project, name);
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new Error(
      `Audio fetch failed (${res.status}) GET ${path}${body ? ` — ${body}` : ""}`,
    );
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Fetch MP3 with JWT and trigger a browser download as `name`. */
export async function downloadEvoiceAudio(
  ownerSafe: string,
  project: string,
  name: string,
): Promise<void> {
  const url = await fetchEvoiceAudioBlobUrl(ownerSafe, project, name);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
