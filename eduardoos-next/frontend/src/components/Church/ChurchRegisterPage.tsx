/**
 * /church/register — denomination + líderes catalog dropdown, church cards,
 * structured creencias (heading / key texts / body + reorder), members.
 * Gated: platform admin OR (approved authorization + church-management sub).
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  leaderDisplayName,
  listChurchGroups,
  listChurchLeaders,
  registerChurch,
  sanitizeChurchSlug,
  type ChurchBelief,
  type DenominationGroup,
  type LeaderCatalogEntry,
} from "../../lib/church";
import {
  ChurchRegisterGateShell,
  useChurchRegisterGate,
} from "./ChurchGate";
import "./Church.css";

type ChurchRow = {
  key: string;
  name: string;
  openedAt: string;
  address: string;
  leadership: string; // catalog leader id
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
type BeliefRow = ChurchBelief & { key: string };

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyBelief(): BeliefRow {
  return { key: newKey(), heading: "", keyTexts: [""], body: "" };
}

export default function ChurchRegisterPage() {
  const { gate, requestAccess, busy: authBusy, error: authError } =
    useChurchRegisterGate();
  const [groups, setGroups] = useState<DenominationGroup[]>([]);
  const [leaders, setLeaders] = useState<LeaderCatalogEntry[]>([]);
  const [denominationId, setDenominationId] = useState("");
  const [churches, setChurches] = useState<ChurchRow[]>([
    { key: newKey(), name: "", openedAt: "", address: "", leadership: "" },
  ]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [beliefs, setBeliefs] = useState<BeliefRow[]>([emptyBelief()]);
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

  useEffect(() => {
    if (gate !== "allowed") return;
    void (async () => {
      try {
        const data = await listChurchLeaders(denominationId);
        setLeaders(data.leaders ?? []);
      } catch {
        setLeaders([]);
      }
    })();
  }, [gate, denominationId]);

  function patchBelief(key: string, patch: Partial<BeliefRow>) {
    setBeliefs((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function moveBelief(key: string, delta: number) {
    setBeliefs((rows) => {
      const i = rows.findIndex((r) => r.key === key);
      if (i < 0) return rows;
      const j = i + delta;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function patchKeyText(beliefKey: string, idx: number, value: string) {
    setBeliefs((rows) =>
      rows.map((row) => {
        if (row.key !== beliefKey) return row;
        const keyTexts = [...(row.keyTexts ?? [])];
        keyTexts[idx] = value;
        return { ...row, keyTexts };
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
      if (leaders.length === 0) {
        setError(
          "Registre al menos un líder en /church/leaders antes de asignar liderazgo.",
        );
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
      for (const c of churchPayload) {
        if (!c.leadership.length) {
          setError(`Seleccione liderazgo para «${c.name}».`);
          setBusy(false);
          return;
        }
      }

      const beliefPayload = beliefs
        .map((b) => ({
          heading: b.heading.trim(),
          keyTexts: (b.keyTexts ?? []).map((t) => t.trim()).filter(Boolean),
          body: (b.body || "").trim(),
        }))
        .filter((b) => b.heading || b.body || b.keyTexts.length > 0);

      const keyToChurchId = new Map(
        churchPayload.map((c) => [c.key, c.churchId]),
      );
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
        churches: churchPayload.map(({ key: _k, ...rest }) => rest),
        members: memberPayload,
        beliefs: beliefPayload,
      });
      const first = data?.churches?.[0] ?? data?.church;
      if (!first?.denominationId || !first?.churchId) {
        throw new Error("Church registered but response lacked church ids");
      }
      window.location.assign(
        churchDetailHref(first.denominationId, first.churchId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

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
          Elija la red, asigne liderazgo desde el catálogo de líderes, agregue
          iglesias y creencias una a una. Usted queda como church-admin.
        </p>
        <div className="church-page__actions">
          <a className="btn" href={APP_ROUTES.church}>
            Volver
          </a>
          <a className="btn" href={APP_ROUTES.churchLeaders}>
            Catálogo de líderes
          </a>
        </div>

        <form className="church-form church-form--wide" onSubmit={onSubmit}>
          <label>
            Red / denominación
            <select
              value={denominationId}
              onChange={(e) => {
                setDenominationId(e.target.value);
                setChurches((rows) =>
                  rows.map((r) => ({ ...r, leadership: "" })),
                );
              }}
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
              No hay redes en el catálogo. Un admin de plataforma debe crearlas
              en <a href={APP_ROUTES.churchGroups}>/church/groups</a>.
            </p>
          ) : null}
          {leaders.length === 0 ? (
            <p className="church-empty">
              No hay líderes para esta red. Regístrelos en{" "}
              <a href={APP_ROUTES.churchLeaders}>/church/leaders</a> (mismo
              permiso que registrar iglesias).
            </p>
          ) : null}

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
                      leadership: leaders[0]?.id || "",
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
                        setChurches((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        );
                        setMembers((ms) =>
                          ms.map((m) =>
                            m.churchKey === row.key
                              ? { ...m, churchKey: "" }
                              : m,
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
                            r.key === row.key
                              ? { ...r, name: e.target.value }
                              : r,
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
                            r.key === row.key
                              ? { ...r, openedAt: e.target.value }
                              : r,
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
                            r.key === row.key
                              ? { ...r, address: e.target.value }
                              : r,
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
                      {leaders.map((L) => (
                        <option key={L.id} value={L.id}>
                          {leaderDisplayName(L)}
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
              <h2>Creencias</h2>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setBeliefs((rows) => [...rows, emptyBelief()])
                }
              >
                +
              </button>
            </div>
            <p className="church-empty">
              Registre creencias una a una: encabezado, textos claves (+/−) y
              texto completo. Use ↑/↓ para reordenar.
            </p>
            <ul className="church-dyn-list">
              {beliefs.map((row, idx) => (
                <li key={row.key} className="church-dyn-card">
                  <div className="church-dyn-card__row">
                    <span className="church-dyn-card__title">
                      Creencia {idx + 1}
                    </span>
                    <div className="church-page__actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={idx === 0}
                        onClick={() => moveBelief(row.key, -1)}
                        aria-label="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={idx === beliefs.length - 1}
                        onClick={() => moveBelief(row.key, 1)}
                        aria-label="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={beliefs.length <= 1}
                        onClick={() =>
                          setBeliefs((rows) =>
                            rows.filter((r) => r.key !== row.key),
                          )
                        }
                      >
                        −
                      </button>
                    </div>
                  </div>
                  <label>
                    Encabezado
                    <input
                      value={row.heading}
                      onChange={(e) =>
                        patchBelief(row.key, { heading: e.target.value })
                      }
                      placeholder="Título de la creencia"
                    />
                  </label>
                  <div className="church-key-texts">
                    <div className="church-section__head">
                      <h3 className="church-key-texts__title">
                        Textos claves
                      </h3>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          patchBelief(row.key, {
                            keyTexts: [...(row.keyTexts ?? []), ""],
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                    {(row.keyTexts ?? [""]).map((t, ti) => (
                      <div key={ti} className="church-key-texts__row">
                        <input
                          value={t}
                          onChange={(e) =>
                            patchKeyText(row.key, ti, e.target.value)
                          }
                          placeholder="Pasaje o texto clave"
                        />
                        <button
                          type="button"
                          className="btn"
                          disabled={(row.keyTexts ?? []).length <= 1}
                          onClick={() =>
                            patchBelief(row.key, {
                              keyTexts: (row.keyTexts ?? []).filter(
                                (_, j) => j !== ti,
                              ),
                            })
                          }
                        >
                          −
                        </button>
                      </div>
                    ))}
                  </div>
                  <label>
                    Texto completo
                    <textarea
                      value={row.body || ""}
                      onChange={(e) =>
                        patchBelief(row.key, { body: e.target.value })
                      }
                      rows={5}
                      placeholder="Desarrollo de la creencia"
                    />
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
                        setMembers((rows) =>
                          rows.filter((r) => r.key !== row.key),
                        )
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
                            r.key === row.key
                              ? { ...r, address: e.target.value }
                              : r,
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
                            r.key === row.key
                              ? { ...r, phone: e.target.value }
                              : r,
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
                            r.key === row.key
                              ? { ...r, email: e.target.value }
                              : r,
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
                Opcional: agregue miembros con +; cada uno elige su iglesia.
              </p>
            ) : null}
          </section>

          {error ? <p className="church-empty">{error}</p> : null}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Guardando…" : "Registrar"}
          </button>
        </form>
      </article>
    </ChurchRegisterGateShell>
  );
}
