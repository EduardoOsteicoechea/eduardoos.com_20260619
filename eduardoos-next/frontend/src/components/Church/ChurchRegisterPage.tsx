/**
 * /church/register — denomination from admin catalog, líderes catalog,
 * local church cards, members assigned to those churches.
 * Gated: platform admin OR (approved authorization + church-management sub).
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  LEADER_ROLE_OPTIONS,
  listChurchGroups,
  registerChurch,
  sanitizeChurchSlug,
  type DenominationGroup,
} from "../../lib/church";
import {
  validateOptionalEmail,
  validateOptionalPhone,
} from "../../lib/validation";
import {
  ChurchRegisterGateShell,
  useChurchRegisterGate,
} from "./ChurchGate";
import "./Church.css";

type LeaderRow = {
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  roles: string[];
};
type ChurchRow = {
  key: string;
  name: string;
  openedAt: string;
  address: string;
  leadership: string;
};
type MemberRow = {
  key: string;
  firstName: string;
  secondName: string;
  lastName1: string;
  lastName2: string;
  address: string;
  phone: string;
  email: string;
  churchKey: string;
};

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLeader(): LeaderRow {
  return {
    key: newKey(),
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    roles: [],
  };
}

function leaderRowDisplay(L: LeaderRow): string {
  return `${L.firstName.trim()} ${L.lastName.trim()}`.trim();
}

export default function ChurchRegisterPage() {
  const { gate, requestAccess, busy: authBusy, error: authError } =
    useChurchRegisterGate();
  const [groups, setGroups] = useState<DenominationGroup[]>([]);
  const [denominationId, setDenominationId] = useState("");
  const [leaders, setLeaders] = useState<LeaderRow[]>([emptyLeader()]);
  const [churches, setChurches] = useState<ChurchRow[]>([
    { key: newKey(), name: "", openedAt: "", address: "", leadership: "" },
  ]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [beliefsDocument, setBeliefsDocument] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (gate !== "allowed") return;
    void (async () => {
      try {
        const data = await listChurchGroups();
        const list = data.groups ?? [];
        setGroups(list);
        if (list.length === 1) setDenominationId(list[0].id);
      } catch {
        setGroups([]);
      }
    })();
  }, [gate]);

  function patchLeader(key: string, patch: Partial<LeaderRow>) {
    setLeaders((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function toggleLeaderRole(key: string, roleId: string) {
    setLeaders((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const has = row.roles.includes(roleId);
        return {
          ...row,
          roles: has ? row.roles.filter((r) => r !== roleId) : [...row.roles, roleId],
        };
      }),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!denominationId) {
        setError("Seleccione una red / denominación del catálogo.");
        setBusy(false);
        return;
      }

      for (const L of leaders) {
        const first = L.firstName.trim();
        const last = L.lastName.trim();
        if (
          !first &&
          !last &&
          !L.phone.trim() &&
          !L.email.trim() &&
          L.roles.length === 0
        ) {
          continue;
        }
        if (!first || !last) {
          setError("Cada líder necesita nombre y apellido.");
          setBusy(false);
          return;
        }
        const phoneErr = validateOptionalPhone(L.phone);
        if (phoneErr) {
          setError(`Teléfono de líder inválido (${first} ${last}).`);
          setBusy(false);
          return;
        }
        const emailErr = validateOptionalEmail(L.email);
        if (emailErr) {
          setError(`Correo de líder inválido (${first} ${last}).`);
          setBusy(false);
          return;
        }
      }

      const leaderCatalog = leaders
        .map((L) => {
          const firstName = L.firstName.trim();
          const lastName = L.lastName.trim();
          if (!firstName || !lastName) return null;
          return {
            firstName,
            lastName,
            phone: L.phone.trim(),
            email: L.email.trim(),
            name: `${firstName} ${lastName}`,
            roles: L.roles,
          };
        })
        .filter((L): L is NonNullable<typeof L> => L !== null);
      if (leaderCatalog.length === 0) {
        setError("Agregue al menos un líder.");
        setBusy(false);
        return;
      }

      const churchPayload = churches
        .map((c) => {
          const name = c.name.trim();
          const churchId = sanitizeChurchSlug(name);
          return {
            key: c.key,
            name,
            churchId,
            openedAt: c.openedAt.trim(),
            address: c.address.trim(),
            leadership: c.leadership.trim() ? [c.leadership.trim()] : [],
          };
        })
        .filter((c) => c.name && c.churchId);

      if (churchPayload.length === 0) {
        setError("Agregue al menos una iglesia (tarjeta).");
        setBusy(false);
        return;
      }

      const keyToChurchId = new Map(churchPayload.map((c) => [c.key, c.churchId]));
      const memberPayload = members
        .map((m) => {
          const email = m.email.trim();
          const churchId = keyToChurchId.get(m.churchKey) || "";
          return {
            email,
            firstName: m.firstName.trim(),
            secondName: m.secondName.trim(),
            lastName1: m.lastName1.trim(),
            lastName2: m.lastName2.trim(),
            address: m.address.trim(),
            phone: m.phone.trim(),
            churchId,
            role: "church-member" as const,
          };
        })
        .filter((m) => m.email && m.churchId);

      const data = await registerChurch({
        denominationId,
        leaders: leaderCatalog,
        churches: churchPayload.map(({ key: _k, ...rest }) => rest),
        members: memberPayload,
        beliefsDocument: beliefsDocument.trim(),
      });
      const first = data.churches?.[0] ?? data.church;
      window.location.assign(churchDetailHref(first.denominationId, first.churchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  const namedLeaders = leaders.map((L) => leaderRowDisplay(L)).filter(Boolean);

  return (
    <ChurchRegisterGateShell
      gate={gate}
      busy={authBusy}
      error={authError}
      onRequest={() => void requestAccess()}
    >
      <article className="church-page">
        <p className="church-page__brand">Church</p>
        <h1 className="church-page__title">Registrar iglesias</h1>
        <p className="church-page__lead">
          Elija la red del catálogo, registre líderes, agregue iglesias locales en
          tarjetas y asigne miembros a esas iglesias. Usted queda como church-admin.
        </p>
        <div className="church-page__actions">
          <a className="btn" href={APP_ROUTES.church}>
            Volver
          </a>
        </div>

        <form className="church-form church-form--wide" onSubmit={onSubmit}>
          <label>
            Red / denominación
            <select
              value={denominationId}
              onChange={(e) => setDenominationId(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {groups.length === 0 ? (
            <p className="church-empty">
              No hay redes en el catálogo. Un admin de plataforma debe crearlas en{" "}
              <a href={APP_ROUTES.churchGroups}>/church/groups</a>.
            </p>
          ) : null}

          <section className="church-section">
            <div className="church-section__head">
              <h2>Líderes</h2>
              <button
                type="button"
                className="btn"
                onClick={() => setLeaders((rows) => [...rows, emptyLeader()])}
              >
                +
              </button>
            </div>
            <ul className="church-dyn-list">
              {leaders.map((row) => (
                <li key={row.key} className="church-dyn-card">
                  <div className="church-dyn-card__row">
                    <span className="church-dyn-card__title">Líder</span>
                    <button
                      type="button"
                      className="btn"
                      disabled={leaders.length <= 1}
                      onClick={() =>
                        setLeaders((rows) => rows.filter((r) => r.key !== row.key))
                      }
                    >
                      −
                    </button>
                  </div>
                  <div className="church-dyn-card__grid">
                    <label>
                      Nombre
                      <input
                        value={row.firstName}
                        onChange={(e) =>
                          patchLeader(row.key, { firstName: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Apellido
                      <input
                        value={row.lastName}
                        onChange={(e) =>
                          patchLeader(row.key, { lastName: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Teléfono
                      <input
                        type="tel"
                        value={row.phone}
                        onChange={(e) =>
                          patchLeader(row.key, { phone: e.target.value })
                        }
                        placeholder="Opcional"
                      />
                    </label>
                    <label>
                      Correo
                      <input
                        type="email"
                        value={row.email}
                        onChange={(e) =>
                          patchLeader(row.key, { email: e.target.value })
                        }
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
                          checked={row.roles.includes(opt.id)}
                          onChange={() => toggleLeaderRole(row.key, opt.id)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </fieldset>
                </li>
              ))}
            </ul>
          </section>

          <section className="church-section">
            <div className="church-section__head">
              <h2>Iglesias</h2>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setChurches((rows) => [
                    ...rows,
                    {
                      key: newKey(),
                      name: "",
                      openedAt: "",
                      address: "",
                      leadership: namedLeaders[0] || "",
                    },
                  ])
                }
              >
                +
              </button>
            </div>
            <ul className="church-dyn-list">
              {churches.map((row) => (
                <li key={row.key} className="church-dyn-card">
                  <div className="church-dyn-card__row">
                    <span className="church-dyn-card__title">Iglesia</span>
                    <button
                      type="button"
                      className="btn"
                      disabled={churches.length <= 1}
                      onClick={() => {
                        setChurches((rows) => rows.filter((r) => r.key !== row.key));
                        setMembers((ms) =>
                          ms.map((m) =>
                            m.churchKey === row.key ? { ...m, churchKey: "" } : m,
                          ),
                        );
                      }}
                    >
                      −
                    </button>
                  </div>
                  <label>
                    Nombre
                    <input
                      value={row.name}
                      onChange={(e) =>
                        setChurches((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, name: e.target.value } : r,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Fecha apertura
                    <input
                      type="date"
                      value={row.openedAt}
                      onChange={(e) =>
                        setChurches((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, openedAt: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Dirección
                    <input
                      value={row.address}
                      onChange={(e) =>
                        setChurches((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, address: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Liderazgo
                    <select
                      value={row.leadership}
                      onChange={(e) =>
                        setChurches((rows) =>
                          rows.map((r) =>
                            r.key === row.key
                              ? { ...r, leadership: e.target.value }
                              : r,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Seleccionar líder…</option>
                      {namedLeaders.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="church-section">
            <div className="church-section__head">
              <h2>Miembros</h2>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setMembers((rows) => [
                    ...rows,
                    {
                      key: newKey(),
                      firstName: "",
                      secondName: "",
                      lastName1: "",
                      lastName2: "",
                      address: "",
                      phone: "",
                      email: "",
                      churchKey: churches[0]?.key || "",
                    },
                  ])
                }
              >
                +
              </button>
            </div>
            <ul className="church-dyn-list">
              {members.map((row) => (
                <li key={row.key} className="church-dyn-card">
                  <div className="church-dyn-card__row">
                    <span className="church-dyn-card__title">Miembro</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setMembers((rows) => rows.filter((r) => r.key !== row.key))
                      }
                    >
                      −
                    </button>
                  </div>
                  <div className="church-dyn-card__grid">
                    <label>
                      Primer nombre
                      <input
                        value={row.firstName}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, firstName: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Segundo nombre
                      <input
                        value={row.secondName}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, secondName: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Apellido 1
                      <input
                        value={row.lastName1}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, lastName1: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Apellido 2
                      <input
                        value={row.lastName2}
                        onChange={(e) =>
                          setMembers((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, lastName2: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Dirección
                    <input
                      value={row.address}
                      onChange={(e) =>
                        setMembers((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, address: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Teléfono
                    <input
                      value={row.phone}
                      onChange={(e) =>
                        setMembers((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, phone: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Correo
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) =>
                        setMembers((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, email: e.target.value } : r,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Iglesia
                    <select
                      value={row.churchKey}
                      onChange={(e) =>
                        setMembers((rows) =>
                          rows.map((r) =>
                            r.key === row.key
                              ? { ...r, churchKey: e.target.value }
                              : r,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Seleccionar iglesia…</option>
                      {churches.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name.trim() || "(sin nombre)"}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
            {members.length === 0 ? (
              <p className="church-empty">
                Opcional: agregue miembros con +; cada uno elige su iglesia. Con
                cuenta eduardoos.com al mismo correo pueden ver el dashboard sin
                suscripción church-management.
              </p>
            ) : null}
          </section>

          <label>
            Documento de creencias (opcional, se copia a cada iglesia)
            <textarea
              value={beliefsDocument}
              onChange={(e) => setBeliefsDocument(e.target.value)}
            />
          </label>

          {error ? <p className="church-empty">{error}</p> : null}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Guardando…" : "Registrar"}
          </button>
        </form>
      </article>
    </ChurchRegisterGateShell>
  );
}
