/**
 * /church/groups — platform-admin catalog of redes / denominaciones.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated, isPlatformAdmin } from "../../lib/auth";
import {
  createChurchGroup,
  deleteChurchGroup,
  listChurchGroups,
  sanitizeChurchSlug,
  updateChurchGroup,
  type DenominationGroup,
} from "../../lib/church";
import "./Church.css";

type Gate = "checking" | "allowed" | "denied" | "signin";

export default function ChurchGroupsPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [groups, setGroups] = useState<DenominationGroup[]>([]);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  async function reload() {
    const data = await listChurchGroups();
    setGroups(data.groups ?? []);
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      setGate("signin");
      return;
    }
    if (!isPlatformAdmin()) {
      setGate("denied");
      return;
    }
    setGate("allowed");
    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : "Could not load groups"),
    );
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createChurchGroup({
        name: name.trim(),
        id: sanitizeChurchSlug(id || name),
      });
      setName("");
      setId("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(groupId: string) {
    setBusy(true);
    setError("");
    try {
      await updateChurchGroup(groupId, { name: editName.trim() });
      setEditId("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(groupId: string) {
    if (!window.confirm(`Eliminar red «${groupId}»?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteChurchGroup(groupId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (gate === "checking") {
    return (
      <div className="church-gate">
        <p className="church-gate__text">Checking access…</p>
      </div>
    );
  }
  if (gate === "signin") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Church groups</h1>
        <p className="church-gate__text">Sign in as platform admin.</p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </div>
    );
  }
  if (gate === "denied") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Admin only</h1>
        <p className="church-gate__text">
          Solo el admin de plataforma gestiona redes / denominaciones.
        </p>
        <a className="btn" href={APP_ROUTES.church}>
          Church
        </a>
      </div>
    );
  }

  return (
    <article className="church-page">
      <p className="church-page__brand">Church</p>
      <h1 className="church-page__title">Redes / denominaciones</h1>
      <p className="church-page__lead">
        Catálogo admin. El registro de iglesias usa este listado como dropdown
        (no texto libre). Persistido en Dynamo + S3 church/groups/.
      </p>
      <div className="church-page__actions">
        <a className="btn" href={APP_ROUTES.church}>
          Grid
        </a>
        <a className="btn" href={APP_ROUTES.churchRegister}>
          Register
        </a>
      </div>

      <form className="church-form" onSubmit={onCreate}>
        <label>
          Nombre
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Asambleas de Dios"
          />
        </label>
        <label>
          Id (slug)
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="asambleas (opcional)"
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Agregar red"}
        </button>
      </form>

      {error ? <p className="church-empty">{error}</p> : null}

      <ul className="church-list">
        {groups.length === 0 ? (
          <li className="church-empty">No groups yet.</li>
        ) : null}
        {groups.map((g) => (
          <li key={g.id} className="church-list__item">
            {editId === g.id ? (
              <div className="church-dyn-card__row">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="church-inline-input"
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void onSaveEdit(g.id)}
                >
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditId("")}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <h3>{g.name}</h3>
                <p className="church-card__meta">id: {g.id}</p>
                <div className="church-page__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId(g.id);
                      setEditName(g.name);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void onDelete(g.id)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
