/**
 * Admin users dashboard â€” list accounts, roles, registration dates, services.
 * Visible only to eduardooost@gmail.com (platform admin). Delete requires
 * an accessible confirm dialog; self / platform admin cannot be deleted.
 *
 * Spec: every failed API call opens ServerErrorModal (copyable). Access check
 * must never hang on â€œChecking accessâ€¦â€.
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
import { ViewLoading } from "../ViewLoading/ViewLoading";
import {
  approveChurchAuth,
  bulkRegisterUsers,
  deleteAdminUser,
  fetchAdminServices,
  fetchAdminUsers,
  fetchChurchAuthRequests,
  putUserEntitlements,
  rejectChurchAuth,
  type AdminServiceRow,
  type AdminUserRow,
  type BulkRegisterResultRow,
  type ChurchAuthRequestRow,
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

const BULK_JSON_SAMPLE = `[
  { "name": "Ana PÃ©rez", "email": "ana@example.com", "password": "changeme12" },
  { "nombre": "Luis Ruiz", "correo": "luis@example.com", "contrasena": "changeme12" }
]`;

export default function AdminUsersPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [services, setServices] = useState<AdminServiceRow[]>([]);
  const [churchAuthRequests, setChurchAuthRequests] = useState<
    ChurchAuthRequestRow[]
  >([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [draftServices, setDraftServices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [bulkJson, setBulkJson] = useState(BULK_JSON_SAMPLE);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkRegisterResultRow[]>([]);
  const [bulkSummary, setBulkSummary] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmTitleId = useId();
  const confirmDescId = useId();
  const bulkJsonId = useId();
  const selfEmail = getAuthEmailFromToken();

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const [u, s, churchReqs] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminServices(),
        fetchChurchAuthRequests("pending"),
      ]);
      setUsers(u);
      setServices(s);
      setChurchAuthRequests(churchReqs);
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
    // Safety net: never leave â€œChecking accessâ€¦â€ forever.
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
          title: "Admin users â€” server error",
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
    return hasServiceAccess(
      serviceId,
      row.entitlements,
      row.email,
      row.role,
    );
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
        title: "Admin users â€” server error",
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
        title: "Admin users â€” server error",
        summary: "Could not update entitlements. Copy the block below when reporting.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function decideChurchAuth(email: string, action: "approve" | "reject") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "approve") {
        await approveChurchAuth(email);
        setMessage(
          `Approved ${email} for church management. They were emailed to subscribe before registering.`,
        );
      } else {
        await rejectChurchAuth(email);
        setMessage(`Rejected church authorization for ${email}.`);
      }
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Decision failed";
      setError(msg);
      openApiErrorModal(msg, {
        title: "Admin users â€” server error",
        summary: "Could not update church authorization. Copy the block below when reporting.",
      });
    } finally {
      setBusy(false);
    }
  }

  function onBulkFileChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setBulkJson(text);
      setBulkResults([]);
      setBulkSummary("");
    };
    reader.onerror = () => {
      setError("Could not read JSON file");
    };
    reader.readAsText(file);
  }

  async function submitBulkRegister() {
    setBulkBusy(true);
    setError("");
    setMessage("");
    setBulkSummary("");
    setBulkResults([]);
    try {
      const trimmed = bulkJson.trim();
      if (!trimmed) {
        throw new Error("Paste or upload a JSON array of users.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        throw new Error("Invalid JSON â€” expected an array or { \"users\": [...] }.");
      }
      let rows: unknown = parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "users" in parsed
      ) {
        rows = (parsed as { users: unknown }).users;
      }
      if (!Array.isArray(rows)) {
        throw new Error("JSON must be an array of user objects.");
      }
      // Strip accidental password keys from client logs; send raw rows to API.
      const payload = rows.map((row) => {
        if (!row || typeof row !== "object") return {};
        const o = row as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const key of [
          "name",
          "nombre",
          "email",
          "correo",
          "password",
          "contrasena",
          "contraseÃ±a",
        ]) {
          if (typeof o[key] === "string") out[key] = o[key] as string;
        }
        return out;
      });
      const resp = await bulkRegisterUsers(payload);
      setBulkResults(resp.results ?? []);
      setBulkSummary(
        `Bulk register: ${resp.created} created, ${resp.failed} failed. Each created account received a verification OTP email.`,
      );
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk register failed";
      setError(msg);
      openApiErrorModal(msg, {
        title: "Admin users â€” bulk register error",
        summary: "Could not bulk-register users. Copy the block below when reporting.",
      });
    } finally {
      setBulkBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (gate === "checking") {
    return <ViewLoading label="Checking access" />;
  }

  if (gate === "denied") {
    return (
      <section className="admin-users admin-users--denied" aria-labelledby="admin-denied-title">
        <h1 id="admin-denied-title" className="admin-users__title">
          Admin â€” Users
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
        <ViewLoading label="Loading accounts" />
      ) : null}

      <section
        className="admin-users__bulk"
        aria-labelledby="admin-bulk-title"
      >
        <h2 id="admin-bulk-title" className="admin-users__section-title">
          Bulk register (JSON)
        </h2>
        <p className="admin-users__bulk-lead">
          Paste or upload a JSON array. Each row needs email + password (min 8
          chars); name is optional. Aliases:{" "}
          <code>nombre</code>, <code>correo</code>, <code>contrasena</code> /{" "}
          <code>contraseÃ±a</code>. Accounts are created like normal register
          (unverified) and each receives a confirmation OTP email. Failures are
          reported per row without aborting the batch. Max 100 users.
        </p>
        <pre className="admin-users__bulk-sample" tabIndex={0}>
          {BULK_JSON_SAMPLE}
        </pre>
        <label className="admin-users__bulk-label" htmlFor={bulkJsonId}>
          JSON payload
        </label>
        <textarea
          id={bulkJsonId}
          className="admin-users__bulk-textarea"
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
          rows={10}
          spellCheck={false}
          disabled={bulkBusy}
        />
        <div className="admin-users__bulk-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,text/json"
            className="admin-users__bulk-file"
            disabled={bulkBusy}
            onChange={(e) => onBulkFileChange(e.target.files)}
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={bulkBusy || busy}
            onClick={() => void submitBulkRegister()}
          >
            {bulkBusy ? "Registeringâ€¦" : "Submit bulk register"}
          </button>
        </div>
        {bulkSummary ? (
          <p className="admin-users__status">{bulkSummary}</p>
        ) : null}
        {bulkResults.length > 0 ? (
          <ul className="admin-users__bulk-results" aria-label="Bulk register results">
            {bulkResults.map((row) => (
              <li
                key={`${row.index}-${row.email}`}
                className={
                  row.status === "created"
                    ? "admin-users__bulk-result admin-users__bulk-result--ok"
                    : "admin-users__bulk-result admin-users__bulk-result--fail"
                }
              >
                <span className="admin-users__email">
                  {row.email || `(row ${row.index})`}
                  {row.name ? ` Â· ${row.name}` : ""}
                </span>
                <span className="admin-users__meta">
                  {row.status}
                  {row.reason ? ` â€” ${row.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
                    {row.name ? `${row.name} Â· ` : ""}
                    {row.role}
                    {row.verified ? "" : " Â· unverified"} Â·{" "}
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString()
                      : "no date"}
                    {" Â· "}
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
            {selected ? `Services â€” ${selected.email}` : "Select a user"}
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
                      : "â€”"}
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
                          <strong>{svc.label}</strong> â€” ${svc.monthly_usd}/mo
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
                          <span className="visually-hidden">Access â€” {svc.label}</span>
                          <input
                            type="checkbox"
                            checked={accessOn}
                            disabled
                            readOnly
                          />
                        </label>
                        <label className="admin-users__service-check" role="cell">
                          <span className="visually-hidden">
                            Subscription â€” {svc.label}
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
                {busy ? "Savingâ€¦" : "Save entitlements"}
              </button>
            </>
          )}
        </section>
      </div>

      <section
        className="admin-users__church-auth"
        aria-label="Church management authorization requests"
      >
        <h2 className="admin-users__section-title">
          Church management requests ({churchAuthRequests.length})
        </h2>
        <p className="admin-users__church-auth-lead">
          Users must be approved here before they can pay for Church Management and
          register churches. Approval sends a subscription email; it does not grant
          the entitlement.
        </p>
        {churchAuthRequests.length === 0 ? (
          <p className="admin-users__status">No pending church authorization requests.</p>
        ) : (
          <ul className="admin-users__church-auth-list">
            {churchAuthRequests.map((req) => (
              <li key={req.email} className="admin-users__church-auth-row">
                <div className="admin-users__church-auth-meta">
                  <span className="admin-users__email">{req.email}</span>
                  <span className="admin-users__meta">
                    Requested {req.requestedAt || "â€”"} Â· {req.status}
                  </span>
                </div>
                <div className="admin-users__church-auth-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void decideChurchAuth(req.email, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void decideChurchAuth(req.email, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
            {busy ? "Deletingâ€¦" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
