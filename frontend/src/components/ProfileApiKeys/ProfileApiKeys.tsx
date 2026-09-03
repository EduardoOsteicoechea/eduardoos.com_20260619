/**
 * Profile API keys section (spec 055) — create / list / revoke for api subscribers.
 */

import { useEffect, useState, type FormEvent } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRecord,
} from "../../lib/apikeys";
import { checkServiceAccess } from "../../lib/payments";
import "./ProfileApiKeys.css";

export default function ProfileApiKeys() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onceSecret, setOnceSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await listApiKeys();
    if (res.error) {
      setError(res.error);
      return;
    }
    setKeys(res.keys.filter((k) => !k.revokedAt));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const access = await checkServiceAccess("api");
      if (cancelled) return;
      if (!access.allowed) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Label required");
      return;
    }
    setBusy(true);
    setError("");
    setOnceSecret(null);
    setCopied(false);
    const res = await createApiKey(trimmed);
    setBusy(false);
    if (res.error || !res.key) {
      setError(res.error ?? "Could not create key");
      return;
    }
    setOnceSecret(res.key);
    setLabel("");
    await refresh();
  }

  async function onRevoke(id: string) {
    if (!window.confirm("Revoke this API key? External apps using it will fail immediately.")) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await revokeApiKey(id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (onceSecret) setOnceSecret(null);
    await refresh();
  }

  async function onCopy() {
    if (!onceSecret) return;
    try {
      await navigator.clipboard.writeText(onceSecret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return <p className="profile-api-keys__status">Checking API access…</p>;
  }

  if (!allowed) {
    return (
      <section className="profile-api-keys" aria-label="API keys" id="api-keys">
        <h2 className="profile-api-keys__title">API keys</h2>
        <p className="profile-api-keys__lead">
          Subscribe to the <strong>API</strong> plan ($3/mo) to create keys for external apps.{" "}
          <a href={APP_ROUTES.subscription}>Open subscriptions</a>
          {" · "}
          <a href={APP_ROUTES.apiDocs}>API docs</a>
        </p>
      </section>
    );
  }

  return (
    <section className="profile-api-keys" aria-label="API keys" id="api-keys">
      <h2 className="profile-api-keys__title">API keys</h2>
      <p className="profile-api-keys__lead">
        Keys authenticate with <code>Authorization: Bearer eos_live_…</code>. Scope follows your
        active subscriptions (e.g. eReport). The secret is shown <strong>once</strong> at creation.{" "}
        <a href={APP_ROUTES.apiDocs}>Full API docs</a>
      </p>
      <p className="profile-api-keys__example">
        Example eReport replace:
        <br />
        <code>
          POST /api/v1/ereport/reports/&#123;ownerSafe&#125;/&#123;reportId&#125;
        </code>{" "}
        with JSON <code>{`{"confirmOverwrite":true,"payload":{…}}`}</code>
      </p>

      <form className="profile-api-keys__form" onSubmit={(e) => void onCreate(e)}>
        <label htmlFor="api-key-label">
          Label
          <input
            id="api-key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. ereport-bot"
            maxLength={80}
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Working…" : "Create key"}
        </button>
      </form>

      {onceSecret ? (
        <div className="profile-api-keys__once" role="status">
          <p>
            Copy this secret now — it will not be shown again.
          </p>
          <code className="profile-api-keys__secret">{onceSecret}</code>
          <button type="button" className="btn" onClick={() => void onCopy()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}

      {error ? <p className="profile-api-keys__error">{error}</p> : null}

      <ul className="profile-api-keys__list">
        {keys.length === 0 ? (
          <li className="profile-api-keys__empty">No active keys yet.</li>
        ) : (
          keys.map((k) => (
            <li key={k.id}>
              <div>
                <strong>{k.label}</strong>
                <span className="profile-api-keys__prefix">{k.prefix}</span>
                <span className="profile-api-keys__meta">
                  created {k.createdAt}
                  {k.lastUsedAt ? ` · last used ${k.lastUsedAt}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onRevoke(k.id)}
              >
                Revoke
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
