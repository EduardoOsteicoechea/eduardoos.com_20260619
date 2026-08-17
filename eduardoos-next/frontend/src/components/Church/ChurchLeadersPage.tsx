/**
 * /church/leaders — independent líderes catalog.
 * Mutate: platform admin OR (approved + church-management).
 * Network associations: platform admin only.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { isAuthenticated, isPlatformAdmin } from "../../lib/auth";
import {
  createChurchLeader,
  deleteChurchLeader,
  fetchChurchAuthorization,
  LEADER_ROLE_OPTIONS,
  leaderDisplayName,
  listChurchGroups,
  listChurchLeaders,
  sanitizeChurchSlug,
  updateChurchLeader,
  type DenominationGroup,
  type LeaderCatalogEntry,
} from "../../lib/church";
import {
  validateOptionalEmail,
  validateOptionalPhone,
} from "../../lib/validation";
import "./Church.css";

type Gate = "checking" | "allowed" | "denied" | "signin";

export default function ChurchLeadersPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [leaders, setLeaders] = useState<LeaderCatalogEntry[]>([]);
  const [groups, setGroups] = useState<DenominationGroup[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editNetworks, setEditNetworks] = useState<string[]>([]);

  async function reload() {
    const data = await listChurchLeaders();
    setLeaders(data.leaders ?? []);
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      setGate("signin");
      return;
    }
    void (async () => {
      try {
        const authz = await fetchChurchAuthorization();
        const admin = Boolean(authz.isPlatformAdmin || isPlatformAdmin());
        setPlatformAdmin(admin);
        if (!admin && !authz.canRegister) {
          setGate("denied");
          return;
        }
        setGate("allowed");
        const [L, G] = await Promise.all([
          listChurchLeaders(),
          listChurchGroups().catch(() => ({ groups: [] as DenominationGroup[] })),
        ]);
        setLeaders(L.leaders ?? []);
        setGroups(G.groups ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load leaders");
        setGate("denied");
      }
    })();
  }, []);

  function toggleRole(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((r) => r !== id) : [...list, id];
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const phoneErr = validateOptionalPhone(phone);
      if (phoneErr) throw new Error(phoneErr);
      const emailErr = validateOptionalEmail(email);
      if (emailErr) throw new Error(emailErr);
      await createChurchLeader({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        roles,
        id: sanitizeChurchSlug(`${firstName}-${lastName}`),
      });
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setRoles([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(id: string) {
    setBusy(true);
    setError("");
    try {
      const phoneErr = validateOptionalPhone(editPhone);
      if (phoneErr) throw new Error(phoneErr);
      const emailErr = validateOptionalEmail(editEmail);
      if (emailErr) throw new Error(emailErr);
      await updateChurchLeader(id, {
        firstName: editFirst.trim(),
        lastName: editLast.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        roles: editRoles,
        networkIds: editNetworks,
        setNetworks: platformAdmin,
      });
      setEditId("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!window.confirm(`Eliminar líder «${label}»?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteChurchLeader(id);
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
        <h1 className="church-gate__title">Líderes</h1>
        <p className="church-gate__text">Inicie sesión para gestionar el catálogo.</p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </div>
    );
  }
  if (gate === "denied") {
    return (
      <div className="church-gate">
        <h1 className="church-gate__title">Sin permiso</h1>
        <p className="church-gate__text">
          Solo usuarios autorizados para registrar iglesias (aprobación +
          church-management) o el admin de plataforma pueden registrar líderes.
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
      <h1 className="church-page__title">Catálogo de líderes</h1>
      <p className="church-page__lead">
        Registro independiente (nombre, apellido, teléfono/correo opcionales,
        roles). En el registro de iglesias, liderazgo es un dropdown de este
        catálogo. El admin de plataforma asocia cada líder a una o más redes.
      </p>
      <div className="church-page__actions">
        <a className="btn" href={APP_ROUTES.church}>
          Grid
        </a>
        <a className="btn" href={APP_ROUTES.churchRegister}>
          Register
        </a>
        {platformAdmin ? (
          <a className="btn" href={APP_ROUTES.churchGroups}>
            Redes
          </a>
        ) : null}
      </div>

      <form className="church-form church-form--wide" onSubmit={onCreate}>
        <div className="church-dyn-card__grid">
          <label>
            Nombre
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label>
            Apellido
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </label>
          <label>
            Teléfono
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label>
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>
        <fieldset className="church-role-set">
          <legend>Roles</legend>
          {LEADER_ROLE_OPTIONS.map((opt) => (
            <label key={opt.id} className="church-check">
              <input
                type="checkbox"
                checked={roles.includes(opt.id)}
                onChange={() => setRoles((r) => toggleRole(r, opt.id))}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Agregar líder"}
        </button>
      </form>

      {error ? <p className="church-empty">{error}</p> : null}

      <ul className="church-list">
        {leaders.length === 0 ? (
          <li className="church-empty">No hay líderes aún.</li>
        ) : null}
        {leaders.map((L) => (
          <li key={L.id} className="church-list__item">
            {editId === L.id ? (
              <div className="church-dyn-card">
                <div className="church-dyn-card__grid">
                  <label>
                    Nombre
                    <input
                      value={editFirst}
                      onChange={(e) => setEditFirst(e.target.value)}
                    />
                  </label>
                  <label>
                    Apellido
                    <input
                      value={editLast}
                      onChange={(e) => setEditLast(e.target.value)}
                    />
                  </label>
                  <label>
                    Teléfono
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </label>
                  <label>
                    Correo
                    <input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </label>
                </div>
                <fieldset className="church-role-set">
                  <legend>Roles</legend>
                  {LEADER_ROLE_OPTIONS.map((opt) => (
                    <label key={opt.id} className="church-check">
                      <input
                        type="checkbox"
                        checked={editRoles.includes(opt.id)}
                        onChange={() =>
                          setEditRoles((r) => toggleRole(r, opt.id))
                        }
                      />
                      {opt.label}
                    </label>
                  ))}
                </fieldset>
                {platformAdmin ? (
                  <fieldset className="church-role-set">
                    <legend>Redes asociadas</legend>
                    {groups.length === 0 ? (
                      <p className="church-empty">
                        Sin redes — créelas en /church/groups.
                      </p>
                    ) : null}
                    {groups.map((g) => (
                      <label key={g.id} className="church-check">
                        <input
                          type="checkbox"
                          checked={editNetworks.includes(g.id)}
                          onChange={() =>
                            setEditNetworks((ids) =>
                              ids.includes(g.id)
                                ? ids.filter((x) => x !== g.id)
                                : [...ids, g.id],
                            )
                          }
                        />
                        {g.name}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <div className="church-page__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void onSaveEdit(L.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditId("")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3>{leaderDisplayName(L)}</h3>
                <p className="church-card__meta">
                  id: {L.id}
                  {L.phone ? ` · ${L.phone}` : ""}
                  {L.email ? ` · ${L.email}` : ""}
                </p>
                <p className="church-card__meta">
                  {(L.roles ?? [])
                    .map(
                      (id) =>
                        LEADER_ROLE_OPTIONS.find((r) => r.id === id)?.label ||
                        id,
                    )
                    .join(" · ") || "Sin roles"}
                </p>
                {(L.networkIds ?? []).length > 0 ? (
                  <p className="church-card__meta">
                    Redes:{" "}
                    {(L.networkIds ?? [])
                      .map(
                        (id) => groups.find((g) => g.id === id)?.name || id,
                      )
                      .join(", ")}
                  </p>
                ) : (
                  <p className="church-card__meta">
                    Redes: todas (sin asociación)
                  </p>
                )}
                <div className="church-page__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditId(L.id);
                      setEditFirst(L.firstName);
                      setEditLast(L.lastName);
                      setEditPhone(L.phone || "");
                      setEditEmail(L.email || "");
                      setEditRoles(L.roles ?? []);
                      setEditNetworks(L.networkIds ?? []);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      void onDelete(L.id, leaderDisplayName(L) || L.id)
                    }
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
