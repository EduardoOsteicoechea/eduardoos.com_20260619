/**
 * eVoice hub — single-page collapsible workspace (spec 069).
 * Upload · Documents (+ console) · Playlists with versioned audio.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import ServiceGate from "../ServiceGate/ServiceGate";
import {
  createEvoiceProject,
  deleteEvoiceAudio,
  deleteEvoiceDoc,
  fetchBackendHealth,
  fetchEvoiceAudioBlobUrl,
  fetchEvoiceAudios,
  fetchEvoiceDocText,
  fetchEvoiceDocs,
  fetchEvoiceJob,
  fetchEvoiceMe,
  fetchEvoiceProjects,
  fetchEvoiceUsers,
  pasteEvoiceDocText,
  crawlEvoiceDocURL,
  resumeEvoiceJob,
  startEvoiceGenerate,
  stopEvoiceJob,
  uploadEvoiceDoc,
  type EvoiceGenerateMode,
  type EvoiceJobFile,
  type EvoiceJobStep,
  type EvoiceObjectMeta,
} from "../../lib/evoice";
import { getAuthToken } from "../../lib/auth";
import { openServerErrorModal } from "../ServerErrorModal/ServerErrorModal";
import { useHeaderDynamicHost } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";
import "./Evoice.css";

/** Left → right: 5% … 100% (full content = slider right). */
const CONTENT_PERCENTS = [5, 10, 25, 50, 75, 100] as const;
const QUALITY_MODES: { id: EvoiceGenerateMode; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "premium", label: "Premium" },
  { id: "super_premium", label: "Super Premium" },
];

type UploadModality = "file" | "paste" | "crawl" | null;

const SUPER_PREMIUM_EXT = /\.(pdf|png|jpe?g|webp|tiff?|bmp|gif|docx)$/i;

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function trackId(a: EvoiceObjectMeta): string {
  return a.key || a.name;
}

/** Doc stem parsed from an audio filename (versioned or legacy). */
function audioDocStem(audioName: string): string {
  const base = audioName.replace(/\.mp3$/i, "");
  const vMatch = base.match(/^(.+?)\.v\d+(?:\.|$)/i);
  if (vMatch) return vMatch[1];
  const cMatch = base.match(/^(.+?)\.c\d+/i);
  if (cMatch) return cMatch[1];
  return stemOf(audioName);
}

/** Version number or "legacy" for pre-version MP3s. */
function audioVersion(audioName: string): number | "legacy" {
  const m =
    audioName.match(/\.v(\d+)\./i) || audioName.match(/\.v(\d+)\.mp3$/i);
  return m ? parseInt(m[1], 10) : "legacy";
}

function isSourceDoc(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".premium.txt") || lower.endsWith(".vision.txt")) {
    return false;
  }
  return /\.(docx|txt|pdf|png|jpe?g|webp|tiff?|bmp|gif)$/i.test(name);
}

function audiosForDocStem(
  docStem: string,
  audios: EvoiceObjectMeta[],
): EvoiceObjectMeta[] {
  return audios.filter((a) => audioDocStem(a.name) === docStem);
}

function sortTracks(tracks: EvoiceObjectMeta[]): EvoiceObjectMeta[] {
  return [...tracks].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

type VersionBucket = {
  version: number | "legacy";
  label: string;
  tracks: EvoiceObjectMeta[];
};

type DocPlaylist = {
  stem: string;
  sourceDoc?: EvoiceObjectMeta;
  buckets: VersionBucket[];
  allTracks: EvoiceObjectMeta[];
};

function buildDocPlaylists(
  docs: EvoiceObjectMeta[],
  audios: EvoiceObjectMeta[],
): DocPlaylist[] {
  const stems = new Set<string>();
  for (const d of docs.filter((x) => isSourceDoc(x.name))) {
    stems.add(stemOf(d.name));
  }
  for (const a of audios) {
    stems.add(audioDocStem(a.name));
  }

  const sourceByStem = new Map<string, EvoiceObjectMeta>();
  for (const d of docs.filter((x) => isSourceDoc(x.name))) {
    sourceByStem.set(stemOf(d.name), d);
  }

  return [...stems]
    .sort((a, b) => a.localeCompare(b))
    .map((stem) => {
      const related = audiosForDocStem(stem, audios);
      const byVersion = new Map<number | "legacy", EvoiceObjectMeta[]>();
      for (const a of related) {
        const v = audioVersion(a.name);
        const list = byVersion.get(v) ?? [];
        list.push(a);
        byVersion.set(v, list);
      }

      const numericVersions = [...byVersion.keys()]
        .filter((v): v is number => v !== "legacy")
        .sort((a, b) => a - b);

      const buckets: VersionBucket[] = numericVersions.map((v) => ({
        version: v,
        label: `Version v${v}`,
        tracks: sortTracks(byVersion.get(v) ?? []),
      }));

      const legacy = byVersion.get("legacy");
      if (legacy?.length) {
        buckets.push({
          version: "legacy",
          label: "Legacy",
          tracks: sortTracks(legacy),
        });
      }

      const allTracks: EvoiceObjectMeta[] = [];
      for (const b of buckets) {
        allTracks.push(...b.tracks);
      }

      return {
        stem,
        sourceDoc: sourceByStem.get(stem),
        buckets,
        allTracks,
      };
    })
    .filter((p) => p.buckets.length > 0 || p.sourceDoc);
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
      const related = audiosForDocStem(stemOf(d.name), audios);
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

function findLatestPremiumTxt(
  docStem: string,
  docs: EvoiceObjectMeta[],
): EvoiceObjectMeta | null {
  let best: EvoiceObjectMeta | null = null;
  let bestN = -1;
  const prefix = `${docStem}.v`;
  for (const d of docs) {
    const lower = d.name.toLowerCase();
    if (!lower.endsWith(".premium.txt")) continue;
    if (!d.name.startsWith(prefix)) continue;
    const rest = d.name.slice(prefix.length);
    const m = rest.match(/^(\d+)\.premium\.txt$/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > bestN) {
      bestN = n;
      best = d;
    }
  }
  return best;
}

function filterSuperPremiumTargets(files: string[]): {
  ok: string[];
  rejected: string[];
} {
  const ok: string[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (SUPER_PREMIUM_EXT.test(f)) ok.push(f);
    else rejected.push(f);
  }
  return { ok, rejected };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function CollapsibleSection({
  id,
  title,
  open,
  onToggle,
  children,
  className,
  headerActions,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [needsMore, setNeedsMore] = useState(false);
  const clipRef = useRef<HTMLDivElement | null>(null);

  const sectionBodyMaxPx = useCallback(() => {
    const raw =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--evoice-section-body-max")
        .trim() || "600px";
    if (raw.endsWith("vh")) {
      return (parseFloat(raw) / 100) * window.innerHeight;
    }
    if (raw.endsWith("rem")) {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return parseFloat(raw) * root;
    }
    if (raw.endsWith("px")) return parseFloat(raw);
    return 600;
  }, []);

  const measureOverflow = useCallback(() => {
    const el = clipRef.current;
    if (!el || !open) {
      setNeedsMore(false);
      return;
    }
    const full = el.scrollHeight;
    const maxPx = sectionBodyMaxPx();
    setNeedsMore(full > maxPx + 2);
  }, [open, sectionBodyMaxPx]);

  useEffect(() => {
    if (!open) {
      setBodyExpanded(false);
      setNeedsMore(false);
      return;
    }
    const el = clipRef.current;
    if (!el) return;
    const run = () => {
      requestAnimationFrame(measureOverflow);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    for (const child of Array.from(el.children)) {
      ro.observe(child);
    }
    window.addEventListener("resize", run);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [open, children, measureOverflow]);

  return (
    <section
      className={`evoice__section${className ? ` ${className}` : ""}${open ? " evoice__section--open" : " evoice__section--closed"}${bodyExpanded ? " evoice__section--body-expanded" : ""}`}
    >
      <div className="evoice__section-head-row">
        <button
          type="button"
          className="evoice__section-head"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          <span
            className="material-symbols-outlined evoice__chevron"
            aria-hidden="true"
          >
            expand_more
          </span>
          <h2>{title}</h2>
        </button>
        {headerActions ? (
          <div className="evoice__section-head-actions" onClick={(e) => e.stopPropagation()}>
            {headerActions}
          </div>
        ) : null}
      </div>
      {open ? (
        <div id={`${id}-body`} className="evoice__section-body">
          <div
            ref={clipRef}
            className={
              bodyExpanded
                ? "evoice__section-clip evoice__section-clip--expanded"
                : "evoice__section-clip"
            }
          >
            {children}
          </div>
          {needsMore ? (
            <div className="evoice__section-more">
              <button
                type="button"
                className="btn evoice__section-more-btn"
                onClick={() => setBodyExpanded((v) => !v)}
              >
                {bodyExpanded ? "Show less" : "Show more"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TransportBar({
  label,
  disabled,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  label: string;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="evoice__transport" aria-label={label}>
      <button
        type="button"
        className="evoice__icon-btn"
        onClick={onPrev}
        disabled={disabled || !canPrev}
        title="Previous"
        aria-label={`${label} previous`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          skip_previous
        </span>
      </button>
      <button
        type="button"
        className="evoice__icon-btn"
        onClick={onPlay}
        disabled={disabled}
        title="Play"
        aria-label={`${label} play`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          play_arrow
        </span>
      </button>
      <button
        type="button"
        className="evoice__icon-btn"
        onClick={onPause}
        disabled={disabled}
        title="Pause"
        aria-label={`${label} pause`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          pause
        </span>
      </button>
      <button
        type="button"
        className="evoice__icon-btn"
        onClick={onStop}
        disabled={disabled}
        title="Stop"
        aria-label={`${label} stop`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          stop
        </span>
      </button>
      <button
        type="button"
        className="evoice__icon-btn"
        onClick={onNext}
        disabled={disabled || !canNext}
        title="Next"
        aria-label={`${label} next`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          skip_next
        </span>
      </button>
    </div>
  );
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
  const [uploadModality, setUploadModality] = useState<UploadModality>(null);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [generateMode, setGenerateMode] = useState<EvoiceGenerateMode>("premium");
  const [contentPercent, setContentPercent] = useState<number>(100);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [checkedTracks, setCheckedTracks] = useState<Set<string>>(new Set());
  const [projectOpen, setProjectOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);
  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const sectionOpenBeforeCollapse = useRef<{
    project: boolean;
    upload: boolean;
    docs: boolean;
    playlists: boolean;
  } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [steps, setSteps] = useState<EvoiceJobStep[]>([]);
  const [fileProgress, setFileProgress] = useState<EvoiceJobFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");
  const [jobStopped, setJobStopped] = useState(false);
  const [queue, setQueue] = useState<EvoiceObjectMeta[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");
  const autoplayAfterLoadRef = useRef(false);
  const queueLenRef = useRef(0);
  queueLenRef.current = queue.length;
  const stopRequestedRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const hdsHost = useHeaderDynamicHost("evoice-header-menu");

  const sourceDocs = useMemo(
    () => docs.filter((d) => isSourceDoc(d.name)),
    [docs],
  );
  const docPlaylists = useMemo(
    () => buildDocPlaylists(docs, audios),
    [docs, audios],
  );
  const globalTrackOrder = useMemo(() => {
    const all: EvoiceObjectMeta[] = [];
    for (const dp of docPlaylists) {
      all.push(...dp.allTracks);
    }
    return all;
  }, [docPlaylists]);

  function showError(title: string, details: unknown) {
    openServerErrorModal({
      title,
      summary:
        "Something went wrong in eVoice. Copy the block below if you need to report it.",
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
    setQueue([]);
    setSelectedDocs((prev) => {
      const names = new Set(
        d.docs.filter((x) => isSourceDoc(x.name)).map((x) => x.name),
      );
      return prev.filter((n) => names.has(n));
    });
    setCheckedTracks((prev) => {
      const ids = new Set(a.audios.map(trackId));
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
      }
      return next;
    });
    return { docs: d.docs, audios: a.audios };
  }, []);

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
    setDocs([]);
    setAudios([]);
    setSelectedDocs([]);
    setCheckedTracks(new Set());
    setQueue([]);
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
      const track = queue[trackIndex];
      if (!track || !ownerSafe || !project || !getAuthToken()) return;
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
        autoplayAfterLoadRef.current = false;
        showError(
          "Audio fetch",
          e instanceof Error ? e.message : "Could not load audio",
        );
        void reloadDocsAudios(ownerSafe, project);
      }
    })();
    return () => {
      revoked = true;
    };
  }, [queue, trackIndex, ownerSafe, project, reloadDocsAudios]);

  useEffect(() => {
    if (!blobUrl || !autoplayAfterLoadRef.current) return;
    const el = audioRef.current;
    if (!el) return;

    let cancelled = false;
    const tryPlay = () => {
      if (cancelled || !autoplayAfterLoadRef.current) return;
      autoplayAfterLoadRef.current = false;
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
      void el.play().catch(() => {
        /* gesture policy */
      });
    };

    el.addEventListener("canplay", tryPlay, { once: true });
    el.addEventListener("loadeddata", tryPlay, { once: true });
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    }

    return () => {
      cancelled = true;
      el.removeEventListener("canplay", tryPlay);
      el.removeEventListener("loadeddata", tryPlay);
    };
  }, [blobUrl]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  function buildScopeQueue(tracks: EvoiceObjectMeta[]): EvoiceObjectMeta[] {
    const checkedInScope = tracks.filter((t) => checkedTracks.has(trackId(t)));
    if (checkedInScope.length > 0) return checkedInScope;
    return tracks;
  }

  function startPlayback(tracks: EvoiceObjectMeta[]) {
    const effective = buildScopeQueue(tracks);
    if (effective.length === 0) return;
    setQueue(effective);
    setTrackIndex(0);
    autoplayAfterLoadRef.current = true;
  }

  function play() {
    if (queue.length === 0 && globalTrackOrder.length > 0) {
      startPlayback(globalTrackOrder);
      return;
    }
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
    setTrackIndex((i) => {
      if (i >= queueLenRef.current - 1) return i;
      autoplayAfterLoadRef.current = true;
      return i + 1;
    });
  }

  function prev() {
    setTrackIndex((i) => {
      if (i <= 0) return i;
      autoplayAfterLoadRef.current = true;
      return i - 1;
    });
  }

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
    mode: EvoiceGenerateMode,
    pct: number,
  ): Promise<"done" | "failed" | "stopped"> {
    let activeId = jobId;
    let resumes = 0;
    for (;;) {
      if (stopRequestedRef.current) return "stopped";
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

      if (stopRequestedRef.current) return "stopped";
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
      if (stopRequestedRef.current) return "stopped";
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
        `resume #${resumes}: generating ${unfinished.length} file(s) (${mode}, ${pct}%)`,
      ]);
      const started = await startEvoiceGenerate(
        owner,
        proj,
        unfinished,
        mode,
        pct,
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

  async function onCrawl(e: FormEvent) {
    e.preventDefault();
    const url = crawlUrl.trim();
    if (!url || !ownerSafe || !project || busy) return;
    setBusy(true);
    const res = await crawlEvoiceDocURL(ownerSafe, project, url);
    setBusy(false);
    if (res.error) {
      showError("Crawl", res.error);
      return;
    }
    setCrawlUrl("");
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onDeleteDoc(name: string) {
    if (!ownerSafe || !project || busy) return;
    if (!window.confirm(`Delete document ${name}? Audio files will remain.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteEvoiceDoc(ownerSafe, project, name);
    setBusy(false);
    if (res.error) {
      showError("eVoice", res.error);
      return;
    }
    setSelectedDocs((prev) => prev.filter((n) => n !== name));
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
    await reloadDocsAudios(ownerSafe, project);
  }

  function resolveGenerateTargets(explicit?: string[]): string[] | undefined {
    if (explicit && explicit.length > 0) return explicit;
    if (selectedDocs.length > 0) return selectedDocs;
    return undefined;
  }

  async function onGenerate(files?: string[]) {
    if (!ownerSafe || !project || busy) return;
    let targets = resolveGenerateTargets(files);
    const mode = generateMode;
    const pct = contentPercent;

    if (mode === "super_premium") {
      const candidate =
        targets ?? sourceDocs.map((d) => d.name);
      const { ok, rejected } = filterSuperPremiumTargets(candidate);
      if (rejected.length > 0 && ok.length === 0) {
        showError(
          "Super Premium",
          `Super Premium is only for PDF, images, and DOCX. Plain text files cannot use this mode: ${rejected.join(", ")}`,
        );
        return;
      }
      if (rejected.length > 0) {
        setLogs((prev) => [
          ...prev,
          `Super Premium: skipping non-eligible files: ${rejected.join(", ")}`,
        ]);
        targets = ok.length > 0 ? ok : undefined;
      }
    }

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
    if (consoleOpen === false) setConsoleOpen(true);

    const started = await startEvoiceGenerate(
      ownerSafe,
      project,
      targets,
      mode,
      pct,
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
      mode,
      pct,
    );
    setBusy(false);
    if (outcome === "stopped") setJobStopped(true);
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
    const mode =
      (resumed.mode as EvoiceGenerateMode | undefined) ??
      generateMode;
    const pct = resumed.contentPercent ?? contentPercent;
    if (resumed.mode) setGenerateMode(mode);
    if (resumed.contentPercent != null) setContentPercent(pct);

    const outcome = await pollUntilDone(
      resumed.jobId,
      ownerSafe,
      project,
      files,
      mode,
      pct,
    );
    setBusy(false);
    if (outcome === "stopped") setJobStopped(true);
    await reloadDocsAudios(ownerSafe, project);
  }

  async function onPrintPreparedSpeech() {
    if (!ownerSafe || !project || selectedDocs.length === 0) {
      window.alert("Select at least one document to print prepared speech.");
      return;
    }
    const sections: string[] = [];
    const missing: string[] = [];

    for (const docName of selectedDocs) {
      const stem = stemOf(docName);
      const premiumDoc = findLatestPremiumTxt(stem, docs);
      if (!premiumDoc) {
        missing.push(docName);
        continue;
      }
      const res = await fetchEvoiceDocText(
        ownerSafe,
        project,
        premiumDoc.name,
        premiumDoc.key,
      );
      if (res.error || !res.text.trim()) {
        missing.push(docName);
        continue;
      }
      sections.push(
        `<section><h2>${escapeHtml(docName)}</h2><pre>${escapeHtml(res.text)}</pre></section>`,
      );
    }

    if (sections.length === 0) {
      showError(
        "Prepared speech unavailable",
        missing.length
          ? `No prepared speech found for: ${missing.join(", ")}`
          : "No prepared speech files available for the selected documents.",
      );
      return;
    }

    const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!win) {
      showError("Print", "Pop-up blocked. Allow pop-ups to print prepared speech.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Prepared speech</title>
<style>
body{font-family:Georgia,serif;line-height:1.5;margin:1.5rem;color:#111}
h2{font-size:1.1rem;margin:1.5rem 0 0.5rem;border-bottom:1px solid #ccc}
pre{white-space:pre-wrap;font-family:inherit;font-size:0.95rem}
</style></head><body>${sections.join("")}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function progressForDoc(name: string): EvoiceJobFile | undefined {
    const live = fileProgress.find((f) => f.name === name);
    if (live) return live;
    const related = audiosForDocStem(stemOf(name), audios);
    if (related.length > 0) {
      const chapters = related.filter((a) => /\.c\d+/i.test(a.name)).length;
      const detail =
        chapters > 0 ? `${chapters} chapter audio(s)` : "audio present";
      return { name, state: "ready", progress: 100, detail };
    }
    return undefined;
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

  function toggleTrackChecked(a: EvoiceObjectMeta) {
    const id = trackId(a);
    setCheckedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const queueHasTracks = queue.length > 0;
  const canPrev = trackIndex > 0;
  const canNext = trackIndex < queue.length - 1;

  const qualityIndex = Math.max(
    0,
    QUALITY_MODES.findIndex((m) => m.id === generateMode),
  );
  const contentIndex = Math.max(
    0,
    CONTENT_PERCENTS.indexOf(
      contentPercent as (typeof CONTENT_PERCENTS)[number],
    ),
  );

  function toggleUploadModality(next: Exclude<UploadModality, null>) {
    setUploadModality((prev) => (prev === next ? null : next));
  }

  function toggleWorkspaceCollapsed() {
    setWorkspaceCollapsed((collapsed) => {
      if (!collapsed) {
        sectionOpenBeforeCollapse.current = {
          project: projectOpen,
          upload: uploadOpen,
          docs: docsOpen,
          playlists: playlistsOpen,
        };
        setProjectOpen(false);
        setUploadOpen(false);
        setDocsOpen(false);
        setPlaylistsOpen(false);
        return true;
      }
      const prev = sectionOpenBeforeCollapse.current;
      setProjectOpen(prev?.project ?? true);
      setUploadOpen(prev?.upload ?? true);
      setDocsOpen(prev?.docs ?? true);
      setPlaylistsOpen(prev?.playlists ?? true);
      sectionOpenBeforeCollapse.current = null;
      return false;
    });
  }

  const evoiceHeaderMenu = hdsHost
    ? createPortal(
        <div
          id="evoice-header-menu"
          className="header-dynamic-menu"
          ref={(node) => {
            if (node) window.__eduardoosHeaderDynamicMenu = node;
          }}
        >
          <div
            className="header-dynamic-menu__inner header-dynamic-menu__actions"
            role="toolbar"
            aria-label="eVoice tools"
          >
            <button
              type="button"
              className={
                workspaceCollapsed
                  ? "header-dynamic-menu__btn header-dynamic-menu__btn--active is-active"
                  : "header-dynamic-menu__btn"
              }
              title={workspaceCollapsed ? "Expand workspace" : "Collapse workspace"}
              aria-label={
                workspaceCollapsed ? "Expand workspace" : "Collapse workspace"
              }
              aria-pressed={workspaceCollapsed}
              onClick={toggleWorkspaceCollapsed}
            >
              <span
                className="material-symbols-outlined header-dynamic-menu__icon"
                aria-hidden="true"
              >
                {workspaceCollapsed ? "unfold_more" : "unfold_less"}
              </span>
            </button>
            {isAdmin ? (
              <button
                type="button"
                className={
                  adminModalOpen
                    ? "header-dynamic-menu__btn header-dynamic-menu__btn--active is-active"
                    : "header-dynamic-menu__btn"
                }
                title="Switch owner"
                aria-label="Switch owner"
                aria-pressed={adminModalOpen}
                onClick={() => setAdminModalOpen((v) => !v)}
              >
                <span
                  className="material-symbols-outlined header-dynamic-menu__icon"
                  aria-hidden="true"
                >
                  admin_panel_settings
                </span>
              </button>
            ) : null}
          </div>
        </div>,
        hdsHost,
      )
    : null;

  return (
    <div className="evoice">
      {evoiceHeaderMenu}

      {isAdmin && adminModalOpen ? (
        <div
          className="evoice__modal-backdrop"
          role="presentation"
          onClick={() => setAdminModalOpen(false)}
        >
          <div
            className="evoice__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evoice-admin-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="evoice__modal-head">
              <h2 id="evoice-admin-modal-title">Owner</h2>
              <button
                type="button"
                className="evoice__icon-btn"
                title="Close"
                aria-label="Close"
                onClick={() => setAdminModalOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <label className="evoice__field">
              <span>Browse another user’s projects</span>
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
                  setCheckedTracks(new Set());
                  setQueue([]);
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
          </div>
        </div>
      ) : null}

      <div className="evoice__sections">
        <CollapsibleSection
          id="evoice-project"
          title="Project"
          open={projectOpen}
          onToggle={() => setProjectOpen((v) => !v)}
          className="evoice__section--project"
        >
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
        </CollapsibleSection>

        {project ? (
          <>
            <CollapsibleSection
              id="evoice-upload"
              title="Upload"
              open={uploadOpen}
              onToggle={() => setUploadOpen((v) => !v)}
              className="evoice__section--upload"
            >
              <div className="evoice__upload-row" role="toolbar" aria-label="Upload modality">
                <button
                  type="button"
                  className={
                    uploadModality === "file"
                      ? "evoice__icon-btn evoice__icon-btn--accent"
                      : "evoice__icon-btn"
                  }
                  title="Upload file"
                  aria-label="Upload file"
                  aria-pressed={uploadModality === "file"}
                  onClick={() => toggleUploadModality("file")}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    upload_file
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    uploadModality === "paste"
                      ? "evoice__icon-btn evoice__icon-btn--accent"
                      : "evoice__icon-btn"
                  }
                  title="Paste text"
                  aria-label="Paste text"
                  aria-pressed={uploadModality === "paste"}
                  onClick={() => toggleUploadModality("paste")}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    notes
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    uploadModality === "crawl"
                      ? "evoice__icon-btn evoice__icon-btn--accent"
                      : "evoice__icon-btn"
                  }
                  title="Crawl URL"
                  aria-label="Crawl URL"
                  aria-pressed={uploadModality === "crawl"}
                  onClick={() => toggleUploadModality("crawl")}
                  disabled={busy}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    language
                  </span>
                </button>
              </div>

              {uploadModality === "file" ? (
                <div className="evoice__modality-panel">
                  <label className="btn evoice__upload">
                    Choose file
                    <input
                      type="file"
                      hidden
                      onChange={onUpload}
                      disabled={busy}
                    />
                  </label>
                </div>
              ) : null}

              {uploadModality === "paste" ? (
                <form className="evoice__paste evoice__modality-panel" onSubmit={onPasteText}>
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

              {uploadModality === "crawl" ? (
                <form
                  className="evoice__paste evoice__crawl evoice__modality-panel"
                  onSubmit={(e) => void onCrawl(e)}
                >
                  <label className="evoice__field evoice__field--grow">
                    <span>Crawl URL</span>
                    <input
                      className="evoice__input"
                      type="url"
                      value={crawlUrl}
                      onChange={(e) => setCrawlUrl(e.target.value)}
                      placeholder="https://…"
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn--blue"
                    disabled={busy || !crawlUrl.trim()}
                  >
                    Crawl &amp; save
                  </button>
                </form>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection
              id="evoice-docs"
              title="Documents"
              open={docsOpen}
              onToggle={() => setDocsOpen((v) => !v)}
              className={`evoice__section--docs${consoleOpen ? " evoice__section--with-console" : ""}`}
              headerActions={
                <button
                  type="button"
                  className={
                    consoleOpen
                      ? "evoice__icon-btn evoice__icon-btn--accent"
                      : "evoice__icon-btn"
                  }
                  title={consoleOpen ? "Hide console" : "Show console"}
                  aria-label={consoleOpen ? "Hide console" : "Show console"}
                  aria-pressed={consoleOpen}
                  onClick={() => setConsoleOpen((v) => !v)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    terminal
                  </span>
                </button>
              }
            >
              <div
                className={
                  consoleOpen
                    ? "evoice__docs-console"
                    : "evoice__docs-console evoice__docs-console--solo"
                }
              >
                <div className="evoice__docs-main">
                  <div className="evoice__panel-head">
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

                  {sourceDocs.length === 0 ? (
                    <p className="evoice__empty">No source documents yet.</p>
                  ) : (
                    <ul className="evoice__list">
                      {sourceDocs.map((d) => {
                        const fp = progressForDoc(d.name);
                        const pct = fp
                          ? Math.max(0, Math.min(100, fp.progress))
                          : 0;
                        const checked = selectedDocs.includes(d.name);
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
                              className="evoice__icon-btn evoice__icon-btn--danger"
                              title={`Delete ${d.name}`}
                              aria-label={`Delete ${d.name}`}
                              onClick={() => void onDeleteDoc(d.name)}
                              disabled={busy}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                delete
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="evoice__action-bar">
                    <label className="evoice__slider-field">
                      <span className="evoice__slider-label">
                        Quality
                        <em>{QUALITY_MODES[qualityIndex]?.label ?? "Premium"}</em>
                      </span>
                      <input
                        type="range"
                        className="evoice__slider"
                        min={0}
                        max={QUALITY_MODES.length - 1}
                        step={1}
                        value={qualityIndex}
                        disabled={busy}
                        onChange={(e) => {
                          const i = Number(e.target.value);
                          const next = QUALITY_MODES[i];
                          if (next) setGenerateMode(next.id);
                        }}
                        aria-valuetext={QUALITY_MODES[qualityIndex]?.label}
                      />
                      <span className="evoice__slider-ticks" aria-hidden="true">
                        {QUALITY_MODES.map((m) => (
                          <span key={m.id}>{m.label}</span>
                        ))}
                      </span>
                    </label>

                    <label className="evoice__slider-field">
                      <span className="evoice__slider-label">
                        Content %
                        <em>{contentPercent}%</em>
                      </span>
                      <input
                        type="range"
                        className="evoice__slider"
                        min={0}
                        max={CONTENT_PERCENTS.length - 1}
                        step={1}
                        value={contentIndex}
                        disabled={busy}
                        onChange={(e) => {
                          const i = Number(e.target.value);
                          const next = CONTENT_PERCENTS[i];
                          if (next != null) setContentPercent(next);
                        }}
                        aria-valuetext={`${contentPercent}%`}
                      />
                      <span className="evoice__slider-ticks" aria-hidden="true">
                        {CONTENT_PERCENTS.map((p) => (
                          <span key={p}>{p}%</span>
                        ))}
                      </span>
                    </label>

                    <div className="evoice__action-icons evoice__action-icons--end" role="group" aria-label="Document actions">
                      {busy ? (
                        <button
                          type="button"
                          className="evoice__icon-btn"
                          title="Stop generate"
                          aria-label="Stop generate"
                          onClick={() => void onStopGenerate()}
                          disabled={!activeJobId}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            stop
                          </span>
                        </button>
                      ) : null}
                      {!busy && jobStopped && activeJobId ? (
                        <button
                          type="button"
                          className="evoice__icon-btn evoice__icon-btn--accent"
                          title="Resume generate"
                          aria-label="Resume generate"
                          onClick={() => void onResumeGenerate()}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            play_arrow
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="evoice__icon-btn"
                        title="Print prepared speech"
                        aria-label="Print prepared speech"
                        onClick={() => void onPrintPreparedSpeech()}
                        disabled={busy || selectedDocs.length === 0}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          print
                        </span>
                      </button>
                      <button
                        type="button"
                        className="evoice__icon-btn evoice__icon-btn--accent"
                        title="Generate MP3"
                        aria-label={
                          selectedDocs.length > 0
                            ? `Generate MP3 (${selectedDocs.length})`
                            : "Generate MP3"
                        }
                        onClick={() => void onGenerate()}
                        disabled={busy}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          graphic_eq
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {consoleOpen ? (
                  <aside className="evoice__console">
                    <h3 className="evoice__console-title">Console</h3>
                    <div
                      className="evoice__progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <div
                        className="evoice__progress-bar"
                        style={{
                          width: `${Math.max(0, Math.min(100, progress))}%`,
                        }}
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
                    <h4 className="evoice__log-title">Log</h4>
                    <pre className="evoice__log">{logs.join("\n") || "—"}</pre>
                  </aside>
                ) : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="evoice-playlists"
              title="Playlists"
              open={playlistsOpen}
              onToggle={() => setPlaylistsOpen((v) => !v)}
              className="evoice__section--playlists"
            >
              <TransportBar
                label="Global playlist"
                disabled={globalTrackOrder.length === 0}
                onPlay={() => startPlayback(globalTrackOrder)}
                onPause={pause}
                onStop={stopPlayback}
                onPrev={prev}
                onNext={next}
                canPrev={queueHasTracks && canPrev}
                canNext={queueHasTracks && canNext}
              />

              {globalTrackOrder.length === 0 ? (
                <p className="evoice__empty">No audios yet. Generate from documents.</p>
              ) : (
                <div className="evoice__playlist-tree">
                  {docPlaylists
                    .filter((dp) => dp.buckets.length > 0)
                    .map((dp) => (
                      <article key={dp.stem} className="evoice__doc-group">
                        <header className="evoice__doc-group-head">
                          <h3 className="evoice__doc-group-title">
                            {dp.sourceDoc?.name ?? dp.stem}
                          </h3>
                          <TransportBar
                            label={`Document ${dp.stem}`}
                            disabled={dp.allTracks.length === 0}
                            onPlay={() => startPlayback(dp.allTracks)}
                            onPause={pause}
                            onStop={stopPlayback}
                            onPrev={prev}
                            onNext={next}
                            canPrev={queueHasTracks && canPrev}
                            canNext={queueHasTracks && canNext}
                          />
                        </header>

                        {dp.buckets.map((bucket) => (
                          <div
                            key={`${dp.stem}-${bucket.version}`}
                            className="evoice__version-block"
                          >
                            <header className="evoice__version-head">
                              <h4>{bucket.label}</h4>
                              <TransportBar
                                label={`${dp.stem} ${bucket.label}`}
                                disabled={bucket.tracks.length === 0}
                                onPlay={() => startPlayback(bucket.tracks)}
                                onPause={pause}
                                onStop={stopPlayback}
                                onPrev={prev}
                                onNext={next}
                                canPrev={queueHasTracks && canPrev}
                                canNext={queueHasTracks && canNext}
                              />
                            </header>
                            <ul className="evoice__track-list">
                              {bucket.tracks.map((t) => {
                                const id = trackId(t);
                                const active =
                                  queueHasTracks &&
                                  queue[trackIndex]?.name === t.name &&
                                  trackId(queue[trackIndex]) === id;
                                return (
                                  <li key={id} className="evoice__track-row">
                                    <label className="evoice__doc-check">
                                      <input
                                        type="checkbox"
                                        checked={checkedTracks.has(id)}
                                        onChange={() => toggleTrackChecked(t)}
                                        aria-label={`Select ${t.name}`}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={
                                        active
                                          ? "evoice__track evoice__track--active"
                                          : "evoice__track"
                                      }
                                      onClick={() => {
                                        const idx = queue.findIndex(
                                          (q) => trackId(q) === id,
                                        );
                                        if (idx >= 0) {
                                          setTrackIndex(idx);
                                        } else {
                                          startPlayback([t]);
                                        }
                                      }}
                                    >
                                      {t.name}
                                    </button>
                                    <button
                                      type="button"
                                      className="evoice__icon-btn evoice__icon-btn--danger"
                                      onClick={() => void onDeleteAudio(t.name)}
                                      disabled={busy}
                                      title={`Delete ${t.name}`}
                                      aria-label={`Delete ${t.name}`}
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
                          </div>
                        ))}
                      </article>
                    ))}
                </div>
              )}

              <audio
                ref={audioRef}
                className="evoice__audio"
                src={blobUrl || undefined}
                controls
                onEnded={next}
              />
            </CollapsibleSection>
          </>
        ) : null}
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
