/**
 * Admin users dashboard — list accounts, roles, registration dates, services.
 * Visible only to eduardooost@gmail.com (platform admin). Delete requires
 * an accessible confirm dialog; self / platform admin cannot be deleted.
 *
 * Spec: every failed API call opens ServerErrorModal (copyable). Access check
 * must never hang on “Checking access…”.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  deleteAdminUser,
  fetchAdminServices,
  fetchAdminUsers,
  putUserEntitlements,
  type AdminServiceRow,
  type AdminUserRow,
} from "../../lib/admin";
import {
  APS_ADMIN_EMAIL,
  isApsAdminEmail,
  getAuthEmailFromToken,
  isAuthenticated,
} from "../../lib/auth";
import { hasServiceAccess } from "../../lib/payments";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "./AdminUsersPage.css";

type Gate = "checking" | "allowed" | "denied";

export default function AdminUsersPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [services, setServices] = useState<AdminServiceRow[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [draftServices, setDraftServices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmTitleId = useId();
  const confirmDescId = useId();
  const selfEmail = getAuthEmailFromToken();

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const [u, s] = await Promise.all([fetchAdminUsers(), fetchAdminServices()]);
      setUsers(u);
      setServices(s);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function applyGate(): boolean {
      const ok = isAuthenticated() && isApsAdminEmail(getAuthEmailFromToken());
      if (cancelled) return ok;
      setGate(ok ? "allowed" : "denied");
      return ok;
    }

    const allowed = applyGate();
    // Safety net: never leave “Checking access…” forever.
    const unlock = window.setTimeout(() => {
      setGate((prev) => (prev === "checking" ? "denied" : prev));
    }, 1500);

    if (!allowed) {
      return () => {
        cancelled = true;
        window.clearTimeout(unlock);
      };
    }

    void (async () => {
      try {
        await refresh();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load users";
        setError(msg);
        openApiErrorModal(msg, {
          title: "Admin users — server error",
          summary: "Admin users failed to load. Copy the block below when reporting.",
        });
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(unlock);
    };
  }, [refresh]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pendingDelete) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingDelete]);

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

  function canDelete(row: AdminUserRow): boolean {
    const email = row.email.trim().toLowerCase();
    if (!email) return false;
    if (selfEmail && email === selfEmail) return false;
    if (isApsAdminEmail(email)) return false;
    if (row.role.trim().toLowerCase() === "admin") return false;
    return true;
  }

  function requestDelete(row: AdminUserRow, event: MouseEvent) {
    event.stopPropagation();
    if (!canDelete(row) || busy) return;
    setPendingDelete(row);
    setError("");
    setMessage("");
  }

  function isPlatformAdminUser(row: AdminUserRow): boolean {
    return (
      isApsAdminEmail(row.email) || row.role.trim().toLowerCase() === "admin"
    );
  }

  function effectiveAccess(row: AdminUserRow, serviceId: string): boolean {
    if (isPlatformAdminUser(row)) return true;
    return hasServiceAccess(serviceId, row.entitlements, row.email);
  }

  function cancelDelete() {
    setPendingDelete(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete.email;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteAdminUser(target);
      setPendingDelete(null);
      if (selectedEmail === target) {
        setSelectedEmail("");
        setDraftServices([]);
      }
      await refresh();
      setMessage(`Deleted ${target}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      setError(msg);
      openApiErrorModal(msg, {
        title: "Admin users — server error",
        summary: "Could not delete user. Copy the block below when reporting.",
      });
    } finally {
      setBusy(false);
    }
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
      openApiErrorModal(msg, {
        title: "Admin users — server error",
        summary: "Could not update entitlements. Copy the block below when reporting.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (gate === "checking") {
    return <p className="admin-users__status">Checking access…</p>;
  }

  if (gate === "denied") {
    return (
      <section className="admin-users admin-users--denied" aria-labelledby="admin-denied-title">
        <h1 id="admin-denied-title" className="admin-users__title">
          Admin — Users
        </h1>
        <p className="admin-users__lead">
          This dashboard is restricted to the platform admin (
          <code>{APS_ADMIN_EMAIL}</code>). Non-admins receive the same denial as APS admin.
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
          Role and registration date per account. Access shows effective product
          reach; Subscriptions are grantable entitlements. Admin always has full
          access regardless of subscriptions.
        </p>
      </header>

      {error ? <p className="admin-users__error">{error}</p> : null}
      {message ? <p className="admin-users__status">{message}</p> : null}
      {loadingList ? (
        <p className="admin-users__status">Loading accounts…</p>
      ) : null}

      <div className="admin-users__layout">
        <section className="admin-users__panel" aria-label="Users">
          <h2 className="admin-users__section-title">Accounts ({users.length})</h2>
          <ul className="admin-users__list">
            {users.map((row) => (
              <li key={row.email} className="admin-users__card">
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
                {canDelete(row) ? (
                  <button
                    type="button"
                    className="btn admin-users__delete"
                    disabled={busy}
                    onClick={(e) => requestDelete(row, e)}
                  >
                    Delete
                  </button>
                ) : (
                  <span className="admin-users__delete-hint" title="Protected account">
                    Protected
                  </span>
                )}
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
              <p className="admin-users__access-note">
                {isPlatformAdminUser(selected)
                  ? "Admin always has full access regardless of subscriptions. Access is inherent (read-only); Subscriptions stay grantable and may be empty."
                  : "Access reflects effective reach (active entitlement). Subscriptions are grantable entitlements you can edit."}
              </p>
              <div className="admin-users__service-table" role="table" aria-label="Service access">
                <div className="admin-users__service-head" role="row">
                  <span className="admin-users__service-label" role="columnheader">
                    Service
                  </span>
                  <span role="columnheader">Access</span>
                  <span role="columnheader">Subscriptions</span>
                </div>
                <ul className="admin-users__service-toggles">
                  {services.map((svc) => {
                    const accessOn = effectiveAccess(selected, svc.id);
                    const subOn = draftServices.includes(svc.id);
                    return (
                      <li key={svc.id} className="admin-users__service-row" role="row">
                        <span className="admin-users__service-label" role="cell">
                          <strong>{svc.label}</strong> — ${svc.monthly_usd}/mo
                          <em>{svc.description}</em>
                        </span>
                        <label
                          className="admin-users__service-check"
                          role="cell"
                          title={
                            isPlatformAdminUser(selected)
                              ? "Admin always has full access"
                              : "Effective access from entitlements"
                          }
                        >
                          <span className="visually-hidden">Access — {svc.label}</span>
                          <input
                            type="checkbox"
                            checked={accessOn}
                            disabled
                            readOnly
                          />
                        </label>
                        <label className="admin-users__service-check" role="cell">
                          <span className="visually-hidden">
                            Subscription — {svc.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={subOn}
                            onChange={() => toggleService(svc.id)}
                            disabled={busy}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
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

      <dialog
        ref={dialogRef}
        className="admin-users__confirm"
        aria-labelledby={confirmTitleId}
        aria-describedby={confirmDescId}
        onCancel={(e) => {
          e.preventDefault();
          cancelDelete();
        }}
        onClose={cancelDelete}
      >
        <h2 id={confirmTitleId} className="admin-users__confirm-title">
          Delete user?
        </h2>
        <p id={confirmDescId} className="admin-users__confirm-body">
          Permanently remove{" "}
          <strong>{pendingDelete?.email ?? "this account"}</strong> and clear their
          entitlements. This cannot be undone.
        </p>
        <div className="admin-users__confirm-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={cancelDelete}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary admin-users__confirm-delete"
            disabled={busy || !pendingDelete}
            onClick={() => void confirmDelete()}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
