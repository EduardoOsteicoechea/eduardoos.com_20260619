/**
 * eVoice hub — projects, docs upload/paste, generate jobs, playlist (spec 044).
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
  deleteEvoiceAudio,
  deleteEvoiceDoc,
  downloadEvoiceAudio,
  fetchBackendHealth,
  fetchEvoiceAudioBlobUrl,
  fetchEvoiceAudios,
  fetchEvoiceDocs,
  fetchEvoiceJob,
  fetchEvoiceMe,
  fetchEvoiceProjects,
  fetchEvoiceUsers,
  pasteEvoiceDocText,
  startEvoiceGenerate,
  uploadEvoiceDoc,
  type EvoiceJobFile,
  type EvoiceJobStep,
  type EvoiceObjectMeta,
} from "../../lib/evoice";
import { getAuthToken } from "../../lib/auth";
import "./Evoice.css";

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function audioNameForDoc(docName: string): string {
  return `${stemOf(docName)}.mp3`;
}

function isSourceDoc(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".premium.txt")) return false;
  return /\.(docx|txt|pdf|png|jpe?g|webp|tiff?|bmp|gif)$/i.test(name);
}

function docsNeedingAudio(
  docs: EvoiceObjectMeta[],
  audios: EvoiceObjectMeta[],
  onlyFiles?: string[],
): string[] {
  const allow = onlyFiles?.length ? new Set(onlyFiles) : null;
  return docs
    .filter((d) => isSourceDoc(d.name))
    .filter((d) => (allow ? allow.has(d.name) : true))
    .filter((d) => {
      const mp3 = audioNameForDoc(d.name);
      const audio = audios.find((a) => a.name === mp3);
      if (!audio) return true;
      if (d.lastModified && audio.lastModified) {
        return d.lastModified > audio.lastModified;
      }
      return false;
    })
    .map((d) => d.name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function EvoicePage() {
  return (
    <ServiceGate serviceId="evoice" serviceLabel="eVoice">
      <EvoiceWorkspace />
    </ServiceGate>
  );
}

function EvoiceWorkspace() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [ownerSafe, setOwnerSafe] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [newProject, setNewProject] = useState("");
  const [docs, setDocs] = useState<EvoiceObjectMeta[]>([]);
  const [audios, setAudios] = useState<EvoiceObjectMeta[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [premium, setPremium] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [steps, setSteps] = useState<EvoiceJobStep[]>([]);
  const [fileProgress, setFileProgress] = useState<EvoiceJobFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");
  const projectRef = useRef(project);
  projectRef.current = project;

  const reloadProjects = useCallback(async (owner: string) => {
    const res = await fetchEvoiceProjects(owner);
    if (res.error) {
      setError(res.error);
      setProjects([]);
      return;
    }
    setProjects(res.projects);
    if (res.projects.length === 0) {
      setProject("");
      return;
    }
    if (!res.projects.includes(projectRef.current)) {
      setProject(res.projects[0] ?? "");
    }
  }, []);

  const reloadDocsAudios = useCallback(async (owner: string, proj: string) => {
    if (!owner || !proj) {
      setDocs([]);
      setAudios([]);
      return { docs: [] as EvoiceObjectMeta[], audios: [] as EvoiceObjectMeta[] };
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
    return { docs: d.docs, audios: a.audios };
  }, []);

  // One-shot init — must NOT re-run when project/reloadProjects identity changes
  // (that was snapping admin owner back to the signed-in admin).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchEvoiceMe();
      if (cancelled) return;
      if (me.error) {
        setError(me.error);
        return;
      }
      setIsAdmin(me.isAdmin);
      setOwnerSafe(me.userSafe);
      if (me.isAdmin) {
        const u = await fetchEvoiceUsers();
        if (!cancelled && !u.error) {
          setUsers(u.users.length ? u.users : [me.userSafe]);
        }
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

  async function waitUntilHealthy(): Promise<boolean> {
    for (let i = 0; i < 45; i++) {
      if (await fetchBackendHealth()) return true;
      setLogs((prev) => {
        const msg = `waiting for backend health… (${i + 1})`;
        if (prev[prev.length - 1] === msg) return prev;
        return [...prev.slice(-400), msg];
      });
      await sleep(2000);
    }
    return false;
  }

  async function pollUntilDone(
    jobId: string,
    owner: string,
    proj: string,
    onlyFiles: string[] | undefined,
    usePremium: boolean,
  ): Promise<void> {
    let activeJobId = jobId;
    let resumes = 0;
    for (;;) {
      await sleep(600);
      let jobRes: Awaited<ReturnType<typeof fetchEvoiceJob>>;
      try {
        jobRes = await fetchEvoiceJob(activeJobId);
      } catch {
        jobRes = { job: null, error: "network error", status: 0 };
      }
      if (jobRes.job) {
        setLogs(jobRes.job.logs ?? []);
        setSteps(jobRes.job.steps ?? []);
        setFileProgress(jobRes.job.files ?? []);
        setProgress(
          typeof jobRes.job.progress === "number" ? jobRes.job.progress : 0,
        );
        if (jobRes.job.state === "done" || jobRes.job.state === "failed") {
          if (jobRes.job.state === "failed") {
            setError(jobRes.job.error || "Generate failed");
          } else if (jobRes.job.error) {
            setError(jobRes.job.error);
          }
          if (jobRes.job.state === "done") setProgress(100);
          return;
        }
        continue;
      }

      // Job missing (404) or unreachable — wait for health, then auto-resume unfinished files.
      const status = jobRes.status ?? 0;
      setLogs((prev) => [
        ...prev.slice(-400),
        status === 404
          ? "job lost after restart — waiting to resume…"
          : `job poll failed (${status || "network"}) — waiting to resume…`,
      ]);
      if (!(await waitUntilHealthy())) {
        setError("Backend unavailable; could not resume generate");
        return;
      }
      const fresh = await reloadDocsAudios(owner, proj);
      const unfinished = docsNeedingAudio(fresh.docs, fresh.audios, onlyFiles);
      if (unfinished.length === 0) {
        setLogs((prev) => [...prev, "resume: all requested audios already present"]);
        setProgress(100);
        return;
      }
      if (resumes >= 8) {
        setError("Too many auto-resumes; stop and retry Generate manually");
        return;
      }
      resumes += 1;
      setLogs((prev) => [
        ...prev,
        `resume #${resumes}: generating ${unfinished.length} file(s)${usePremium ? " (premium)" : ""}`,
      ]);
      const started = await startEvoiceGenerate(
        owner,
        proj,
        unfinished,
        usePremium,
      );
      if (started.error || !started.jobId) {
        setError(started.error || "Could not resume generate");
        return;
      }
      activeJobId = started.jobId;
      setFileProgress(
        unfinished.map((name) => ({ name, state: "pending", progress: 0 })),
      );
    }
  }

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

  async function onPasteText(e: FormEvent) {
    e.preventDefault();
    const text = pasteText.trim();
    if (!text || !ownerSafe || !project || busy) return;
    setBusy(true);
    setError("");
    const res = await pasteEvoiceDocText(ownerSafe, project, text);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPasteText("");
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteDoc(name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete document ${name}?`)) return;
    setBusy(true);
    setError("");
    const res = await deleteEvoiceDoc(ownerSafe, project, name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFileProgress((prev) => prev.filter((f) => f.name !== name));
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteAudio(mp3Name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete audio ${mp3Name}?`)) return;
    setBusy(true);
    setError("");
    const res = await deleteEvoiceAudio(ownerSafe, project, mp3Name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const stem = stemOf(mp3Name);
    setFileProgress((prev) => prev.filter((f) => stemOf(f.name) !== stem));
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onGenerate(files?: string[]) {
    if (!ownerSafe || !project || busy) return;
    setBusy(true);
    setError("");
    setLogs(["starting…"]);
    setSteps([]);
    setFileProgress(
      files?.length
        ? files.map((name) => ({ name, state: "pending", progress: 0 }))
        : [],
    );
    setProgress(0);
    const usePremium = premium;
    const started = await startEvoiceGenerate(
      ownerSafe,
      project,
      files,
      usePremium,
    );
    if (started.error || !started.jobId) {
      setBusy(false);
      setError(started.error || "Could not start generate");
      return;
    }
    await pollUntilDone(started.jobId, ownerSafe, project, files, usePremium);
    setBusy(false);
    await reloadDocsAudios(ownerSafe, project);
  }

  function progressForDoc(name: string): EvoiceJobFile | undefined {
    const live = fileProgress.find((f) => f.name === name);
    if (live) return live;
    const mp3 = audioNameForDoc(name);
    if (audios.some((a) => a.name === mp3)) {
      return { name, state: "ready", progress: 100, detail: "audio present" };
    }
    return undefined;
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

  async function onDownload(name: string) {
    if (!ownerSafe || !project || busy) return;
    setError("");
    try {
      await downloadEvoiceAudio(ownerSafe, project, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  const sourceDocs = docs.filter((d) => isSourceDoc(d.name));

  return (
    <div className="evoice">
      <header className="evoice__head">
        <p className="evoice__eyebrow">Eduardo OS</p>
        <h1 className="evoice__title">eVoice</h1>
        <p className="evoice__lead">
          Documents to MP3. One audio per source; regenerate when missing or
          outdated.
        </p>
      </header>

      {error ? <p className="evoice__error">{error}</p> : null}

      {isAdmin ? (
        <label className="evoice__field">
          <span>Admin only</span>
          <select
            className="evoice__select"
            value={ownerSafe}
            onChange={(e) => {
              const nextOwner = e.target.value;
              setOwnerSafe(nextOwner);
              setProject("");
              void reloadProjects(nextOwner);
            }}
          >
            {(users.length ? users : [ownerSafe]).map((u) => (
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
              <label className="evoice__premium">
                <input
                  type="checkbox"
                  checked={premium}
                  onChange={(e) => setPremium(e.target.checked)}
                  disabled={busy}
                />
                <span>Premium (DeepSeek speech)</span>
              </label>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void onGenerate()}
                disabled={busy}
              >
                Generate all
              </button>
            </div>

            <form className="evoice__paste" onSubmit={onPasteText}>
              <label className="evoice__field evoice__field--grow">
                <span>Paste text</span>
                <textarea
                  className="evoice__textarea"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="Paste source text here…"
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                className="btn"
                disabled={busy || !pasteText.trim()}
              >
                Add text
              </button>
            </form>

            {sourceDocs.length === 0 ? (
              <p className="evoice__empty">
                No documents yet. Upload .txt, .docx, .pdf, images, or paste
                text.
              </p>
            ) : (
              <ul className="evoice__list">
                {sourceDocs.map((d) => {
                  const fp = progressForDoc(d.name);
                  const pct = fp ? Math.max(0, Math.min(100, fp.progress)) : 0;
                  const mp3 = audioNameForDoc(d.name);
                  const hasAudio = audios.some((a) => a.name === mp3);
                  return (
                    <li key={d.key} className="evoice__doc-row">
                      <div className="evoice__doc-main">
                        <span className="evoice__doc-name">{d.name}</span>
                        <div
                          className="evoice__doc-progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={pct}
                          aria-label={`Progress for ${d.name}`}
                        >
                          <div
                            className={`evoice__doc-progress-bar evoice__doc-progress-bar--${fp?.state || "idle"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {fp ? (
                          <span className="evoice__doc-status">
                            {fp.state}
                            {fp.detail ? ` — ${fp.detail}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void onGenerate([d.name])}
                        disabled={busy}
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void onDeleteDoc(d.name)}
                        disabled={busy}
                      >
                        Delete doc
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void onDeleteAudio(mp3)}
                        disabled={busy || !hasAudio}
                        title={hasAudio ? `Delete ${mp3}` : "No audio yet"}
                      >
                        Delete audio
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="evoice__workspace">
            <section className="evoice__panel evoice__panel--console">
              <h2>Console</h2>
              <div
                className="evoice__progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Generate progress"
              >
                <div
                  className="evoice__progress-bar"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
              <p className="evoice__progress-label">{progress}%</p>
              {steps.length > 0 ? (
                <ol className="evoice__steps">
                  {steps.map((s) => (
                    <li
                      key={s.id}
                      className={`evoice__step evoice__step--${s.state || "pending"}`}
                    >
                      <span className="evoice__step-state">{s.state}</span>
                      <span className="evoice__step-label">{s.label}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
              <h3 className="evoice__log-title">Log</h3>
              <pre className="evoice__log">{logs.join("\n") || "—"}</pre>
            </section>

            <section className="evoice__panel evoice__panel--playlist">
              <h2>Playlist</h2>
              {audios.length === 0 ? (
                <p className="evoice__empty">No audios yet. Generate from docs.</p>
              ) : (
                <>
                  <ol className="evoice__playlist">
                    {audios.map((a, i) => (
                      <li key={a.key} className="evoice__playlist-item">
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
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void onDownload(a.name)}
                          disabled={busy}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void onDeleteAudio(a.name)}
                          disabled={busy}
                        >
                          Delete
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
                    {audios[trackIndex] ? (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void onDownload(audios[trackIndex].name)}
                        disabled={busy}
                      >
                        Download
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
