/**
 * Agent Sandbox — left chat sidebar (80/20) + full-height generated preview.
 * Ask uses SSE so the assistant reply streams into the tray.
 */

import { useEffect, useRef, useState } from "react";
import { isPlatformAdmin } from "../../lib/auth";
import ChatMarkdown from "../Chat/ChatMarkdown";
import AgentSandboxHeaderMenu from "./AgentSandboxHeaderMenu";
import "./AgentSandbox.css";

type ChatMessage = { role: string; text: string; at?: string };
type SiteFile = { name: string; type: string; text: string };
type Tab = { id: string; label: string; file: string };
type Chat = {
  id: string;
  title: string;
  spec: string;
  messages: ChatMessage[];
  files: SiteFile[];
  tabs: Tab[];
  updated: string;
};
type ChatSummary = { id: string; title: string; updated: string };
type FileRow = { name: string; type: string; bytes: number };

const API = "/api/admin/agent-sandbox";
const SIDEBAR_KEY = "eduardoos-agent-sandbox-sidebar";

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem("eduardoos-next-auth-token") ?? ""}`,
  };
}

function emptyChat(): Chat {
  return {
    id: "",
    title: "",
    spec: "",
    messages: [],
    files: [],
    tabs: [],
    updated: "",
  };
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

export default function AgentSandbox() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chat, setChat] = useState<Chat>(emptyChat());
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const trayRef = useRef<HTMLDivElement>(null);
  const streamTextRef = useRef("");

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === "0") setSidebarOpen(false);
    void boot();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  async function boot() {
    setError("");
    const listRes = await fetch(`${API}/chats`, { headers: authHeaders() });
    if (!listRes.ok) {
      setError("No se pudo cargar el historial.");
      return;
    }
    const list = (await listRes.json()) as { chats?: ChatSummary[] };
    const chats = list.chats ?? [];
    setSummaries(chats);
    if (chats.length === 0) {
      await createChat();
      return;
    }
    await openChat(chats[0].id);
  }

  async function refreshSummaries() {
    const listRes = await fetch(`${API}/chats`, { headers: authHeaders() });
    if (!listRes.ok) return;
    const list = (await listRes.json()) as { chats?: ChatSummary[] };
    setSummaries(list.chats ?? []);
  }

  async function createChat() {
    setBusy(true);
    setError("");
    const res = await fetch(`${API}/chats`, {
      method: "POST",
      headers: authHeaders(),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo crear la conversación.");
      return;
    }
    const next = (await res.json()) as Chat;
    setChat(next);
    setSelected(next.tabs?.[0]?.file ?? "");
    await refreshSummaries();
    setHistoryOpen(false);
  }

  async function openChat(id: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo abrir la conversación.");
      return;
    }
    const next = (await res.json()) as Chat;
    setChat(next);
    setSelected(
      next.tabs?.[0]?.file ??
        next.files.find((f) => f.name.endsWith(".html"))?.name ??
        "",
    );
    setHistoryOpen(false);
  }

  async function deleteChat(id: string) {
    if (!confirm("¿Borrar esta conversación del S3?")) return;
    setBusy(true);
    const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setBusy(false);
    if (!res.ok) {
      setError("No se pudo borrar la conversación.");
      return;
    }
    if (chat.id === id) {
      setChat(emptyChat());
      setSelected("");
    }
    await refreshSummaries();
    const listRes = await fetch(`${API}/chats`, { headers: authHeaders() });
    const list = listRes.ok
      ? ((await listRes.json()) as { chats?: ChatSummary[] })
      : { chats: [] };
    const nextList = list.chats ?? [];
    if (nextList.length > 0) await openChat(nextList[0].id);
    else await createChat();
  }

  async function send() {
    if (!chat.id || !message.trim() || busy) return;
    const text = message.trim();
    const now = new Date().toISOString();
    setMessage("");
    setError("");
    setBusy(true);
    streamTextRef.current = "";
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
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        let errMsg = "No se pudo procesar el mensaje.";
        try {
          const body = await res.json();
          if (body?.error) errMsg = String(body.error);
        } catch {
          /* ignore */
        }
        setError(errMsg);
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
            setError(String(payload.error ?? "Error de stream"));
          }
          if (eventName === "done") {
            const next = payload as unknown as Chat;
            setChat(next);
            setSelected(
              next.tabs?.[0]?.file ??
                next.files?.find((f) => f.name.endsWith(".html"))?.name ??
                selected,
            );
            await refreshSummaries();
          }
          eventName = "message";
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function drop(files: FileList | null) {
    if (!chat.id) return;
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    setBusy(true);
    const res = await fetch(`${API}/chats/${encodeURIComponent(chat.id)}/files`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, text }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Archivo rechazado. Solo HTML, CSS, JS, JSON, TXT o SVG.");
      return;
    }
    setChat(await res.json());
  }

  async function openFilesModal() {
    if (!chat.id) return;
    setFilesOpen(true);
    const res = await fetch(`${API}/chats/${encodeURIComponent(chat.id)}/files`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      setError("No se pudo leer la estructura de archivos.");
      return;
    }
    const body = (await res.json()) as { files?: FileRow[] };
    setFileRows(body.files ?? []);
  }

  const previewFile =
    chat.files.find((f) => f.name === selected) ??
    chat.files.find((f) => f.name.endsWith(".html"));
  const preview =
    previewFile?.text ??
    "<!doctype html><html><body style='font:0.75rem/1.4 sans-serif;padding:1rem'><p>Seleccione una vista HTML generada.</p></body></html>";

  if (!isPlatformAdmin()) {
    return <p className="agent-sandbox__denied">Acceso exclusivo para administradores.</p>;
  }

  return (
    <section className={`agent-sandbox${sidebarOpen ? "" : " agent-sandbox--collapsed"}`}>
      <AgentSandboxHeaderMenu
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenHistory={() => {
          void refreshSummaries();
          setHistoryOpen(true);
        }}
        onOpenFiles={() => void openFilesModal()}
      />

      {sidebarOpen ? (
        <aside className="agent-sandbox__sidebar" aria-label="Chat">
          <div className="agent-sandbox__chat-tray" ref={trayRef}>
            {chat.messages.length === 0 ? (
              <p className="agent-sandbox__hint">
                Escribí una instrucción. El agente actualiza el spec y genera el sitio a la derecha.
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
                      <ChatMarkdown text={m.text} />
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
          {(chat.tabs?.length
            ? chat.tabs
            : chat.files
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
        <iframe
          className="agent-sandbox__frame"
          title="Vista generada"
          sandbox="allow-scripts"
          srcDoc={preview}
        />
      </main>

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
              <h2>Historial de chat</h2>
              <button type="button" className="btn" onClick={() => void createChat()} disabled={busy}>
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
        <div
          className="agent-sandbox__modal"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilesOpen(false);
          }}
        >
          <div className="agent-sandbox__modal-panel" role="dialog" aria-modal="true" aria-label="Archivos">
            <header className="agent-sandbox__modal-head">
              <h2>Estructura de archivos</h2>
            </header>
            {fileRows.length === 0 ? (
              <p className="agent-sandbox__hint">Aún no hay archivos en este chat.</p>
            ) : (
              <ul className="agent-sandbox__file-list">
                {fileRows.map((f) => (
                  <li key={f.name}>
                    <code>{f.name}</code>
                    <span>
                      {f.type} · {f.bytes} B
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="agent-sandbox__modal-actions">
              <button type="button" className="btn btn--primary" onClick={() => setFilesOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
