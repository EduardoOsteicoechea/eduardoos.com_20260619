/**
 * eVoice playlist share accept — magic link landing (spec 071).
 */

import { useEffect, useState, type FormEvent } from "react";
import {
  acceptEvoicePlaylistInvite,
  createEvoiceProject,
  fetchEvoiceMe,
  fetchEvoicePlaylistInvite,
  fetchEvoiceProjects,
  type EvoiceShareInvite,
} from "../../lib/evoice";
import { getAuthToken } from "../../lib/auth";
import { openServerErrorModal } from "../ServerErrorModal/ServerErrorModal";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import ServiceGate from "../ServiceGate/ServiceGate";
import "./Evoice.css";

function readInviteToken(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const q = params.get("token") || params.get("t") || "";
  if (q) return q.trim();
  const parts = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] === "evoice" && parts[1] === "invite" && parts[2]) {
    return decodeURIComponent(parts[2]);
  }
  return "";
}

export default function EvoiceInvitePage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<EvoiceShareInvite | null>(null);
  const [valid, setValid] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [ownerSafe, setOwnerSafe] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [newProject, setNewProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    setToken(readInviteToken());
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Missing invite token.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const preview = await fetchEvoicePlaylistInvite(token);
        if (cancelled) return;
        setInvite(preview.invite);
        setValid(preview.valid);
        setExpired(preview.expired);
        if (getAuthToken()) {
          const me = await fetchEvoiceMe();
          if (cancelled) return;
          setOwnerSafe(me.userSafe);
          const proj = await fetchEvoiceProjects(me.userSafe);
          if (cancelled) return;
          setProjects(proj.projects ?? []);
          if (proj.projects?.length) setProject(proj.projects[0] ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load invite.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
    let target = project.trim();
    if (newProject.trim()) {
      target = newProject.trim();
      const created = await createEvoiceProject(target, ownerSafe || undefined);
      if (created.error) {
        openServerErrorModal({
          title: "Create project",
          message: created.error,
        });
        return;
      }
      target = created.project || target;
    }
    if (!target) {
      openServerErrorModal({
        title: "Import playlist",
        message: "Choose or create a project.",
      });
      return;
    }
    setBusy(true);
    setDoneMsg("");
    try {
      const res = await acceptEvoicePlaylistInvite(token, target);
      const renameNote =
        Object.keys(res.renamed).length > 0
          ? ` Renamed: ${Object.entries(res.renamed)
              .map(([a, b]) => `${a} → ${b}`)
              .join(", ")}.`
          : "";
      setDoneMsg(
        `Imported ${res.imported.length} track(s) into ${res.project}.${renameNote}`,
      );
      window.location.href = `/evoice/?project=${encodeURIComponent(res.project)}`;
    } catch (err) {
      openServerErrorModal({
        title: "Import playlist",
        message: err instanceof Error ? err.message : "Import failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <ViewLoading label="Loading invite…" />;
  }

  return (
    <ServiceGate serviceId="evoice" serviceLabel="eVoice">
      <div className="evoice evoice__invite">
        <h1>eVoice playlist invite</h1>
        {error ? <p className="evoice__empty">{error}</p> : null}
        {expired || !valid ? (
          <p className="evoice__empty">This invite is expired or invalid.</p>
        ) : null}
        {invite && valid ? (
          <>
            <p>
              Shared from project <strong>{invite.project}</strong> for{" "}
              <strong>{invite.email}</strong> ({invite.files.length} track
              {invite.files.length === 1 ? "" : "s"}). Sign in as that email to
              import copies into your project.
            </p>
            <ul className="evoice__invite-tracks">
              {invite.files.map((f) => (
                <li key={f.name}>
                  {f.name}
                  {f.size > 0 ? ` (${Math.round(f.size / 1024)} KB)` : ""}
                </li>
              ))}
            </ul>
            <form className="evoice__share-form" onSubmit={onImport}>
              <label className="evoice__field">
                <span>Target project</span>
                <select
                  className="evoice__select"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  disabled={busy || projects.length === 0}
                >
                  {projects.length === 0 ? (
                    <option value="">No projects yet — create one below</option>
                  ) : (
                    projects.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="evoice__field">
                <span>Or new project name</span>
                <input
                  className="evoice__input"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  disabled={busy}
                  placeholder="optional"
                />
              </label>
              <button type="submit" className="btn btn--blue" disabled={busy}>
                {busy ? "Importing…" : "Import into project"}
              </button>
            </form>
            {doneMsg ? <p className="evoice__share-note">{doneMsg}</p> : null}
          </>
        ) : null}
      </div>
    </ServiceGate>
  );
}
