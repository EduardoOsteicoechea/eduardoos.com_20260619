/**
 * Admin users dashboard — list accounts, roles, registration dates, services.
 * Visible only to eduardooost@gmail.com (platform admin).
 */

import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  fetchAdminServices,
  fetchAdminUsers,
  putUserEntitlements,
  type AdminServiceRow,
  type AdminUserRow,
} from "../../lib/admin";
import { isApsAdminEmail, getAuthEmailFromToken, isAuthenticated } from "../../lib/auth";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "./AdminUsersPage.css";

export default function AdminUsersPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [services, setServices] = useState<AdminServiceRow[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [draftServices, setDraftServices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [u, s] = await Promise.all([fetchAdminUsers(), fetchAdminServices()]);
    setUsers(u);
    setServices(s);
  }, []);

  useEffect(() => {
    const ok = isAuthenticated() && isApsAdminEmail(getAuthEmailFromToken());
    setAllowed(ok);
    setReady(true);
    if (!ok) return;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load users";
        setError(msg);
        openApiErrorModal(msg, { summary: "Admin users failed to load" });
      }
    })();
  }, [refresh]);

  function selectUser(row: AdminUserRow) {
    setSelectedEmail(row.email);
    setDraftServices([...row.serviceIds]);
    setMessage("");
    setError("");
  }

  function toggleService(id: string) {
    setDraftServices((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function saveEntitlements() {
    if (!selectedEmail) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await putUserEntitlements(selectedEmail, draftServices, "monthly", 1);
      await refresh();
      setMessage(`Updated services for ${selectedEmail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      openApiErrorModal(msg, { summary: "Could not update entitlements" });
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="admin-users__status">Checking access…</p>;
  }

  if (!allowed) {
    return (
      <section className="admin-users admin-users--denied">
        <h1 className="admin-users__title">Admin — Users</h1>
        <p className="admin-users__lead">
          This dashboard is restricted to the platform admin (
          <code>{/* keep literal for operators */}eduardooost@gmail.com</code>).
        </p>
        <a className="btn btn--primary" href={APP_ROUTES.login}>
          Sign in
        </a>
      </section>
    );
  }

  const selected = users.find((u) => u.email === selectedEmail) ?? null;

  return (
    <div className="admin-users">
      <header className="admin-users__header">
        <p className="admin-users__brand">Admin</p>
        <h1 className="admin-users__title">Users & subscriptions</h1>
        <p className="admin-users__lead">
          Role and registration date per account. Grant Music, Pamphlet, Debate,
          Homescool, or Videos entitlements (admin always has full access).
        </p>
      </header>

      {error ? <p className="admin-users__error">{error}</p> : null}
      {message ? <p className="admin-users__status">{message}</p> : null}

      <div className="admin-users__layout">
        <section className="admin-users__panel" aria-label="Users">
          <h2 className="admin-users__section-title">Accounts ({users.length})</h2>
          <ul className="admin-users__list">
            {users.map((row) => (
              <li key={row.email}>
                <button
                  type="button"
                  className={`admin-users__row${
                    row.email === selectedEmail ? " admin-users__row--selected" : ""
                  }`}
                  onClick={() => selectUser(row)}
                >
                  <span className="admin-users__email">{row.email}</span>
                  <span className="admin-users__meta">
                    {row.role}
                    {row.verified ? "" : " · unverified"} ·{" "}
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString()
                      : "no date"}
                    {" · "}
                    {row.serviceIds.length
                      ? row.serviceIds.join(", ")
                      : "no services"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-users__panel" aria-label="Entitlements editor">
          <h2 className="admin-users__section-title">
            {selected ? `Services — ${selected.email}` : "Select a user"}
          </h2>
          {!selected ? (
            <p className="admin-users__status">
              Choose an account to view or grant subscription services.
            </p>
          ) : (
            <>
              <dl className="admin-users__facts">
                <div>
                  <dt>Role</dt>
                  <dd>{selected.role}</dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>
                    {selected.createdAt
                      ? new Date(selected.createdAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Verified</dt>
                  <dd>{selected.verified ? "yes" : "no"}</dd>
                </div>
              </dl>
              <ul className="admin-users__service-toggles">
                {services.map((svc) => (
                  <li key={svc.id}>
                    <label className="admin-users__service">
                      <input
                        type="checkbox"
                        checked={draftServices.includes(svc.id)}
                        onChange={() => toggleService(svc.id)}
                        disabled={busy}
                      />
                      <span>
                        <strong>{svc.label}</strong> — ${svc.monthly_usd}/mo
                        <em>{svc.description}</em>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void saveEntitlements()}
              >
                {busy ? "Saving…" : "Save entitlements"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
