/**
 * eVoice hub — projects, docs upload, generate jobs, playlist player (spec 044).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import ServiceGate from "../ServiceGate/ServiceGate";
import {
  createEvoiceProject,
  deleteEvoiceDoc,
  fetchEvoiceAudioBlobUrl,
  fetchEvoiceAudios,
  fetchEvoiceDocs,
  fetchEvoiceJob,
  fetchEvoiceMe,
  fetchEvoiceProjects,
  fetchEvoiceUsers,
  startEvoiceGenerate,
  uploadEvoiceDoc,
  type EvoiceObjectMeta,
} from "../../lib/evoice";
import { getAuthToken } from "../../lib/auth";
import "./Evoice.css";

export default function EvoicePage() {
  return (
    <ServiceGate serviceId="evoice" serviceLabel="eVoice">
      <EvoiceWorkspace />
    </ServiceGate>
  );
}

function EvoiceWorkspace() {
  const [userSafe, setUserSafe] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [ownerSafe, setOwnerSafe] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [newProject, setNewProject] = useState("");
  const [docs, setDocs] = useState<EvoiceObjectMeta[]>([]);
  const [audios, setAudios] = useState<EvoiceObjectMeta[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");

  const reloadProjects = useCallback(async (owner: string) => {
    const res = await fetchEvoiceProjects(owner);
    if (res.error) {
      setError(res.error);
      setProjects([]);
      return;
    }
    setProjects(res.projects);
    setOwnerSafe(res.ownerSafe || owner);
    if (res.projects.length && !res.projects.includes(project)) {
      setProject(res.projects[0] ?? "");
    }
  }, [project]);

  const reloadDocsAudios = useCallback(async (owner: string, proj: string) => {
    if (!owner || !proj) {
      setDocs([]);
      setAudios([]);
      return;
    }
    const [d, a] = await Promise.all([
      fetchEvoiceDocs(owner, proj),
      fetchEvoiceAudios(owner, proj),
    ]);
    if (d.error) setError(d.error);
    if (a.error) setError(a.error);
    setDocs(d.docs);
    setAudios(a.audios);
    setTrackIndex(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchEvoiceMe();
      if (cancelled) return;
      if (me.error) {
        setError(me.error);
        return;
      }
      setUserSafe(me.userSafe);
      setIsAdmin(me.isAdmin);
      setOwnerSafe(me.userSafe);
      if (me.isAdmin) {
        const u = await fetchEvoiceUsers();
        if (!cancelled && !u.error) setUsers(u.users);
      }
      await reloadProjects(me.userSafe);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadProjects]);

  useEffect(() => {
    if (ownerSafe && project) {
      void reloadDocsAudios(ownerSafe, project);
    }
  }, [ownerSafe, project, reloadDocsAudios]);

  useEffect(() => {
    let revoked = false;
    void (async () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = "";
      }
      setBlobUrl("");
      const track = audios[trackIndex];
      if (!track || !ownerSafe || !project || !getAuthToken()) return;
      try {
        const url = await fetchEvoiceAudioBlobUrl(ownerSafe, project, track.name);
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load audio");
      }
    })();
    return () => {
      revoked = true;
    };
  }, [audios, trackIndex, ownerSafe, project]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    const name = newProject.trim();
    if (!name || busy) return;
    setBusy(true);
    setError("");
    const res = await createEvoiceProject(name, isAdmin ? ownerSafe : undefined);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewProject("");
    setProject(res.project);
    await reloadProjects(res.ownerSafe || ownerSafe);
  }

  async function onUpload(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !ownerSafe || !project || busy) return;
    setBusy(true);
    setError("");
    const res = await uploadEvoiceDoc(ownerSafe, project, file);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteDoc(name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete ${name}?`)) return;
    setBusy(true);
    const res = await deleteEvoiceDoc(ownerSafe, project, name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onGenerate() {
    if (!ownerSafe || !project || busy) return;
    setBusy(true);
    setError("");
    setLogs(["starting…"]);
    const started = await startEvoiceGenerate(ownerSafe, project);
    if (started.error || !started.jobId) {
      setBusy(false);
      setError(started.error || "Could not start generate");
      return;
    }
    const jobId = started.jobId;
    for (;;) {
      await new Promise((r) => setTimeout(r, 600));
      const { job, error: jobErr } = await fetchEvoiceJob(jobId);
      if (jobErr || !job) {
        setError(jobErr || "Job lost");
        break;
      }
      setLogs(job.logs ?? []);
      if (job.state === "done" || job.state === "failed") {
        if (job.state === "failed") setError(job.error || "Generate failed");
        break;
      }
    }
    setBusy(false);
    await reloadDocsAudios(ownerSafe, project);
  }

  function play() {
    void audioRef.current?.play();
  }
  function pause() {
    audioRef.current?.pause();
  }
  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }
  function next() {
    if (trackIndex < audios.length - 1) setTrackIndex((i) => i + 1);
  }

  return (
    <div className="evoice">
      <header className="evoice__head">
        <p className="evoice__eyebrow">Eduardo OS</p>
        <h1 className="evoice__title">eVoice</h1>
        <p className="evoice__lead">
          Documents to MP3 under <code>evoice/{userSafe || "…"}/</code>. One audio
          per source; regenerate when missing or outdated.
        </p>
      </header>

      {error ? <p className="evoice__error">{error}</p> : null}

      {isAdmin ? (
        <label className="evoice__field">
          <span>Owner (admin)</span>
          <select
            className="evoice__select"
            value={ownerSafe}
            onChange={(e) => {
              setOwnerSafe(e.target.value);
              setProject("");
              void reloadProjects(e.target.value);
            }}
          >
            {[ownerSafe, ...users.filter((u) => u !== ownerSafe)].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="evoice__toolbar">
        <label className="evoice__field evoice__field--grow">
          <span>Project</span>
          <select
            className="evoice__select evoice__select--tall"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            disabled={!projects.length}
          >
            {projects.length === 0 ? (
              <option value="">No projects yet</option>
            ) : (
              projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))
            )}
          </select>
        </label>
        <form className="evoice__create" onSubmit={onCreateProject}>
          <label className="evoice__field">
            <span>New project</span>
            <input
              className="evoice__input"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              placeholder="project-name"
              pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}"
              required
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Create
          </button>
        </form>
      </div>

      {project ? (
        <>
          <section className="evoice__panel">
            <div className="evoice__panel-head">
              <h2>Docs</h2>
              <label className="btn evoice__upload">
                Upload
                <input type="file" hidden onChange={onUpload} disabled={busy} />
              </label>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void onGenerate()}
                disabled={busy}
              >
                Generate
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="evoice__empty">No documents yet. Upload .txt, .docx, .pdf, or images.</p>
            ) : (
              <ul className="evoice__list">
                {docs.map((d) => (
                  <li key={d.key}>
                    <span>{d.name}</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void onDeleteDoc(d.name)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="evoice__panel">
            <h2>Generate log</h2>
            <pre className="evoice__log">{logs.join("\n") || "—"}</pre>
          </section>

          <section className="evoice__panel">
            <h2>Playlist</h2>
            {audios.length === 0 ? (
              <p className="evoice__empty">No audios yet. Generate from docs.</p>
            ) : (
              <>
                <ol className="evoice__playlist">
                  {audios.map((a, i) => (
                    <li key={a.key}>
                      <button
                        type="button"
                        className={
                          i === trackIndex
                            ? "evoice__track evoice__track--active"
                            : "evoice__track"
                        }
                        onClick={() => setTrackIndex(i)}
                      >
                        {a.name}
                      </button>
                    </li>
                  ))}
                </ol>
                <audio
                  ref={audioRef}
                  className="evoice__audio"
                  src={blobUrl || undefined}
                  controls
                  onEnded={next}
                />
                <div className="evoice__player-actions">
                  <button type="button" className="btn" onClick={play}>
                    Play
                  </button>
                  <button type="button" className="btn" onClick={pause}>
                    Pause
                  </button>
                  <button type="button" className="btn" onClick={stop}>
                    Stop
                  </button>
                  <button type="button" className="btn" onClick={next}>
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
