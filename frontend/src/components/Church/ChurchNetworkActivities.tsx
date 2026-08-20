/**
 * Spec 023 — Network activities UI for church workspace.
 *
 * Two surfaces share this module:
 * - `activities`: local church cards → occurrences → create/edit form (no network-activity create)
 * - `network-activities`: rollup read-only (no create)
 * - `network`: Red tab — create network activity (admin) + rollup entry
 *
 * JWT-protected images are fetched with Authorization Bearer and shown via
 * blob object URLs (revoked on unmount / key change).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { getAuthToken } from "../../lib/auth";
import {
  createNetworkActivity,
  createNetworkOccurrence,
  fetchNetworkActivityRollup,
  fetchNetworkMemberPool,
  fetchNetworkOccurrence,
  listChurchNetworkActivities,
  listNetworkOccurrences,
  networkOccurrenceImageUrl,
  softDeleteNetworkOccurrence,
  updateNetworkOccurrence,
  uploadNetworkOccurrenceImage,
  type NetworkActivity,
  type NetworkChurchRollup,
  type NetworkContact,
  type NetworkMemberPoolEntry,
  type NetworkOccurrence,
  type NetworkOccurrenceStats,
} from "../../lib/church";

export type ChurchNetworkActivitiesProps = {
  denomId: string;
  churchId: string;
  viewerRole: string;
  churchName: string;
  /**
   * `activities` = occurrence forms only;
   * `network-activities` = rollup read-only;
   * `network` = Red tab create + rollup.
   */
  surface: "activities" | "network-activities" | "network";
};

type ContactDraft = {
  name: string;
  address: string;
  phone: string;
  interest: string;
};

function emptyContact(): ContactDraft {
  return { name: "", address: "", phone: "", interest: "" };
}

function memberLabel(m: NetworkMemberPoolEntry): string {
  return `${m.name || m.email} · ${m.churchName}`;
}

function canCreateNetworkActivity(viewerRole: string): boolean {
  return viewerRole === "admin" || viewerRole === "church-admin";
}

/** Fetch a JWT-protected image and expose a blob URL; revoke on cleanup. */
function useAuthBlobUrl(path: string | null | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(path, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return blobUrl;
}

function AuthThumb(props: {
  path: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const src = useAuthBlobUrl(props.path);
  if (!src) {
    return (
      <div className={props.className ?? "church-net-photo"} aria-hidden>
        …
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`church-net-photo-btn ${props.className ?? ""}`.trim()}
      onClick={props.onClick}
      aria-label={props.alt}
    >
      <img src={src} alt={props.alt} className="church-net-photo" />
    </button>
  );
}

function PhotoLightbox(props: {
  paths: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { paths, index, onClose, onPrev, onNext } = props;
  const path = paths[index] ?? null;
  const src = useAuthBlobUrl(path);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="church-net-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
    >
      <div className="church-net-lightbox__backdrop" onClick={onClose} />
      <div className="church-net-lightbox__body">
        {src ? (
          <img src={src} alt={`Foto ${index + 1}`} className="church-net-lightbox__img" />
        ) : (
          <p className="church-empty">Cargando…</p>
        )}
        <div className="church-net-lightbox__actions">
          <button type="button" className="btn" onClick={onPrev}>
            Anterior
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="btn" onClick={onNext}>
            Siguiente
          </button>
        </div>
        <p className="church-card__meta">
          {index + 1} / {paths.length}
        </p>
      </div>
    </div>
  );
}

/* —— Local church: Actividades tab —— */

function LocalActivitiesSurface(props: {
  denomId: string;
  churchId: string;
  churchName: string;
}) {
  const { denomId, churchId } = props;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activities, setActivities] = useState<NetworkActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<NetworkActivity | null>(
    null,
  );
  const [occurrences, setOccurrences] = useState<NetworkOccurrence[]>([]);
  const [editing, setEditing] = useState<NetworkOccurrence | null>(null);
  const [creating, setCreating] = useState(false);
  const [pool, setPool] = useState<NetworkMemberPoolEntry[]>([]);

  const reloadActivities = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listChurchNetworkActivities(denomId, churchId);
      setActivities(data.activities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar actividades");
    } finally {
      setLoading(false);
    }
  }, [denomId, churchId]);

  useEffect(() => {
    void reloadActivities();
  }, [reloadActivities]);

  async function openActivity(activity: NetworkActivity) {
    setSelectedActivity(activity);
    setCreating(false);
    setEditing(null);
    setError("");
    setLoading(true);
    try {
      const [occ, members] = await Promise.all([
        listNetworkOccurrences(denomId, churchId, activity.id),
        fetchNetworkMemberPool(denomId, churchId),
      ]);
      setOccurrences(occ.occurrences ?? []);
      setPool(members.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar registros");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOccurrences() {
    if (!selectedActivity) return;
    const occ = await listNetworkOccurrences(denomId, churchId, selectedActivity.id);
    setOccurrences(occ.occurrences ?? []);
  }

  if (creating || editing) {
    if (!selectedActivity) return null;
    return (
      <OccurrenceForm
        denomId={denomId}
        churchId={churchId}
        activity={selectedActivity}
        pool={pool}
        existing={editing}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await refreshOccurrences();
        }}
      />
    );
  }

  if (selectedActivity) {
    return (
      <div className="church-net">
        <div className="church-page__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSelectedActivity(null);
              setOccurrences([]);
            }}
          >
            Volver
          </button>
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            Nuevo registro
          </button>
        </div>
        <h2>{selectedActivity.name}</h2>
        {selectedActivity.description ? (
          <p className="church-panel__block">{selectedActivity.description}</p>
        ) : null}
        {loading ? <p className="church-empty">Loading…</p> : null}
        {error ? <p className="church-empty">{error}</p> : null}
        {!loading && occurrences.length === 0 ? (
          <p className="church-empty">Sin registros aún.</p>
        ) : null}
        <ul className="church-grid church-net-grid">
          {occurrences.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="church-card church-net-card-btn"
                onClick={() => setEditing(o)}
              >
                <h3 className="church-card__name">{o.date}</h3>
                <p className="church-card__meta">
                  {[o.place, `${(o.participantMemberKeys ?? []).length} participantes`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {o.description ? (
                  <p className="church-panel__block">{o.description.slice(0, 120)}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="church-net">
      {loading ? <p className="church-empty">Loading…</p> : null}
      {error ? <p className="church-empty">{error}</p> : null}
      {!loading && activities.length === 0 ? (
        <p className="church-empty">No hay actividades de red aún.</p>
      ) : null}
      <ul className="church-grid church-net-grid">
        {activities.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className="church-card church-net-card-btn"
              onClick={() => void openActivity(a)}
            >
              <h3 className="church-card__name">{a.name}</h3>
              {a.description ? (
                <p className="church-panel__block">{a.description}</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* —— Occurrence create / edit form —— */

function OccurrenceForm(props: {
  denomId: string;
  churchId: string;
  activity: NetworkActivity;
  pool: NetworkMemberPoolEntry[];
  existing: NetworkOccurrence | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const { denomId, churchId, activity, pool, existing } = props;
  const [place, setPlace] = useState(existing?.place ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [reporter, setReporter] = useState(existing?.reporterMemberKey ?? "");
  const [participants, setParticipants] = useState<string[]>(
    existing?.participantMemberKeys ?? [],
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [contacts, setContacts] = useState<ContactDraft[]>(() => {
    const rows = existing?.contacts ?? [];
    if (rows.length === 0) return [emptyContact()];
    return rows.map((c) => ({
      name: c.name ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      interest: c.interest ?? "",
    }));
  });
  const [imageNames, setImageNames] = useState<string[]>(existing?.imageNames ?? []);
  const [occurrenceId, setOccurrenceId] = useState(existing?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const churchesInPool = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of pool) {
      if (!map.has(m.churchId)) map.set(m.churchId, m.churchName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [pool]);

  const imagePaths = useMemo(
    () =>
      occurrenceId
        ? imageNames.map((name) =>
            networkOccurrenceImageUrl(
              denomId,
              churchId,
              activity.id,
              occurrenceId,
              name,
            ),
          )
        : [],
    [denomId, churchId, activity.id, occurrenceId, imageNames],
  );

  function toggleParticipant(email: string) {
    setParticipants((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  }

  function selectAllFromChurch(churchPoolId: string) {
    const emails = pool
      .filter((m) => m.churchId === churchPoolId)
      .map((m) => m.email);
    setParticipants((prev) => {
      const set = new Set(prev);
      for (const e of emails) set.add(e);
      return [...set];
    });
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!date.trim()) {
      setError("La fecha es obligatoria.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        date: date.trim(),
        place: place.trim() || undefined,
        reporterMemberKey: reporter,
        participantMemberKeys: participants,
        description: description.trim() || undefined,
        contacts: contacts
          .filter((c) => c.name.trim())
          .map(
            (c): NetworkContact => ({
              name: c.name.trim(),
              address: c.address.trim() || undefined,
              phone: c.phone.trim() || undefined,
              interest: c.interest.trim() || undefined,
            }),
          ),
      };
      let occ: NetworkOccurrence;
      if (existing || occurrenceId) {
        const id = existing?.id || occurrenceId;
        const res = await updateNetworkOccurrence(
          denomId,
          churchId,
          activity.id,
          id,
          body,
        );
        occ = res.occurrence;
      } else {
        const res = await createNetworkOccurrence(
          denomId,
          churchId,
          activity.id,
          body,
        );
        occ = res.occurrence;
        setOccurrenceId(occ.id);
      }
      setImageNames(occ.imageNames ?? []);
      await props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files?.length) return;
    let id = occurrenceId || existing?.id || "";
    if (!id) {
      if (!date.trim()) {
        setError("Guarda la fecha primero o crea el registro antes de subir fotos.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const res = await createNetworkOccurrence(denomId, churchId, activity.id, {
          date: date.trim(),
          place: place.trim() || undefined,
          reporterMemberKey: reporter,
          participantMemberKeys: participants,
          description: description.trim() || undefined,
          contacts: contacts
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name.trim(),
              address: c.address.trim() || undefined,
              phone: c.phone.trim() || undefined,
              interest: c.interest.trim() || undefined,
            })),
        });
        id = res.occurrence.id;
        setOccurrenceId(id);
        setImageNames(res.occurrence.imageNames ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo crear el registro");
        setBusy(false);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let last = imageNames;
      for (const file of Array.from(files)) {
        const res = await uploadNetworkOccurrenceImage(
          denomId,
          churchId,
          activity.id,
          id,
          file,
        );
        last = res.occurrence.imageNames ?? [...last, res.filename];
        setImageNames(last);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir imagen");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSoftDelete() {
    const id = existing?.id || occurrenceId;
    if (!id) return;
    if (!window.confirm("¿Eliminar este registro?")) return;
    setBusy(true);
    setError("");
    try {
      await softDeleteNetworkOccurrence(denomId, churchId, activity.id, id);
      await props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="church-net">
      <div className="church-page__actions">
        <button type="button" className="btn" onClick={props.onCancel} disabled={busy}>
          Volver
        </button>
      </div>
      <h2>
        {existing ? "Editar registro" : "Nuevo registro"} · {activity.name}
      </h2>
      {error ? <p className="church-empty">{error}</p> : null}
      <form className="church-form church-form--wide" onSubmit={onSave}>
        <label>
          Lugar
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          Reportero
          <select
            value={reporter}
            onChange={(e) => setReporter(e.target.value)}
            disabled={busy}
          >
            <option value="">—</option>
            {pool.map((m) => (
              <option key={m.email} value={m.email}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="church-option-set">
          <legend>Participantes</legend>
          <div className="church-net-bulk">
            {churchesInPool.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => selectAllFromChurch(c.id)}
              >
                Seleccionar todos de {c.name}
              </button>
            ))}
          </div>
          <div className="church-option-set__list church-net-participants">
            {pool.map((m) => (
              <label key={m.email} className="church-option">
                <input
                  type="checkbox"
                  checked={participants.includes(m.email)}
                  onChange={() => toggleParticipant(m.email)}
                  disabled={busy}
                />
                <span className="church-option__label">{memberLabel(m)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="church-section">
          <div className="church-section__head">
            <h2>Registro fotográfico</h2>
          </div>
          <label>
            Añadir fotos
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => void onUploadFiles(e.target.files)}
            />
          </label>
          <div className="church-net-photo-grid">
            {imagePaths.map((path, i) => (
              <AuthThumb
                key={path}
                path={path}
                alt={`Foto ${i + 1}`}
                onClick={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        </div>

        <label>
          Descripción
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </label>

        <div className="church-section">
          <div className="church-section__head">
            <h2>Personas a contactar</h2>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setContacts((prev) => [...prev, emptyContact()])}
            >
              Añadir
            </button>
          </div>
          <ul className="church-dyn-list">
            {contacts.map((c, idx) => (
              <li key={idx} className="church-dyn-card">
                <div className="church-dyn-card__grid">
                  <label>
                    Nombre
                    <input
                      value={c.name}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setContacts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, name: v } : row,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    Dirección
                    <input
                      value={c.address}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setContacts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, address: v } : row,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    Teléfono
                    <input
                      value={c.phone}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setContacts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, phone: v } : row,
                          ),
                        );
                      }}
                    />
                  </label>
                  <label>
                    Interés
                    <input
                      value={c.interest}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setContacts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, interest: v } : row,
                          ),
                        );
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || contacts.length <= 1}
                  onClick={() =>
                    setContacts((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="church-page__actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {(existing || occurrenceId) ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void onSoftDelete()}
            >
              Eliminar
            </button>
          ) : null}
        </div>
      </form>

      {lightboxIndex !== null && imagePaths.length > 0 ? (
        <PhotoLightbox
          paths={imagePaths}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex(
              (i) =>
                i === null
                  ? null
                  : (i - 1 + imagePaths.length) % imagePaths.length,
            )
          }
          onNext={() =>
            setLightboxIndex((i) =>
              i === null ? null : (i + 1) % imagePaths.length,
            )
          }
        />
      ) : null}
    </div>
  );
}

/* —— Network rollup tab —— */

function NetworkRollupSurface(props: {
  denomId: string;
  churchId: string;
  viewerRole: string;
  /** Only true on Red tab — never on Actividades de red or church Actividades. */
  allowCreate: boolean;
}) {
  const { denomId, churchId, viewerRole, allowCreate } = props;
  const groupId = denomId;
  const canCreate = allowCreate && canCreateNetworkActivity(viewerRole);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activities, setActivities] = useState<NetworkActivity[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<NetworkActivity | null>(null);
  const [rollup, setRollup] = useState<NetworkChurchRollup[]>([]);
  const [detail, setDetail] = useState<{
    churchId: string;
    churchName: string;
    occurrence: NetworkOccurrence;
  } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listChurchNetworkActivities(denomId, churchId);
      setActivities(data.activities ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar actividades");
    } finally {
      setLoading(false);
    }
  }, [denomId, churchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createNetworkActivity(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function openRollup(activity: NetworkActivity) {
    setSelected(activity);
    setDetail(null);
    setLoading(true);
    setError("");
    try {
      const data = await fetchNetworkActivityRollup(groupId, activity.id);
      setRollup(data.churches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el rollup");
    } finally {
      setLoading(false);
    }
  }

  async function openOccurrence(
    church: NetworkChurchRollup,
    stats: NetworkOccurrenceStats,
  ) {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchNetworkOccurrence(
        denomId,
        church.churchId,
        selected.id,
        stats.occurrenceId,
      );
      setDetail({
        churchId: church.churchId,
        churchName: church.churchName,
        occurrence: data.occurrence,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el detalle");
    } finally {
      setLoading(false);
    }
  }

  if (detail && selected) {
    return (
      <ReadOnlyOccurrenceDetail
        denomId={denomId}
        activity={selected}
        churchId={detail.churchId}
        churchName={detail.churchName}
        occurrence={detail.occurrence}
        onBack={() => setDetail(null)}
      />
    );
  }

  if (selected) {
    return (
      <div className="church-net">
        <div className="church-page__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSelected(null);
              setRollup([]);
            }}
          >
            Volver
          </button>
        </div>
        <h2>{selected.name}</h2>
        {selected.description ? (
          <p className="church-panel__block">{selected.description}</p>
        ) : null}
        {loading ? <p className="church-empty">Loading…</p> : null}
        {error ? <p className="church-empty">{error}</p> : null}
        {rollup.map((church) => (
          <section key={church.churchId} className="church-section church-net-rollup-section">
            <div className="church-section__head">
              <h2>{church.churchName}</h2>
            </div>
            {(church.occurrences ?? []).length === 0 ? (
              <p className="church-empty">Sin registros.</p>
            ) : (
              <ul className="church-grid church-net-grid">
                {(church.occurrences ?? []).map((o) => (
                  <li key={o.occurrenceId}>
                    <RollupOccurrenceCard
                      denomId={denomId}
                      churchId={church.churchId}
                      activityId={selected.id}
                      stats={o}
                      onOpen={() => void openOccurrence(church, o)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="church-net">
      {canCreate ? (
        <form className="church-form" onSubmit={onCreate}>
          <h2>Nueva actividad de red</h2>
          <label>
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label>
            Descripción
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Creando…" : "Crear"}
          </button>
        </form>
      ) : null}

      {loading ? <p className="church-empty">Loading…</p> : null}
      {error ? <p className="church-empty">{error}</p> : null}
      {!loading && activities.length === 0 ? (
        <p className="church-empty">No hay actividades de red aún.</p>
      ) : null}
      <ul className="church-grid church-net-grid">
        {activities.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className="church-card church-net-card-btn"
              onClick={() => void openRollup(a)}
            >
              <h3 className="church-card__name">{a.name}</h3>
              {a.description ? (
                <p className="church-panel__block">{a.description}</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RollupOccurrenceCard(props: {
  denomId: string;
  churchId: string;
  activityId: string;
  stats: NetworkOccurrenceStats;
  onOpen: () => void;
}) {
  const { stats } = props;
  const thumbPath = stats.firstImageName
    ? networkOccurrenceImageUrl(
        props.denomId,
        props.churchId,
        props.activityId,
        stats.occurrenceId,
        stats.firstImageName,
      )
    : null;
  const thumbSrc = useAuthBlobUrl(thumbPath);

  return (
    <button type="button" className="church-card church-net-card-btn" onClick={props.onOpen}>
      {thumbSrc ? (
        <img src={thumbSrc} alt="" className="church-net-rollup-thumb" />
      ) : (
        <div className="church-net-rollup-thumb church-net-rollup-thumb--empty" />
      )}
      <h3 className="church-card__name">{stats.date}</h3>
      <p className="church-card__meta">
        {[
          stats.place,
          stats.reporterName || stats.reporterMemberKey,
          `${stats.participantCount} participantes`,
          `${stats.contactCount} contactos`,
          `${stats.imageCount} fotos`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </button>
  );
}

function ReadOnlyOccurrenceDetail(props: {
  denomId: string;
  churchId: string;
  churchName: string;
  activity: NetworkActivity;
  occurrence: NetworkOccurrence;
  onBack: () => void;
}) {
  const { occurrence, activity, denomId, churchId } = props;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pool, setPool] = useState<NetworkMemberPoolEntry[]>([]);

  useEffect(() => {
    void fetchNetworkMemberPool(denomId, churchId)
      .then((d) => setPool(d.members ?? []))
      .catch(() => setPool([]));
  }, [denomId, churchId]);

  const nameFor = (email: string) => {
    const m = pool.find((x) => x.email === email);
    return m ? memberLabel(m) : email;
  };

  const imagePaths = (occurrence.imageNames ?? []).map((name) =>
    networkOccurrenceImageUrl(
      denomId,
      churchId,
      activity.id,
      occurrence.id,
      name,
    ),
  );

  return (
    <div className="church-net">
      <div className="church-page__actions">
        <button type="button" className="btn" onClick={props.onBack}>
          Volver
        </button>
      </div>
      <h2>
        {activity.name} · {props.churchName}
      </h2>
      <p className="church-card__meta">
        {[occurrence.date, occurrence.place].filter(Boolean).join(" · ")}
      </p>
      <p className="church-panel__block">
        Reportero: {nameFor(occurrence.reporterMemberKey)}
      </p>
      <p className="church-panel__block">
        Participantes:{" "}
        {(occurrence.participantMemberKeys ?? []).map(nameFor).join(", ") || "—"}
      </p>
      {occurrence.description ? (
        <p className="church-panel__block">{occurrence.description}</p>
      ) : null}

      <div className="church-net-photo-grid">
        {imagePaths.map((path, i) => (
          <AuthThumb
            key={path}
            path={path}
            alt={`Foto ${i + 1}`}
            onClick={() => setLightboxIndex(i)}
          />
        ))}
      </div>

      {(occurrence.contacts ?? []).length > 0 ? (
        <>
          <h2>Personas a contactar</h2>
          <ul className="church-list">
            {(occurrence.contacts ?? []).map((c, i) => (
              <li key={i} className="church-list__item">
                <h3>{c.name}</h3>
                <p className="church-card__meta">
                  {[c.address, c.phone, c.interest].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {lightboxIndex !== null && imagePaths.length > 0 ? (
        <PhotoLightbox
          paths={imagePaths}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex(
              (i) =>
                i === null
                  ? null
                  : (i - 1 + imagePaths.length) % imagePaths.length,
            )
          }
          onNext={() =>
            setLightboxIndex((i) =>
              i === null ? null : (i + 1) % imagePaths.length,
            )
          }
        />
      ) : null}
    </div>
  );
}

export default function ChurchNetworkActivities(props: ChurchNetworkActivitiesProps) {
  if (props.surface === "network-activities") {
    return (
      <NetworkRollupSurface
        denomId={props.denomId}
        churchId={props.churchId}
        viewerRole={props.viewerRole}
        allowCreate={false}
      />
    );
  }
  if (props.surface === "network") {
    return (
      <NetworkRollupSurface
        denomId={props.denomId}
        churchId={props.churchId}
        viewerRole={props.viewerRole}
        allowCreate
      />
    );
  }
  return (
    <LocalActivitiesSurface
      denomId={props.denomId}
      churchId={props.churchId}
      churchName={props.churchName}
    />
  );
}
