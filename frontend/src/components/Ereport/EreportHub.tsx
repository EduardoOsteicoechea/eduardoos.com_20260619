/**
 * eReport hub — owned + shared reports; create / import .ereport.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthEmailFromToken } from "../../lib/auth";
import { checkServiceAccess } from "../../lib/payments";
import {
  createEreport,
  deleteEreport,
  ereportHref,
  ereportHubPrettyPath,
  fetchEreportLibrary,
  importEreport,
  type ReportCard,
  type SharedItem,
} from "../../lib/ereport";
import "./Ereport.css";

function emailToSafe(email: string): string {
  return email.trim().toLowerCase().replace(/@/g, "_at_").replace(/\//g, "_");
}

export default function EreportHub() {
  const [userSafe, setUserSafe] = useState("");
  const [owned, setOwned] = useState<ReportCard[]>([]);
  const [shared, setShared] = useState<SharedItem[]>([]);
  const [tema, setTema] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const access = await checkServiceAccess("ereport");
    setCanCreate(access.allowed);
    const res = await fetchEreportLibrary();
    if (res.error) {
      setError(res.error);
    } else {
      setUserSafe(res.userSafe || emailToSafe(getAuthEmailFromToken() || ""));
      setOwned(res.owned);
      setShared(res.shared);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (userSafe && typeof window !== "undefined") {
      const pretty = ereportHubPrettyPath(userSafe);
      if (window.location.pathname.replace(/\/+$/, "") !== pretty) {
        window.history.replaceState(null, "", pretty);
      }
    }
  }, [userSafe]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (busy || !canCreate) return;
    setBusy(true);
    const res = await createEreport(tema.trim() || "Sin tema");
    setBusy(false);
    if (res.error || !res.meta) {
      setError(res.error ?? "No se pudo crear");
      return;
    }
    window.location.href = ereportHref(res.meta.ownerSafe, res.meta.id);
  }

  async function onFile(file: File | null) {
    if (!file || busy || !canCreate) return;
    if (!/\.ereport$/i.test(file.name)) {
      setError("Solo archivos .ereport");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      if (!Array.isArray(payload.sections)) {
        throw new Error("El .ereport no tiene sections[]");
      }
      const guessedTema =
        tema.trim() ||
        String(payload.reportNumber || file.name.replace(/\.ereport$/i, "") || "Importado");
      const res = await importEreport(guessedTema, payload);
      if (res.error || !res.meta) {
        setError(res.error ?? "Import falló");
        setBusy(false);
        return;
      }
      window.location.href = ereportHref(res.meta.ownerSafe, res.meta.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archivo inválido");
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!userSafe || busy || !window.confirm("¿Eliminar este eReport?")) return;
    setBusy(true);
    const res = await deleteEreport(userSafe, id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  }

  return (
      <article className="ereport-hub">
        <header className="ereport-hub__head">
          <p className="product-page__brand">Services</p>
          <h1 className="ereport-hub__title">eReport</h1>
          <p className="ereport-hub__lead">
            Issue Tracker en la nube bajo <code>ereport/</code>. Crea reportes,
            carga <code>.ereport</code> o abre los compartidos contigo.
          </p>
        </header>

        {canCreate ? (
          <form className="ereport-hub__create" onSubmit={(e) => void onCreate(e)}>
            <label htmlFor="ereport-tema">Tema del nuevo reporte</label>
            <div className="ereport-hub__row">
              <input
                id="ereport-tema"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Tema / asunto"
                maxLength={200}
              />
              <button className="btn btn--primary" type="submit" disabled={busy}>
                Nuevo eReport
              </button>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Cargar .ereport
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".ereport"
                hidden
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </form>
        ) : (
          <p className="ereport-hub__note">
            Suscríbete a eReport para crear o importar.{" "}
            <a href={APP_ROUTES.subscription}>Subscribe</a>
          </p>
        )}

        {error ? <p className="ereport-hub__error">{error}</p> : null}
        {loading ? <p className="ereport-hub__empty">Cargando…</p> : null}

        <section className="ereport-hub__section" aria-label="Mis reportes">
          <h2>Mis eReports</h2>
          {!loading && owned.length === 0 ? (
            <p className="ereport-hub__empty">Aún no tienes reportes propios.</p>
          ) : null}
          <div className="ereport-cards">
            {owned.map((card) => (
              <div key={card.id} className="ereport-card">
                <a className="ereport-card__link" href={ereportHref(userSafe, card.id)}>
                  <span className="ereport-card__tema">{card.tema}</span>
                  <span className="ereport-card__meta">
                    {card.reportNumber || "sin número"} ·{" "}
                    {card.updatedAt ? new Date(card.updatedAt).toLocaleString() : ""}
                  </span>
                </a>
                <button
                  type="button"
                  className="ereport-card__del"
                  onClick={() => void onDelete(card.id)}
                  disabled={busy}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="ereport-hub__section" aria-label="Compartidos">
          <h2>Compartidos conmigo</h2>
          {!loading && shared.length === 0 ? (
            <p className="ereport-hub__empty">Nadie ha compartido un eReport contigo aún.</p>
          ) : null}
          <div className="ereport-cards">
            {shared.map((item) => (
              <a
                key={`${item.ownerSafe}-${item.reportId}`}
                className="ereport-card ereport-card--shared"
                href={ereportHref(item.ownerSafe, item.reportId)}
              >
                <span className="ereport-card__tema">{item.tema}</span>
                <span className="ereport-card__meta">
                  de {item.ownerEmail || item.ownerSafe}
                </span>
              </a>
            ))}
          </div>
        </section>
      </article>
  );
}
