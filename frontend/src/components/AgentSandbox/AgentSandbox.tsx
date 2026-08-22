/**
 * Agent Sandbox — sites own website files; chats are per-site conversations.
 * Header: sidebar, sites, history, file editor, console.
 */

import { useEffect, useRef, useState } from "react";
import { isPlatformAdmin } from "../../lib/auth";
import ChatMarkdown from "../Chat/ChatMarkdown";
import AgentSandboxHeaderMenu from "./AgentSandboxHeaderMenu";
import "./AgentSandbox.css";

type ChatMessage = { role: string; text: string; at?: string };
type SiteFile = { name: string; type: string; text: string; encoding?: string };
type Tab = { id: string; label: string; file: string };
type Chat = {
  id: string;
  siteId?: string;
  title: string;
  messages: ChatMessage[];
  updated: string;
};
type Site = {
  id: string;
  name: string;
  spec: string;
  files: SiteFile[];
  tabs: Tab[];
  chatIds?: string[];
  updated: string;
};
type SiteSummary = { id: string; name: string; updated: string };
type ChatSummary = { id: string; title: string; updated: string; siteId?: string };
type EditorFile = {
  name: string;
  type: string;
  bytes: number;
  text?: string;
  encoding?: string;
};
type AgentPrefs = {
  model: "deepseek-v4-flash" | "deepseek-v4-pro";
  thinking: "enabled" | "disabled";
  reasoningEffort: "low" | "high" | "max";
};
type ConsoleEntry = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
};
type DeepSeekBalance = {
  currency: string;
  total_balance: string;
  is_available?: boolean;
};

const API = "/api/admin/agent-sandbox";
const SIDEBAR_KEY = "eduardoos-agent-sandbox-sidebar";
const SITE_KEY = "eduardoos-agent-sandbox-site";
const PREFS_KEY = "eduardoos-agent-sandbox-prefs";

const BINARY_EXT = /\.(pdf|docx|xlsx)$/i;

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem("eduardoos-next-auth-token") ?? ""}`,
  };
}

const fetchOpts: RequestInit = { cache: "no-store" };

function loadPrefs(): AgentPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as AgentPrefs;
      if (p.model && p.thinking && p.reasoningEffort) return p;
    }
  } catch {
    /* ignore */
  }
  return {
    model: "deepseek-v4-pro",
    thinking: "enabled",
    reasoningEffort: "high",
  };
}

/** Show real newlines; keep content when stored with JSON-style escapes. */
function decodeFileText(raw: string): string {
  if (!raw) return "";
  if (raw.includes("\n") || raw.includes("\r")) return raw;
  if (!raw.includes("\\n") && !raw.includes("\\r") && !raw.includes("\\t")) return raw;
  return raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t");
}

/** Legacy assistant bubbles sometimes stored JSON or escaped newlines. */
function displayAssistantText(text: string): string {
  const t = text.trim();
  if (!t) return text;
  if (t.startsWith("{")) {
    try {
      const obj = JSON.parse(t) as { reply?: string };
      if (typeof obj.reply === "string" && obj.reply.trim()) {
        return decodeFileText(obj.reply);
      }
    } catch {
      /* fall through */
    }
  }
  return decodeFileText(text);
}

function emptyChat(): Chat {
  return { id: "", siteId: "", title: "", messages: [], updated: "" };
}

function emptySite(): Site {
  return { id: "", name: "", spec: "", files: [], tabs: [], updated: "" };
}

function formatMsgTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function networkErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network error/i.test(raw)) {
    return "Error de red / stream cortado. Revisá la consola del agente.";
  }
  return raw || "Error de red";
}

export default function AgentSandbox() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [site, setSite] = useState<Site>(emptySite());
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteNameDraft, setSiteNameDraft] = useState("");
  const [chat, setChat] = useState<Chat>(emptyChat());
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentPrefs, setAgentPrefs] = useState<AgentPrefs>(() => loadPrefs());
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [balance, setBalance] = useState<DeepSeekBalance | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [askProgress, setAskProgress] = useState<{ percent: number; phase: string } | null>(null);
  const [editorFiles, setEditorFiles] = useState<EditorFile[]>([]);
  const [editorName, setEditorName] = useState("");
  const [editorText, setEditorText] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const streamTextRef = useRef("");
  const logSeq = useRef(0);
  const chatIdRef = useRef("");
  const siteIdRef = useRef("");

  useEffect(() => {
    chatIdRef.current = chat.id;
  }, [chat.id]);
  useEffect(() => {
    siteIdRef.current = site.id;
  }, [site.id]);

  function pushLog(
    level: ConsoleEntry["level"],
    message: string,
    detail?: string,
    at?: string,
  ) {
    logSeq.current += 1;
    setConsoleLogs((prev) => [
      ...prev.slice(-400),
      {
        id: `${Date.now()}-${logSeq.current}`,
        at: at ?? new Date().toISOString(),
        level,
        message,
        detail,
      },
    ]);
    if (level === "error") setConsoleOpen(true);
  }

  async function refreshBalance() {
    try {
      const res = await fetch(`${API}/deepseek/balance`, {
        ...fetchOpts,
        headers: authHeaders(),
      });
      if (!res.ok) {
        setBalanceError(`Balance HTTP ${res.status}`);
        return;
      }
      setBalance((await res.json()) as DeepSeekBalance);
      setBalanceError("");
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : "Balance unavailable");
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === "0") setSidebarOpen(false);
    void boot();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    if (site.id) localStorage.setItem(SITE_KEY, site.id);
  }, [site.id]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(agentPrefs));
  }, [agentPrefs]);

  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  useEffect(() => {
    const el = consoleRef.current;
    if (!el || !consoleOpen) return;
    el.scrollTop = el.scrollHeight;
  }, [consoleLogs, consoleOpen]);

  useEffect(() => {
    if (!consoleOpen) return;
    void refreshBalance();
  }, [consoleOpen]);

  function applySite(next: Site) {
    setSite(next);
    setSiteNameDraft(next.name);
    const html =
      next.tabs?.[0]?.file ??
      next.files?.find((f) => f.name.endsWith(".html"))?.name ??
      "";
    setSelected(html);
  }

  async function refreshSites(): Promise<SiteSummary[]> {
    const res = await fetch(`${API}/sites`, { ...fetchOpts, headers: authHeaders() });
    if (!res.ok) return [];
    const body = (await res.json()) as { sites?: SiteSummary[] };
    const list = body.sites ?? [];
    setSites(list);
    return list;
  }

  async function refreshSummaries(siteId = siteIdRef.current) {
    if (!siteId) return;
    const res = await fetch(`${API}/chats?siteId=${encodeURIComponent(siteId)}`, {
      ...fetchOpts,
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { chats?: ChatSummary[] };
    setSummaries(body.chats ?? []);
  }

  async function loadSite(id: string): Promise<Site | null> {
    const res = await fetch(`${API}/sites/${encodeURIComponent(id)}`, {
      ...fetchOpts,
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as Site;
  }

  async function openSite(id: string) {
    setBusy(true);
    setError("");
    pushLog("info", "Abriendo site…", `id=${id}`);
    const next = await loadSite(id);
    setBusy(false);
    if (!next) {
      setError("No se pudo abrir el site.");
      return;
    }
    applySite(next);
    await refreshSummaries(next.id);
    const listRes = await fetch(`${API}/chats?siteId=${encodeURIComponent(next.id)}`, {
      ...fetchOpts,
      headers: authHeaders(),
    });
    const list = listRes.ok
      ? ((await listRes.json()) as { chats?: ChatSummary[] })
      : { chats: [] };
    const chats = list.chats ?? [];
    setSummaries(chats);
    if (chats.length > 0) await openChat(chats[0].id, false);
    else await createChat(next.id);
    setSitesOpen(false);
    pushLog("info", "Site activo.", `name=${next.name} files=${next.files?.length ?? 0}`);
  }

  async function boot() {
    setError("");
    pushLog("info", "Boot: cargando sites desde S3…");
    const list = await refreshSites();
    if (list.length === 0) {
      await createSite("Default");
      return;
    }
    const saved = localStorage.getItem(SITE_KEY);
    const pick = list.find((s) => s.id === saved) ?? list[0];
    await openSite(pick.id);
  }

  async function createSite(name: string) {
    const trimmed = name.trim() || "Nuevo site";
    setBusy(true);
    pushLog("info", "Creando site…", trimmed);
    const res = await fetch(`${API}/sites`, {
      method: "POST",
      ...fetchOpts,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo crear el site.");
      return;
    }
    const body = (await res.json()) as { site: Site; chat: Chat };
    await refreshSites();
    applySite(body.site);
    setChat(body.chat);
    setSummaries([
      {
        id: body.chat.id,
        title: body.chat.title,
        updated: body.chat.updated,
        siteId: body.site.id,
      },
    ]);
    setSiteNameDraft(body.site.name);
    setSitesOpen(false);
  }

  async function renameActiveSite(name: string) {
    const trimmed = name.trim();
    if (!site.id || !trimmed || trimmed === site.name) return;
    const res = await fetch(`${API}/sites/${encodeURIComponent(site.id)}`, {
      method: "PATCH",
      ...fetchOpts,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      setError("No se pudo renombrar el site.");
      setSiteNameDraft(site.name);
      return;
    }
    const next = (await res.json()) as Site;
    applySite(next);
    await refreshSites();
    pushLog("info", "Site renombrado.", next.name);
  }

  async function submitSiteName() {
    const trimmed = siteNameDraft.trim();
    if (!trimmed) return;
    if (site.id && trimmed === site.name) return;
    // If draft matches no site and user presses Enter with a new name while a site is selected → rename.
    // If they want create: use explicit "Crear" or Enter when draft doesn't match active rename intent.
    // Spec: same input creates OR renames. Create when no active site OR when clicking Crear;
    // blur/Enter on changed name while active → rename. Separate Crear button for new.
    if (site.id) await renameActiveSite(trimmed);
    else await createSite(trimmed);
  }

  async function createChat(siteId = siteIdRef.current) {
    if (!siteId) return;
    setBusy(true);
    setError("");
    const res = await fetch(`${API}/chats`, {
      method: "POST",
      ...fetchOpts,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo crear la conversación.");
      return;
    }
    const next = (await res.json()) as Chat;
    setChat(next);
    await refreshSummaries(siteId);
    setHistoryOpen(false);
  }

  async function openChat(id: string, closeHistory = true) {
    setBusy(true);
    setError("");
    const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, {
      ...fetchOpts,
      headers: authHeaders(),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo abrir la conversación.");
      return;
    }
    const next = (await res.json()) as Chat;
    next.messages = (next.messages ?? []).map((m) =>
      m.role === "assistant" ? { ...m, text: displayAssistantText(m.text) } : m,
    );
    setChat(next);
    if (closeHistory) setHistoryOpen(false);
  }

  async function deleteChat(id: string) {
    if (!confirm("¿Borrar esta conversación del S3?")) return;
    const wasActive = chatIdRef.current === id;
    setBusy(true);
    setSummaries((prev) => prev.filter((s) => s.id !== id));
    if (wasActive) setChat(emptyChat());
    const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, {
      method: "DELETE",
      ...fetchOpts,
      headers: authHeaders(),
    });
    if (!res.ok) {
      setBusy(false);
      setError("No se pudo borrar la conversación.");
      await refreshSummaries();
      return;
    }
    const body = (await res.json()) as { chats?: ChatSummary[] };
    const nextList = body.chats ?? [];
    setSummaries(nextList);
    setBusy(false);
    if (wasActive) {
      if (nextList.length > 0) await openChat(nextList[0].id);
      else await createChat();
    }
  }

  async function openFilesEditor() {
    if (!site.id) return;
    setFilesOpen(true);
    const fromSite: EditorFile[] = (site.files ?? []).map((f) => ({
      name: f.name,
      type: f.type,
      bytes: f.text?.length ?? 0,
      text: f.text,
      encoding: (f as SiteFile & { encoding?: string }).encoding,
    }));
    if (fromSite.length > 0) {
      setEditorFiles(fromSite);
      selectEditorFile(fromSite[0]);
    }
    const res = await fetch(`${API}/sites/${encodeURIComponent(site.id)}/files`, {
      ...fetchOpts,
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (fromSite.length === 0) setError("No se pudo leer los archivos del site.");
      return;
    }
    const body = (await res.json()) as { files?: EditorFile[] };
    const files = (body.files ?? []).map((f) => ({
      ...f,
      text: typeof f.text === "string" ? decodeFileText(f.text) : f.text,
    }));
    setEditorFiles(files);
    if (files.length > 0) {
      const pick = files.find((f) => f.name === editorName) ?? files[0];
      selectEditorFile(pick);
    } else {
      setEditorName("");
      setEditorText("");
      setEditorDirty(false);
    }
  }

  function selectEditorFile(f: EditorFile) {
    setEditorName(f.name);
    if (f.encoding === "base64" || BINARY_EXT.test(f.name)) {
      setEditorText("");
    } else {
      setEditorText(decodeFileText(f.text ?? ""));
    }
    setEditorDirty(false);
  }

  async function downloadEditorFile() {
    if (!site.id || !editorName) return;
    const url = `${API}/sites/${encodeURIComponent(site.id)}/files/${encodeURIComponent(editorName)}/download`;
    const res = await fetch(url, { ...fetchOpts, headers: authHeaders() });
    if (!res.ok) {
      setError("No se pudo descargar el archivo.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = editorName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveEditorFile() {
    if (!site.id || !editorName.trim()) return;
    setBusy(true);
    const res = await fetch(`${API}/sites/${encodeURIComponent(site.id)}/files`, {
      method: "PUT",
      ...fetchOpts,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: editorName.trim(), text: editorText }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo guardar el archivo en S3.");
      pushLog("error", "Save file failed", `HTTP ${res.status}`);
      return;
    }
    const next = (await res.json()) as Site;
    applySite(next);
    setEditorDirty(false);
    setEditorFiles(
      (next.files ?? []).map((f) => ({
        name: f.name,
        type: f.type,
        bytes: f.text.length,
        text: f.text,
      })),
    );
    pushLog("info", "Archivo guardado en S3.", editorName);
  }

  async function send() {
    if (!chat.id || !message.trim() || busy) return;
    const text = message.trim();
    const now = new Date().toISOString();
    setMessage("");
    setError("");
    setBusy(true);
    streamTextRef.current = "";
    setAskProgress({ percent: 1, phase: "request" });
    setConsoleOpen(true);
    pushLog("info", "Cliente: POST /ask (SSE)…", `chatId=${chat.id}`);
    setChat((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { role: "user", text, at: now },
        { role: "assistant", text: "", at: now },
      ],
    }));

    try {
      const res = await fetch(`${API}/chats/${encodeURIComponent(chat.id)}/ask`, {
        method: "POST",
        cache: "no-store",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          model: agentPrefs.model,
          thinking: agentPrefs.thinking,
          reasoningEffort: agentPrefs.reasoningEffort,
        }),
      });
      if (!res.ok || !res.body) {
        let errMsg = "No se pudo procesar el mensaje.";
        try {
          const body = await res.json();
          if (body?.error) errMsg = String(body.error);
        } catch {
          errMsg = `Ask falló HTTP ${res.status}`;
        }
        setError(errMsg);
        pushLog("error", errMsg);
        setAskProgress(null);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (eventName === "log") {
            const levelRaw = String(payload.level ?? "info");
            const level: ConsoleEntry["level"] =
              levelRaw === "error" || levelRaw === "warn" ? levelRaw : "info";
            const extra = { ...payload };
            delete extra.at;
            delete extra.level;
            delete extra.message;
            pushLog(
              level,
              String(payload.message ?? "log"),
              Object.keys(extra).length ? JSON.stringify(extra) : undefined,
              typeof payload.at === "string" ? payload.at : undefined,
            );
          }
          if (eventName === "progress") {
            const pct = Number(payload.percent);
            if (Number.isFinite(pct)) {
              setAskProgress({
                percent: Math.max(0, Math.min(100, Math.round(pct))),
                phase: String(payload.phase ?? ""),
              });
            }
          }
          if (eventName === "token" && typeof payload.text === "string") {
            streamTextRef.current += payload.text;
            const snap = streamTextRef.current;
            setChat((prev) => {
              const msgs = [...prev.messages];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = { ...last, text: snap };
              }
              return { ...prev, messages: msgs };
            });
          }
          if (eventName === "error") {
            const errMsg = String(payload.error ?? "Error de stream");
            setError(errMsg);
            pushLog("error", errMsg);
            setAskProgress(null);
          }
          if (eventName === "done") {
            const doneBody = payload as { chat?: Chat; site?: Site };
            if (doneBody.chat) setChat(doneBody.chat);
            if (doneBody.site) applySite(doneBody.site);
            await refreshSummaries();
            void refreshBalance();
            setAskProgress({ percent: 100, phase: "done" });
            pushLog("info", "done: chat + site persistidos.");
          }
          eventName = "message";
        }
      }
    } catch (e) {
      const msg = networkErrorMessage(e);
      setError(msg);
      pushLog("error", msg);
    } finally {
      setBusy(false);
      window.setTimeout(() => setAskProgress(null), 1200);
    }
  }

  async function drop(files: FileList | null) {
    if (!site.id) return;
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    setBusy(true);
    const res = await fetch(`${API}/sites/${encodeURIComponent(site.id)}/files`, {
      method: "PUT",
      cache: "no-store",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, text }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Archivo rechazado.");
      return;
    }
    applySite((await res.json()) as Site);
  }

  const previewFile =
    site.files?.find((f) => f.name === selected) ??
    site.files?.find((f) => f.name.endsWith(".html"));
  const preview =
    previewFile?.text ??
    "<!doctype html><html><body style='font:0.75rem/1.4 sans-serif;padding:1rem'><p>Seleccioná un site o generá HTML.</p></body></html>";

  if (!isPlatformAdmin()) {
    return <p className="agent-sandbox__denied">Acceso exclusivo para administradores.</p>;
  }

  return (
    <section className={`agent-sandbox${sidebarOpen ? "" : " agent-sandbox--collapsed"}`}>
      <AgentSandboxHeaderMenu
        sidebarOpen={sidebarOpen}
        sitesOpen={sitesOpen}
        consoleOpen={consoleOpen}
        settingsOpen={settingsOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSites={() => {
          void refreshSites();
          setSiteNameDraft(site.name);
          setSitesOpen(true);
        }}
        onOpenHistory={() => {
          void refreshSummaries();
          setHistoryOpen(true);
        }}
        onOpenFiles={() => void openFilesEditor()}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
      />

      {sidebarOpen ? (
        <aside className="agent-sandbox__sidebar" aria-label="Chat">
          <div className="agent-sandbox__chat-tray" ref={trayRef}>
            {chat.messages.length === 0 ? (
              <p className="agent-sandbox__hint">
                Site: <strong>{site.name || "—"}</strong>. Escribí una instrucción para el agente.
              </p>
            ) : (
              chat.messages.map((m, i) => (
                <article
                  key={`${m.at ?? i}-${i}`}
                  className={`agent-sandbox__bubble agent-sandbox__bubble--${m.role}`}
                >
                  {m.at ? (
                    <time className="agent-sandbox__msg-time" dateTime={m.at}>
                      {formatMsgTime(m.at)}
                    </time>
                  ) : null}
                  {m.role === "assistant" ? (
                    m.text ? (
                      <ChatMarkdown text={displayAssistantText(m.text)} />
                    ) : (
                      <p className="agent-sandbox__streaming">…</p>
                    )
                  ) : (
                    <ChatMarkdown text={m.text} />
                  )}
                </article>
              ))
            )}
          </div>
          <div className="agent-sandbox__composer">
            <textarea
              className="agent-sandbox__input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Instrucción para el agente…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={busy || !chat.id}
            />
            <div className="agent-sandbox__composer-row">
              <label
                className="agent-sandbox__drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void drop(e.dataTransfer.files);
                }}
              >
                Arrastrá un archivo
                <input
                  type="file"
                  accept=".html,.css,.js,.json,.txt,.svg"
                  onChange={(e) => void drop(e.target.files)}
                />
              </label>
              <button
                type="button"
                className="agent-sandbox__send"
                onClick={() => void send()}
                disabled={busy || !chat.id || !message.trim()}
              >
                {busy ? "…" : "Enviar"}
              </button>
            </div>
            {error ? <p className="agent-sandbox__error">{error}</p> : null}
          </div>
        </aside>
      ) : null}

      <main className="agent-sandbox__preview-pane">
        <div className="agent-sandbox__tabs" role="tablist" aria-label="Vistas HTML">
          {(site.tabs?.length
            ? site.tabs
            : (site.files ?? [])
                .filter((f) => f.name.endsWith(".html"))
                .map((f) => ({ id: f.name, label: f.name, file: f.name }))
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={selected === tab.file ? "is-active" : ""}
              aria-selected={selected === tab.file}
              onClick={() => setSelected(tab.file)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="agent-sandbox__frame-wrap">
          <iframe
            key={`${site.id}-${selected}-${site.updated}-${previewFile?.text?.length ?? 0}`}
            className="agent-sandbox__frame"
            title="Vista generada"
            sandbox="allow-scripts"
            srcDoc={preview}
          />
        </div>
      </main>

      {sitesOpen ? (
        <div
          className="agent-sandbox__modal"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSitesOpen(false);
          }}
        >
          <div className="agent-sandbox__modal-panel" role="dialog" aria-modal="true" aria-label="Sites">
            <header className="agent-sandbox__modal-head">
              <h2>Sites</h2>
            </header>
            <div className="agent-sandbox__site-name-row">
              <input
                className="agent-sandbox__site-name"
                value={siteNameDraft}
                onChange={(e) => setSiteNameDraft(e.target.value)}
                onBlur={() => void submitSiteName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitSiteName();
                  }
                }}
                placeholder="Nombre del site"
                aria-label="Nombre del site"
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !siteNameDraft.trim()}
                onClick={() => void createSite(siteNameDraft)}
              >
                Crear
              </button>
            </div>
            <ul className="agent-sandbox__history-list">
              {sites.map((s) => (
                <li key={s.id} className={s.id === site.id ? "is-current" : ""}>
                  <button
                    type="button"
                    className="agent-sandbox__history-open"
                    onClick={() => {
                      setSiteNameDraft(s.name);
                      void openSite(s.id);
                    }}
                  >
                    <strong>{s.name}</strong>
                    <span>{s.updated}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="agent-sandbox__modal-actions">
              <button type="button" className="btn btn--primary" onClick={() => setSitesOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div
          className="agent-sandbox__modal"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHistoryOpen(false);
          }}
        >
          <div className="agent-sandbox__modal-panel" role="dialog" aria-modal="true" aria-label="Historial">
            <header className="agent-sandbox__modal-head">
              <h2>Historial — {site.name || "site"}</h2>
              <button type="button" className="btn" onClick={() => void createChat()} disabled={busy || !site.id}>
                Nueva
              </button>
            </header>
            <ul className="agent-sandbox__history-list">
              {summaries.map((s) => (
                <li key={s.id} className={s.id === chat.id ? "is-current" : ""}>
                  <button type="button" className="agent-sandbox__history-open" onClick={() => void openChat(s.id)}>
                    <strong>{s.title || "Sin título"}</strong>
                    <span>{s.updated}</span>
                  </button>
                  <button
                    type="button"
                    className="agent-sandbox__history-del"
                    onClick={() => void deleteChat(s.id)}
                    disabled={busy}
                  >
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
            <div className="agent-sandbox__modal-actions">
              <button type="button" className="btn btn--primary" onClick={() => setHistoryOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {filesOpen ? (
        <div className="agent-sandbox__editor-overlay" role="dialog" aria-modal="true" aria-label="Editor de archivos">
          <header className="agent-sandbox__editor-toolbar">
            <span className="agent-sandbox__editor-title">{site.name || "site"}</span>
            <div className="agent-sandbox__editor-icons">
              <button
                type="button"
                className="agent-sandbox__icon-btn"
                title="Guardar"
                aria-label="Guardar"
                disabled={busy || !editorName || !editorDirty || BINARY_EXT.test(editorName)}
                onClick={() => void saveEditorFile()}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="agent-sandbox__icon-btn"
                title="Descargar"
                aria-label="Descargar"
                disabled={!editorName}
                onClick={() => void downloadEditorFile()}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path fill="currentColor" d="M5 20h14v-2H5v2zM11 4v8.17L8.41 9.59 7 11l5 5 5-5-1.41-1.41L13 12.17V4h-2z" />
                </svg>
              </button>
              <button
                type="button"
                className="agent-sandbox__icon-btn"
                title="Cerrar"
                aria-label="Cerrar"
                onClick={() => setFilesOpen(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
          </header>
          <div className="agent-sandbox__editor agent-sandbox__editor--fill">
            <ul className="agent-sandbox__editor-tree">
              {editorFiles.length === 0 ? (
                <li className="agent-sandbox__hint">Sin archivos aún.</li>
              ) : (
                editorFiles.map((f) => (
                  <li key={f.name}>
                    <button
                      type="button"
                      className={editorName === f.name ? "is-active" : ""}
                      onClick={() => selectEditorFile(f)}
                    >
                      <code>{f.name}</code>
                      <span>{f.bytes} B</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {editorName && (BINARY_EXT.test(editorName) || editorFiles.find((f) => f.name === editorName)?.encoding === "base64") ? (
              <p className="agent-sandbox__editor-binary">
                Archivo binario. Usá <strong>Descargar</strong> para obtenerlo desde S3.
              </p>
            ) : (
              <textarea
                className="agent-sandbox__editor-text"
                value={editorText}
                onChange={(e) => {
                  setEditorText(e.target.value);
                  setEditorDirty(true);
                }}
                disabled={!editorName}
                spellCheck={false}
                aria-label="Contenido del archivo"
              />
            )}
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div
          className="agent-sandbox__modal"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="agent-sandbox__modal-panel" role="dialog" aria-modal="true" aria-label="Agente">
            <header className="agent-sandbox__modal-head">
              <h2>Configurar agente</h2>
            </header>
            <label className="agent-sandbox__settings-field">
              Modelo
              <select
                value={agentPrefs.model}
                onChange={(e) =>
                  setAgentPrefs((p) => ({
                    ...p,
                    model: e.target.value as AgentPrefs["model"],
                  }))
                }
              >
                <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
              </select>
            </label>
            <label className="agent-sandbox__settings-field">
              Modo
              <select
                value={agentPrefs.thinking}
                onChange={(e) =>
                  setAgentPrefs((p) => ({
                    ...p,
                    thinking: e.target.value as AgentPrefs["thinking"],
                  }))
                }
              >
                <option value="disabled">Flash (sin reasoning)</option>
                <option value="enabled">Reasoning</option>
              </select>
            </label>
            <label className="agent-sandbox__settings-field">
              Effort (si reasoning)
              <select
                value={agentPrefs.reasoningEffort}
                onChange={(e) =>
                  setAgentPrefs((p) => ({
                    ...p,
                    reasoningEffort: e.target.value as AgentPrefs["reasoningEffort"],
                  }))
                }
              >
                <option value="low">low</option>
                <option value="high">medium / high</option>
                <option value="max">max</option>
              </select>
            </label>
            <div className="agent-sandbox__modal-actions">
              <button type="button" className="btn btn--primary" onClick={() => setSettingsOpen(false)}>
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {consoleOpen ? (
        <>
          <button
            type="button"
            className="agent-sandbox__console-scrim"
            aria-label="Cerrar consola"
            onClick={() => setConsoleOpen(false)}
          />
          <aside className="agent-sandbox__console" role="dialog" aria-modal="true" aria-label="Consola del agente">
            <header className="agent-sandbox__console-head">
              <h2>Consola</h2>
              <button type="button" className="btn" onClick={() => setConsoleOpen(false)}>
                Cerrar
              </button>
            </header>
            <div className="agent-sandbox__console-stream" ref={consoleRef}>
              {consoleLogs.length === 0 ? (
                <p className="agent-sandbox__hint">Sin eventos aún.</p>
              ) : (
                consoleLogs.map((line) => (
                  <p
                    key={line.id}
                    className={`agent-sandbox__console-line agent-sandbox__console-line--${line.level}`}
                  >
                    <span className="agent-sandbox__console-meta">
                      {formatMsgTime(line.at)} · {line.level}
                    </span>
                    {line.message}
                    {line.detail ? `\n${line.detail}` : ""}
                  </p>
                ))
              )}
            </div>
            <footer className="agent-sandbox__console-foot">
              <div className="agent-sandbox__console-foot-main">
                <p className="agent-sandbox__console-balance" title="Saldo DeepSeek">
                  {balanceError
                    ? "Saldo: —"
                    : balance
                      ? `${balance.total_balance}$ restante`
                      : "Saldo: …"}
                </p>
                {askProgress ? (
                  <div
                    className="agent-sandbox__console-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={askProgress.percent}
                    aria-label={`Progreso del agente: ${askProgress.phase || "stream"}`}
                    title={
                      askProgress.phase === "reasoning"
                        ? "Pensando (sin tamaño total conocido)"
                        : askProgress.phase || "Progreso estimado"
                    }
                  >
                    <div
                      className="agent-sandbox__console-progress-fill"
                      style={{ width: `${askProgress.percent}%` }}
                    />
                    <span className="agent-sandbox__console-progress-label">
                      {askProgress.percent}%
                      {askProgress.phase ? ` · ${askProgress.phase}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn" onClick={() => setConsoleLogs([])}>
                Limpiar
              </button>
            </footer>
          </aside>
        </>
      ) : null}
    </section>
  );
}
