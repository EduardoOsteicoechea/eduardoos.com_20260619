/**
 * /church/register — persist a new church under church/{denom}/{id}/.
 * Gated: platform admin OR (approved authorization + church-management sub).
 */

import { useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  churchDetailHref,
  registerChurch,
  sanitizeChurchSlug,
} from "../../lib/church";
import {
  ChurchRegisterGateShell,
  useChurchRegisterGate,
} from "./ChurchGate";
import "./Church.css";

export default function ChurchRegisterPage() {
  const { gate, requestAccess, busy: authBusy, error: authError } =
    useChurchRegisterGate();
  const [name, setName] = useState("");
  const [denominationId, setDenominationId] = useState("");
  const [churchId, setChurchId] = useState("");
  const [pastors, setPastors] = useState("");
  const [network, setNetwork] = useState("");
  const [localChurches, setLocalChurches] = useState("");
  const [beliefsDocument, setBeliefsDocument] = useState("");
  const [sectorActivities, setSectorActivities] = useState("");
  const [members, setMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const denom = sanitizeChurchSlug(denominationId || network) || "local";
      const id = sanitizeChurchSlug(churchId || name);
      if (!name.trim() || !id) {
        setError("Nombre and church id are required.");
        setBusy(false);
        return;
      }
      const sectors = sectorActivities
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sector, ...rest] = line.split(":");
          return { sector: sector.trim(), description: rest.join(":").trim() };
        });
      const memberRows = members
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [email, namePart, rolePart] = line.split(",").map((s) => s.trim());
          return {
            email,
            name: namePart || "",
            role: rolePart === "church-admin" ? "church-admin" : "church-member",
          };
        });
      const data = await registerChurch({
        name: name.trim(),
        denominationId: denom,
        churchId: id,
        pastors: pastors
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        network: network.trim(),
        localChurches: localChurches
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        beliefsDocument: beliefsDocument.trim(),
        sectorActivities: sectors,
        members: memberRows,
      });
      window.location.assign(
        churchDetailHref(data.church.denominationId, data.church.churchId),
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
        <h1 className="church-page__title">Register church</h1>
        <p className="church-page__lead">
          You become church-admin for this iglesia. Data is stored under S3 church/.
        </p>
        <a className="btn" href={APP_ROUTES.church}>
          Back to grid
        </a>

        <form className="church-form" onSubmit={onSubmit}>
          <label>
            Nombre de iglesia
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Red / denominación (id)
            <input
              value={denominationId}
              onChange={(e) => setDenominationId(e.target.value)}
              placeholder="asambleas"
            />
          </label>
          <label>
            Church id (slug)
            <input
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              placeholder="central"
            />
          </label>
          <label>
            Pastores (one per line)
            <textarea value={pastors} onChange={(e) => setPastors(e.target.value)} />
          </label>
          <label>
            Red / denominación (display name)
            <input value={network} onChange={(e) => setNetwork(e.target.value)} />
          </label>
          <label>
            Iglesias locales (one per line)
            <textarea
              value={localChurches}
              onChange={(e) => setLocalChurches(e.target.value)}
            />
          </label>
          <label>
            Documento de creencias
            <textarea
              value={beliefsDocument}
              onChange={(e) => setBeliefsDocument(e.target.value)}
            />
          </label>
          <label>
            Actividades por sector (sector: description, one per line)
            <textarea
              value={sectorActivities}
              onChange={(e) => setSectorActivities(e.target.value)}
              placeholder="juventud: Viernes 7pm"
            />
          </label>
          <label>
            Miembros (email, name, role — one per line)
            <textarea
              value={members}
              onChange={(e) => setMembers(e.target.value)}
              placeholder="member@example.com, Luis, church-member"
            />
          </label>
          {error ? <p className="church-empty">{error}</p> : null}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Register"}
          </button>
        </form>
      </article>
    </ChurchRegisterGateShell>
  );
}
