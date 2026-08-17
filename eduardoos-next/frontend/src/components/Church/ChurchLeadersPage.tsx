/**
 * /church/leaders — independent líderes catalog.
 * Mutate: platform admin OR (approved + church-management).
 * Network associations: always shown for register-gate users (groups catalog);
 *   platform admin sees all networks. Persist networkIds[] — churches optional.
 * Church associations: optional when visible churches exist; empty does not block save.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  getAuthEmailFromToken,
  isAuthenticated,
  isPlatformAdmin,
} from "../../lib/auth";
import {
  churchAssociationRef,
  createChurchLeader,
  deleteChurchLeader,
  fetchChurchAuthorization,
  fetchChurchOverview,
  LEADER_ROLE_OPTIONS,
  leaderDisplayName,
  listChurches,
  listChurchGroups,
  listChurchLeaders,
  sanitizeChurchSlug,
  updateChurchLeader,
  type ChurchCard,
  type DenominationGroup,
  type LeaderCatalogEntry,
} from "../../lib/church";
import {
  validateOptionalEmail,
  validateOptionalPhone,
} from "../../lib/validation";
import "./Church.css";

type Gate = "checking" | "allowed" | "denied" | "signin";

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((r) => r !== id) : [...list, id];
}

function RoleOptionSet({
  legend,
  selected,
  onToggle,
}: {
  legend: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="church-option-set">
      <legend>{legend}</legend>
      <div className="church-option-set__list">
        {LEADER_ROLE_OPTIONS.map((opt) => (
          <label key={opt.id} className="church-option">
            <input
              type="checkbox"
              checked={selected.includes(opt.id)}
              onChange={() => onToggle(opt.id)}
            />
            <span className="church-option__label">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ChurchLeadersPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [leaders, setLeaders] = useState<LeaderCatalogEntry[]>([]);
  const [groups, setGroups] = useState<DenominationGroup[]>([]);
  const [churches, setChurches] = useState<ChurchCard[]>([]);
  const [memberDenoms, setMemberDenoms] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [createNetworks, setCreateNetworks] = useState<string[]>([]);
  const [createChurches, setCreateChurches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState("");
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editNetworks, setEditNetworks] = useState<string[]>([]);
  const [editChurches, setEditChurches] = useState<string[]>([]);

  const visibleChurches = useMemo(() => {
    if (platformAdmin) return churches;
    const me = (getAuthEmailFromToken() || "").trim().toLowerCase();
    const denomSet = new Set<string>(memberDenoms);
    for (const c of churches) {
      if ((c.ownerEmail || "").trim().toLowerCase() === me) {
        denomSet.add(c.denominationId);
      }
    }
    return churches.filter((c) => denomSet.has(c.denominationId));
  }, [churches, platformAdmin, memberDenoms]);

  const churchLabelByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of churches) {
      const ref = churchAssociationRef(c.denominationId, c.churchId);
      if (!ref) continue;
      const net = (c.network || c.denominationId || "").trim();
      map.set(ref, net ? `${c.name} (${net})` : c.name);
    }
    return map;
  }, [churches]);

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
        const [L, G, C, O] = await Promise.all([
          listChurchLeaders(),
          listChurchGroups().catch(() => ({ groups: [] as DenominationGroup[] })),
          listChurches().catch(() => ({ churches: [] as ChurchCard[] })),
          fetchChurchOverview().catch(() => ({
            memberships: [] as Array<{ denominationId: string }>,
            churches: [],
          })),
        ]);
        setLeaders(L.leaders ?? []);
        setGroups(G.groups ?? []);
        setChurches(C.churches ?? []);
        setMemberDenoms(
          (O.memberships ?? [])
            .map((m) => (m.denominationId || "").trim())
            .filter(Boolean),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load leaders");
        setGate("denied");
      }
    })();
  }, []);

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
        networkIds: createNetworks,
        churchIds: createChurches,
        id: sanitizeChurchSlug(`${firstName}-${lastName}`),
      });
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setRoles([]);
      setCreateNetworks([]);
      setCreateChurches([]);
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
        setNetworks: true,
        churchIds: editChurches,
        setChurches: true,
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

  function renderNetworkOptions(
    selected: string[],
    onChange: (next: string[]) => void,
  ) {
    return (
      <fieldset className="church-option-set">
        <legend>Redes asociadas</legend>
        {groups.length === 0 ? (
          <p className="church-empty">
            Sin redes en el catálogo — créelas en /church/groups (admin).
          </p>
        ) : (
          <div className="church-option-set__list">
            {groups.map((g) => (
              <label key={g.id} className="church-option">
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  onChange={() => onChange(toggleId(selected, g.id))}
                />
                <span className="church-option__label">{g.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  }

  function renderChurchOptions(
    selected: string[],
    onChange: (next: string[]) => void,
  ) {
    return (
      <fieldset className="church-option-set">
        <legend>Iglesias asociadas (opcional)</legend>
        {visibleChurches.length === 0 ? (
          <p className="church-empty">
            Aún no hay iglesias visibles. Puede guardar el líder solo con redes;
            al registrar iglesias en /church/register se vincularán desde el
            liderazgo.
          </p>
        ) : (
          <div className="church-option-set__list">
            {visibleChurches.map((c) => {
              const ref = churchAssociationRef(c.denominationId, c.churchId);
              if (!ref) return null;
              const label =
                churchLabelByRef.get(ref) ||
                `${c.name} (${c.denominationId})`;
              return (
                <label key={ref} className="church-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(ref)}
                    onChange={() => onChange(toggleId(selected, ref))}
                  />
                  <span className="church-option__label">{label}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    );
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
        roles). Asocie cada líder a redes del catálogo; las iglesias son
        opcionales. En /church/register, el liderazgo lista líderes de la red
        seleccionada (aunque aún no tengan iglesias).
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
        <RoleOptionSet
          legend="Roles"
          selected={roles}
          onToggle={(id) => setRoles((r) => toggleId(r, id))}
        />
        {renderNetworkOptions(createNetworks, setCreateNetworks)}
        {renderChurchOptions(createChurches, setCreateChurches)}
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
                <RoleOptionSet
                  legend="Roles"
                  selected={editRoles}
                  onToggle={(id) => setEditRoles((r) => toggleId(r, id))}
                />
                {renderNetworkOptions(editNetworks, setEditNetworks)}
                {renderChurchOptions(editChurches, setEditChurches)}
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
                <p className="church-card__meta">
                  Redes:{" "}
                  {(L.networkIds ?? []).length > 0
                    ? (L.networkIds ?? [])
                        .map(
                          (id) => groups.find((g) => g.id === id)?.name || id,
                        )
                        .join(", ")
                    : "todas (sin asociación)"}
                </p>
                <p className="church-card__meta">
                  Iglesias:{" "}
                  {(L.churchIds ?? []).length > 0
                    ? (L.churchIds ?? [])
                        .map((ref) => churchLabelByRef.get(ref) || ref)
                        .join(", ")
                    : "ninguna"}
                </p>
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
                      setEditChurches(L.churchIds ?? []);
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
