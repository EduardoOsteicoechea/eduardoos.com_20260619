import { useEffect, useState } from "react";
import { isPlatformAdmin } from "../../lib/auth";
import "./AgentSandbox.css";

type File = { name: string; type: string; text: string };
type Workspace = { spec: string; messages: { role: string; text: string }[]; files: File[]; tabs: { id: string; label: string; file: string }[] };
const api = "/api/admin/agent-sandbox";

export default function AgentSandbox() {
  const [data, setData] = useState<Workspace>({ spec: "", messages: [], files: [], tabs: [] });
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void load(); }, []);
  async function load() {
    const res = await fetch(`${api}/workspace`, { headers: { Authorization: `Bearer ${localStorage.getItem("eduardoos-next-auth-token")}` } });
    if (res.ok) { const next = await res.json(); setData(next); setSelected(next.tabs?.[0]?.file ?? ""); }
    else setError("No se pudo cargar el workspace.");
  }
  async function send() {
    if (!message.trim()) return; setBusy(true); setError("");
    const res = await fetch(`${api}/ask`, { method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("eduardoos-next-auth-token")}` }, body: JSON.stringify({ message }) });
    const next = await res.json(); setBusy(false);
    if (!res.ok) { setError(next.error ?? "No se pudo procesar el mensaje."); return; }
    setData(next); setMessage(""); setSelected(next.tabs?.[0]?.file ?? selected);
  }
  async function drop(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    const text = await file.text();
    const res = await fetch(`${api}/files`, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("eduardoos-next-auth-token")}`}, body:JSON.stringify({name:file.name,text}) });
    if (res.ok) setData(await res.json()); else setError("Archivo rechazado. Solo HTML, CSS, JS, JSON, TXT o SVG.");
  }
  const preview = data.files.find((f) => f.name === selected)?.text ?? "<p>Seleccione una vista HTML generada.</p>";
  if (!isPlatformAdmin()) return <p className="agent-sandbox__denied">Acceso exclusivo para administradores.</p>;
  return <section className={`agent-sandbox ${open ? "" : "agent-sandbox--collapsed"}`}>
    <aside className="agent-sandbox__sidebar">
      <button type="button" onClick={() => setOpen(false)}>Ocultar panel</button>
      <h2>Agent Sandbox</h2><p>Especificación viva</p><pre>{data.spec || "El agente creará el spec con tu primera instrucción."}</pre>
    </aside>
    <main className="agent-sandbox__work">
      {!open && <button className="agent-sandbox__reopen" type="button" onClick={() => setOpen(true)}>Mostrar panel</button>}
      <div className="agent-sandbox__preview-tabs">{data.tabs.map((tab) => <button key={tab.id} className={selected === tab.file ? "is-active" : ""} onClick={() => setSelected(tab.file)}>{tab.label}</button>)}</div>
      <iframe className="agent-sandbox__preview" title="Generated website preview" sandbox="allow-scripts" srcDoc={preview} />
      <section className="agent-sandbox__chat">{data.messages.map((m, i) => <p key={i} className={`agent-sandbox__message agent-sandbox__message--${m.role}`}>{m.text}</p>)}</section>
      <section className="agent-sandbox__composer">
        <textarea value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Describe el sitio o la documentación que quieres analizar…" />
        <div className="agent-sandbox__composer-bottom">
          <label className="agent-sandbox__drop" onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();void drop(e.dataTransfer.files)}}>Arrastra un archivo<input type="file" onChange={(e)=>void drop(e.target.files)} /></label>
          <button type="button" onClick={()=>void send()} disabled={busy}>{busy ? "Razonando…" : "Enviar"}</button>
        </div>{error && <p className="agent-sandbox__error">{error}</p>}
      </section>
    </main>
  </section>;
}
