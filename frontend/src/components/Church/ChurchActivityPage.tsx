/**
 * /church/activity — authorized activities + text/image reports.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import { ViewLoading } from "../ViewLoading/ViewLoading";
import {
  fetchMyChurchActivities,
  postActivityReport,
  roleLabel,
  type ActivityRow,
} from "../../lib/church";
import { ChurchGateShell, useChurchAuthGate } from "./ChurchGate";
import "./Church.css";

export default function ChurchActivityPage() {
  const gate = useChurchAuthGate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchMyChurchActivities();
      setRows(data.activities ?? []);
      if (!selected && data.activities?.length) {
        setSelected(data.activities[0].activity.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (gate !== "allowed") return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  const current = rows.find((r) => r.activity.id === selected);

  async function onReport(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    try {
      const images = files ? Array.from(files) : [];
      await postActivityReport(
        current.denominationId,
        current.churchId,
        current.activity.id,
        text.trim(),
        images,
      );
      setText("");
      setFiles(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChurchGateShell gate={gate}>
      <article className="church-page">
        <p className="church-page__brand">Church</p>
        <h1 className="church-page__title">My activities</h1>
        <p className="church-page__lead">
          Activities enabled for you across your church, network, or denomination.
          Authorized users can upload images and a text report of what was done.
        </p>
        <div className="church-page__actions">
          <a className="btn" href={APP_ROUTES.churchOverview}>
            Overview
          </a>
          <a className="btn" href={APP_ROUTES.church}>
            Grid
          </a>
        </div>

        {loading ? <ViewLoading label="Loading" /> : null}
        {error ? <p className="church-empty">{error}</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="church-empty">No authorized activities yet.</p>
        ) : null}

        <ul className="church-list">
          {rows.map((row) => (
            <li key={row.activity.id} className="church-list__item">
              <button
                type="button"
                className="church-tabs__btn"
                onClick={() => setSelected(row.activity.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderColor:
                    selected === row.activity.id ? "var(--site-accent)" : undefined,
                }}
              >
                <strong>{row.activity.title}</strong>
                <div className="church-card__meta">
                  {row.churchName} · {roleLabel(row.viewerRole)} ·{" "}
                  {row.reports.length} reports
                </div>
              </button>
              {selected === row.activity.id && row.reports.length > 0 ? (
                <ul className="church-list" style={{ marginTop: "0.65rem" }}>
                  {row.reports.map((rep) => (
                    <li key={rep.id} className="church-list__item">
                      <p className="church-card__meta">
                        {rep.authorEmail} · {rep.createdAt}
                      </p>
                      <p className="church-panel__block">{rep.text}</p>
                      {rep.imageNames?.length ? (
                        <p className="church-card__meta">
                          Images: {rep.imageNames.join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>

        {current ? (
          <form className="church-form" onSubmit={onReport}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
              Report: {current.activity.title}
            </h2>
            <label>
              What was done
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                required={!files?.length}
              />
            </label>
            <label>
              Images
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(e.target.files)}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Uploading…" : "Submit report"}
            </button>
          </form>
        ) : null}
      </article>
    </ChurchGateShell>
  );
}
