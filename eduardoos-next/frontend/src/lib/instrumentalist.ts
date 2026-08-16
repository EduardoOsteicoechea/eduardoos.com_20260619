/**
 * Instrumentalist API client — JWT CRUD + analyze/chat for .instru sessions.
 */

import { INSTRUMENTALIST_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import { openApiErrorModal } from "../components/ServerErrorModal/ServerErrorModal";

export type BeliefPosition = { x: number; y: number };

export type BeliefNode = {
  id: string;
  kind: "idea" | "group";
  text: string;
  weight: number;
  groupId?: string;
  position: BeliefPosition;
};

export type BeliefEdge = {
  id: string;
  source: string;
  target: string;
  kind: "hierarchy" | "group";
};

export type BeliefTree = {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
};

export type InstruMessage = {
  role: "user" | "assistant" | "system";
  text: string;
  at: string;
};

export type InstruAnalysis = {
  id: string;
  summary: string;
  detail: string;
  at: string;
};

export type InstruDocument = {
  type?: string;
  version?: number;
  id: string;
  userId?: string;
  title: string;
  topic: string;
  beliefTree: BeliefTree;
  messages: InstruMessage[];
  analyses: InstruAnalysis[];
  createdAt?: string;
  updatedAt?: string;
  s3Key?: string;
};

export type InstruListItem = {
  id: string;
  title: string;
  topic: string;
  updatedAt: string;
  s3Key?: string;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to use The Instrumentalist.");
  return token;
}

function reportApiError(err: unknown, summary: string): never {
  const text = err instanceof Error ? err.message : String(err);
  openApiErrorModal(text, { summary });
  throw err instanceof Error ? err : new Error(text);
}

export async function listInstrumentalistDocs(): Promise<InstruListItem[]> {
  const result = await apiRequest<{ documents?: InstruListItem[] }>(
    INSTRUMENTALIST_ROUTES.list,
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    reportApiError(new Error(formatApiError(result.error)), "Could not list Instrumentalist sessions");
  }
  return result.data?.documents ?? [];
}

export async function createInstrumentalistDoc(input: {
  title?: string;
  topic?: string;
  beliefTree?: BeliefTree;
}): Promise<InstruDocument> {
  const result = await apiRequest<{ document?: InstruDocument }>(
    INSTRUMENTALIST_ROUTES.create,
    {
      method: "POST",
      body: {
        title: input.title?.trim() || "Untitled session",
        topic: input.topic?.trim() || "",
        beliefTree: input.beliefTree,
      },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    reportApiError(new Error(formatApiError(result.error)), "Could not create session");
  }
  if (!result.data?.document?.id) throw new Error("Empty create response");
  return result.data.document;
}

export async function getInstrumentalistDoc(id: string): Promise<InstruDocument> {
  const result = await apiRequest<{ document?: InstruDocument }>(
    INSTRUMENTALIST_ROUTES.item(id),
    { correlationId: createCorrelationId(), authToken: requireToken() },
  );
  if (result.error) {
    reportApiError(new Error(formatApiError(result.error)), "Could not load session");
  }
  if (!result.data?.document?.id) throw new Error("Empty get response");
  return result.data.document;
}

export async function updateInstrumentalistDoc(
  id: string,
  patch: {
    title?: string;
    topic?: string;
    beliefTree?: BeliefTree;
    messages?: InstruMessage[];
    analyses?: InstruAnalysis[];
  },
): Promise<InstruDocument> {
  const result = await apiRequest<{ document?: InstruDocument }>(
    INSTRUMENTALIST_ROUTES.item(id),
    {
      method: "PUT",
      body: patch,
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    reportApiError(new Error(formatApiError(result.error)), "Could not save session");
  }
  if (!result.data?.document?.id) throw new Error("Empty update response");
  return result.data.document;
}

export async function analyzeInstrumentalistDoc(
  id: string,
  beliefTree: BeliefTree,
  topic?: string,
): Promise<{ document: InstruDocument; analysis: InstruAnalysis }> {
  const result = await apiRequest<{ document?: InstruDocument; analysis?: InstruAnalysis }>(
    INSTRUMENTALIST_ROUTES.analyze(id),
    {
      method: "POST",
      body: { beliefTree, topic },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    reportApiError(
      new Error(formatApiError(result.error)),
      "Analysis unavailable (check DEEPSEEK_API_KEY or try again)",
    );
  }
  if (!result.data?.document?.id || !result.data.analysis) {
    throw new Error("Empty analyze response");
  }
  return { document: result.data.document, analysis: result.data.analysis };
}

export async function chatInstrumentalistDoc(
  id: string,
  message: string,
  beliefTree: BeliefTree,
  topic?: string,
): Promise<{ document: InstruDocument; reply: string }> {
  const result = await apiRequest<{ document?: InstruDocument; reply?: string }>(
    INSTRUMENTALIST_ROUTES.chat(id),
    {
      method: "POST",
      body: { message, beliefTree, topic },
      correlationId: createCorrelationId(),
      authToken: requireToken(),
    },
  );
  if (result.error) {
    reportApiError(
      new Error(formatApiError(result.error)),
      "Chat unavailable (check DEEPSEEK_API_KEY or try again)",
    );
  }
  if (!result.data?.document?.id) throw new Error("Empty chat response");
  return { document: result.data.document, reply: result.data.reply ?? "" };
}

/** Download the current document as a `.instru` file. */
export function downloadInstruFile(doc: InstruDocument): void {
  const payload = {
    type: "instru",
    version: doc.version ?? 1,
    id: doc.id,
    title: doc.title,
    topic: doc.topic,
    beliefTree: doc.beliefTree,
    messages: doc.messages,
    analyses: doc.analyses,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (doc.title || "session").replace(/[^\w\-]+/g, "_").slice(0, 48);
  a.href = url;
  a.download = `${safe || "session"}.instru`;
  a.click();
  URL.revokeObjectURL(url);
}

export function emptyBeliefTree(): BeliefTree {
  return { nodes: [], edges: [] };
}

export function newIdeaNode(partial?: Partial<BeliefNode>): BeliefNode {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `n-${Date.now()}`;
  return {
    id,
    kind: "idea",
    text: partial?.text ?? "New idea",
    weight: partial?.weight ?? 1,
    groupId: partial?.groupId ?? "",
    position: partial?.position ?? { x: 120, y: 80 },
  };
}

export function newGroupNode(partial?: Partial<BeliefNode>): BeliefNode {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `g-${Date.now()}`;
  return {
    id,
    kind: "group",
    text: partial?.text ?? "Belief group",
    weight: 0,
    groupId: "",
    position: partial?.position ?? { x: 40, y: 40 },
  };
}
