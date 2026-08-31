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
  resumeEvoiceJob,
  startEvoiceGenerate,
  stopEvoiceJob,
  uploadEvoiceDoc,
  type EvoiceJobFile,
  type EvoiceJobStep,
  type EvoiceObjectMeta,
} from "../../lib/evoice";
import { getAuthToken } from "../../lib/auth";
import { openServerErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "./Evoice.css";

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Chapter audio for a source doc: `libro.c01-intro.mp3`. */
function isChapterAudio(audioName: string, docStem: string): boolean {
  return (
    audioName.toLowerCase().endsWith(".mp3") &&
    audioName.startsWith(`${docStem}.c`)
  );
}

function audiosForDoc(
  docName: string,
  audios: EvoiceObjectMeta[],
): EvoiceObjectMeta[] {
  const stem = stemOf(docName);
  return audios.filter(
    (a) => a.name === `${stem}.mp3` || isChapterAudio(a.name, stem),
  );
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
      const related = audiosForDoc(d.name, audios);
      if (related.length === 0) return true;
      if (!d.lastModified) return false;
      const newest = related.reduce((acc, a) => {
        if (!a.lastModified) return acc;
        return a.lastModified > acc ? a.lastModified : acc;
      }, "");
      if (!newest) return false;
      return d.lastModified > newest;
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
  const [premium, setPremium] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [steps, setSteps] = useState<EvoiceJobStep[]>([]);
  const [fileProgress, setFileProgress] = useState<EvoiceJobFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");
  const [jobStopped, setJobStopped] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");
  const stopRequestedRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  function showError(title: string, details: unknown) {
    openServerErrorModal({
      title,
      summary: "Something went wrong in eVoice. Copy the block below if you need to report it.",
      details,
    });
  }

  const reloadProjects = useCallback(async (owner: string) => {
    const res = await fetchEvoiceProjects(owner);
    if (res.error) {
      showError("eVoice projects", res.error);
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
    if (d.error) showError("eVoice docs", d.error);
    if (a.error) showError("eVoice audios", a.error);
    setDocs(d.docs);
    setAudios(a.audios);
    setTrackIndex(0);
    setSelectedDocs((prev) => {
      const names = new Set(
        d.docs.filter((x) => isSourceDoc(x.name)).map((x) => x.name),
      );
      return prev.filter((n) => names.has(n));
    });
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
        showError("eVoice me", me.error);
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
    // Clear immediately so a previous owner's playlist key cannot fire a fetch.
    setDocs([]);
    setAudios([]);
    setSelectedDocs([]);
    setTrackIndex(0);
    setBlobUrl("");
    setLogs([]);
    setSteps([]);
    setFileProgress([]);
    setProgress(0);
    setActiveJobId("");
    setJobStopped(false);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
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
      // Guard: skip tracks whose key belongs to another owner/project.
      if (
        track.key &&
        !track.key.startsWith(`evoice/${ownerSafe}/${project}/audios/`)
      ) {
        return;
      }
      try {
        const url = await fetchEvoiceAudioBlobUrl(
          ownerSafe,
          project,
          track.name,
          track.key,
        );
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        showError("Audio fetch", e instanceof Error ? e.message : "Could not load audio");
        // Drop ghost playlist entries that S3 no longer has.
        void reloadDocsAudios(ownerSafe, project);
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
  ): Promise<"done" | "failed" | "stopped"> {
    let activeId = jobId;
    let resumes = 0;
    for (;;) {
      if (stopRequestedRef.current) {
        return "stopped";
      }
      await sleep(600);
      let jobRes: Awaited<ReturnType<typeof fetchEvoiceJob>>;
      try {
        jobRes = await fetchEvoiceJob(activeId);
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
        setActiveJobId(jobRes.job.id);
        if (jobRes.job.state === "stopped") {
          setJobStopped(true);
          return "stopped";
        }
        if (jobRes.job.state === "done" || jobRes.job.state === "failed") {
          if (jobRes.job.state === "failed") {
            showError("Generate failed", jobRes.job.error || "Generate failed");
            return "failed";
          }
          if (jobRes.job.error) {
            showError("Generate", jobRes.job.error);
          }
          setProgress(100);
          setJobStopped(false);
          return "done";
        }
        continue;
      }

      // Job missing (404) or unreachable — wait for health, then auto-resume unfinished files.
      if (stopRequestedRef.current) {
        return "stopped";
      }
      const status = jobRes.status ?? 0;
      setLogs((prev) => [
        ...prev.slice(-400),
        status === 404
          ? "job lost after restart — waiting to resume…"
          : `job poll failed (${status || "network"}) — waiting to resume…`,
      ]);
      if (!(await waitUntilHealthy())) {
        showError("Backend unavailable", "Could not resume generate");
        return "failed";
      }
      if (stopRequestedRef.current) {
        return "stopped";
      }
      const fresh = await reloadDocsAudios(owner, proj);
      const unfinished = docsNeedingAudio(fresh.docs, fresh.audios, onlyFiles);
      if (unfinished.length === 0) {
        setLogs((prev) => [...prev, "resume: all requested audios already present"]);
        setProgress(100);
        setJobStopped(false);
        return "done";
      }
      if (resumes >= 8) {
        showError("Auto-resume limit", "Too many auto-resumes; retry Generate manually");
        return "failed";
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
        showError("Resume generate", started.error || "Could not resume generate");
        return "failed";
      }
      activeId = started.jobId;
      setActiveJobId(activeId);
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
    const res = await createEvoiceProject(name, isAdmin ? ownerSafe : undefined);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
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
    const res = await uploadEvoiceDoc(ownerSafe, project, file);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onPasteText(e: FormEvent) {
    e.preventDefault();
    const text = pasteText.trim();
    if (!text || !ownerSafe || !project || busy) return;
    setBusy(true);
    const res = await pasteEvoiceDocText(ownerSafe, project, text);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    setPasteText("");
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteDoc(name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete document ${name}?`)) return;
    setBusy(true);
    const res = await deleteEvoiceDoc(ownerSafe, project, name);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    setFileProgress((prev) => prev.filter((f) => f.name !== name));
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteAudio(mp3Name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete audio ${mp3Name}?`)) return;
    setBusy(true);
    const res = await deleteEvoiceAudio(ownerSafe, project, mp3Name);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    const stem = stemOf(mp3Name);
    setFileProgress((prev) => prev.filter((f) => stemOf(f.name) !== stem));
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onGenerate(files?: string[]) {
    if (!ownerSafe || !project || busy) return;
    // Undefined → all docs; explicit array → only those (Generate selected / per-row).
    const targets = files && files.length > 0 ? files : undefined;
    setBusy(true);
    setJobStopped(false);
    stopRequestedRef.current = false;
    setLogs(["starting…"]);
    setSteps([]);
    setFileProgress(
      targets?.length
        ? targets.map((name) => ({ name, state: "pending", progress: 0 }))
        : [],
    );
    setProgress(0);
    const usePremium = premium;
    const started = await startEvoiceGenerate(
      ownerSafe,
      project,
      targets,
      usePremium,
    );
    if (started.error || !started.jobId) {
      setBusy(false);
      showError("Generate", started.error || "Could not start generate");
      return;
    }
    setActiveJobId(started.jobId);
    const outcome = await pollUntilDone(
      started.jobId,
      ownerSafe,
      project,
      targets,
      usePremium,
    );
    setBusy(false);
    if (outcome === "stopped") {
      setJobStopped(true);
    }
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onStopGenerate() {
    if (!activeJobId) return;
    stopRequestedRef.current = true;
    setLogs((prev) => [...prev, "stop: requesting cancel…"]);
    const res = await stopEvoiceJob(activeJobId);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    if (res.job) {
      setLogs(res.job.logs ?? []);
      setSteps(res.job.steps ?? []);
      setFileProgress(res.job.files ?? []);
      setProgress(
        typeof res.job.progress === "number" ? res.job.progress : progress,
      );
    }
    setJobStopped(true);
  }

  async function onResumeGenerate() {
    if (!ownerSafe || !project || busy || !activeJobId) return;
    setBusy(true);
    setJobStopped(false);
    stopRequestedRef.current = false;
    setLogs((prev) => [...prev, "resume: continuing unfinished files…"]);
    const resumed = await resumeEvoiceJob(activeJobId);
    if (resumed.error || !resumed.jobId) {
      setBusy(false);
      showError("Resume", resumed.error || "Could not resume");
      setJobStopped(true);
      return;
    }
    setActiveJobId(resumed.jobId);
    const files = resumed.files;
    if (files?.length) {
      setFileProgress(
        files.map((name) => ({ name, state: "pending", progress: 0 })),
      );
    }
    const usePremium = resumed.premium ?? premium;
    const outcome = await pollUntilDone(
      resumed.jobId,
      ownerSafe,
      project,
      files,
      usePremium,
    );
    setBusy(false);
    if (outcome === "stopped") {
      setJobStopped(true);
    }
    await reloadDocsAudios(ownerSafe, project);
  }

  function progressForDoc(name: string): EvoiceJobFile | undefined {
    const live = fileProgress.find((f) => f.name === name);
    if (live) return live;
    const related = audiosForDoc(name, audios);
    if (related.length > 0) {
      const chapters = related.filter((a) => a.name.includes(".c")).length;
      const detail =
        chapters > 0
          ? `${chapters} chapter audio(s)`
          : "audio present";
      return { name, state: "ready", progress: 100, detail };
    }
    return undefined;
  }

  function play() {
    void audioRef.current?.play();
  }
  function pause() {
    audioRef.current?.pause();
  }
  function stopPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }
  function next() {
    if (trackIndex < audios.length - 1) setTrackIndex((i) => i + 1);
  }

  async function onDownload(name: string, key?: string) {
    if (!ownerSafe || !project || busy) return;
    try {
      await downloadEvoiceAudio(ownerSafe, project, name, key);
    } catch (e) {
      showError("Download", e instanceof Error ? e.message : "Download failed");
    }
  }

  function toggleDocSelected(name: string) {
    setSelectedDocs((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function toggleSelectAllDocs() {
    const names = sourceDocs.map((d) => d.name);
    setSelectedDocs((prev) =>
      prev.length === names.length ? [] : names,
    );
  }

  const sourceDocs = docs.filter((d) => isSourceDoc(d.name));

  return (
    <div className="evoice">
      {isAdmin ? (
        <label className="evoice__field evoice__admin">
          <span>Admin only</span>
          <select
            className="evoice__select"
            value={ownerSafe}
            onChange={(e) => {
              const nextOwner = e.target.value;
              setOwnerSafe(nextOwner);
              setProject("");
              setDocs([]);
              setAudios([]);
              setSelectedDocs([]);
              setTrackIndex(0);
              setBlobUrl("");
              if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = "";
              }
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
        <label className="evoice__field evoice__field--twin">
          <span>Project</span>
          <select
            className="evoice__select"
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
          <label className="evoice__field evoice__field--twin">
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
          <section
            className={
              showPaste
                ? "evoice__panel evoice__panel--uploads"
                : "evoice__panel evoice__panel--uploads evoice__panel--compact"
            }
          >
            <div className="evoice__panel-head">
              <h2>File Uploads</h2>
              <label className="btn evoice__upload">
                Upload
                <input type="file" hidden onChange={onUpload} disabled={busy} />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => setShowPaste((v) => !v)}
                disabled={busy}
              >
                {showPaste ? "Hide text" : "+ Text"}
              </button>
              <label className="evoice__premium evoice__premium--toggle">
                <input
                  type="checkbox"
                  checked={premium}
                  onChange={(e) => setPremium(e.target.checked)}
                  disabled={busy}
                />
                <span className="evoice__toggle-ui" aria-hidden="true" />
                <span>Premium</span>
              </label>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void onGenerate()}
                disabled={busy}
              >
                Generate all
              </button>
              {busy ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void onStopGenerate()}
                  disabled={!activeJobId}
                >
                  Stop generate
                </button>
              ) : null}
              {!busy && jobStopped && activeJobId ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void onResumeGenerate()}
                >
                  Resume
                </button>
              ) : null}
            </div>

            {showPaste ? (
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
            ) : null}
          </section>

          <div className="evoice__workspace evoice__workspace--docs-playlist">
            <section className="evoice__panel evoice__panel--docs">
              <div className="evoice__panel-head">
                <h2>Docs</h2>
                {sourceDocs.length > 0 ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={toggleSelectAllDocs}
                    disabled={busy}
                  >
                    {selectedDocs.length === sourceDocs.length
                      ? "Clear selection"
                      : "Select all"}
                  </button>
                ) : null}
              </div>
              <p className="evoice__hint">
                Select docs to generate or regenerate.
              </p>

              {sourceDocs.length === 0 ? (
                <p className="evoice__empty">
                  No documents yet. Upload a file or add text above.
                </p>
              ) : (
                <ul className="evoice__list">
                  {sourceDocs.map((d) => {
                    const fp = progressForDoc(d.name);
                    const pct = fp ? Math.max(0, Math.min(100, fp.progress)) : 0;
                    const related = audiosForDoc(d.name, audios);
                    const hasAudio = related.length > 0;
                    const checked = selectedDocs.includes(d.name);
                    const genLabel = hasAudio ? "Regenerate" : "Generate";
                    return (
                      <li key={d.key} className="evoice__doc-row">
                        <label className="evoice__doc-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDocSelected(d.name)}
                            disabled={busy}
                            aria-label={`Select ${d.name}`}
                          />
                        </label>
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
                          className="evoice__icon-btn evoice__icon-btn--accent"
                          onClick={() => void onGenerate([d.name])}
                          disabled={busy}
                          title={`${genLabel} ${d.name}`}
                          aria-label={`${genLabel} ${d.name}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            refresh
                          </span>
                        </button>
                        <button
                          type="button"
                          className="evoice__icon-btn evoice__icon-btn--danger"
                          onClick={() => void onDeleteDoc(d.name)}
                          disabled={busy}
                          title={`Delete document ${d.name}`}
                          aria-label={`Delete document ${d.name}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            delete
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="evoice__panel-foot">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void onGenerate(selectedDocs)}
                  disabled={busy || selectedDocs.length === 0}
                >
                  {selectedDocs.length > 0
                    ? `Generate selected (${selectedDocs.length})`
                    : "Generate selected"}
                </button>
              </div>
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
                          onClick={() => void onDownload(a.name, a.key)}
                          disabled={busy}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="evoice__icon-btn evoice__icon-btn--danger"
                          onClick={() => void onDeleteAudio(a.name)}
                          disabled={busy}
                          title={`Delete audio ${a.name}`}
                          aria-label={`Delete audio ${a.name}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden="true"
                          >
                            delete
                          </span>
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
                </>
              )}
              <div
                className="evoice__panel-foot evoice__player-actions"
                aria-label="Playlist controls"
              >
                <button
                  type="button"
                  className="evoice__icon-btn"
                  onClick={play}
                  disabled={audios.length === 0}
                  title="Play playlist"
                  aria-label="Play playlist"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    play_arrow
                  </span>
                </button>
                <button
                  type="button"
                  className="evoice__icon-btn"
                  onClick={pause}
                  disabled={audios.length === 0}
                  title="Pause playlist"
                  aria-label="Pause playlist"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    pause
                  </span>
                </button>
                <button
                  type="button"
                  className="evoice__icon-btn"
                  onClick={stopPlayback}
                  disabled={audios.length === 0}
                  title="Stop playlist"
                  aria-label="Stop playlist"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    stop
                  </span>
                </button>
                <button
                  type="button"
                  className="evoice__icon-btn"
                  onClick={next}
                  disabled={audios.length === 0}
                  title="Next track"
                  aria-label="Next track"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    skip_next
                  </span>
                </button>
                <button
                  type="button"
                  className="evoice__icon-btn evoice__icon-btn--accent"
                  onClick={() => {
                    const track = audios[trackIndex];
                    if (track) void onDownload(track.name, track.key);
                  }}
                  disabled={busy || !audios[trackIndex]}
                  title="Download current track"
                  aria-label="Download current track"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    download
                  </span>
                </button>
              </div>
            </section>
          </div>

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
        </>
      ) : null}
    </div>
  );
}
