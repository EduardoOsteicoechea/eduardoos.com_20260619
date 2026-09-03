/**
 * API docs page (spec 057) — human-readable external API reference + client agent prompt.
 */

import { useEffect, useState } from "react";
import { API_DOCS_ROUTE, APP_ROUTES } from "../../config/routes";
import { apiRequest, formatApiError } from "../../lib/api";
import { createCorrelationId } from "../../lib/correlation";
import "./ApiDocsPage.css";

/** Exact prompt for scaffolding an eReport API client in another repo. */
export const EREPORT_API_CLIENT_AGENT_PROMPT = `You are implementing a small standalone client for Eduardo OS eReport external API.

## Goal
Create a script (Node.js or Python — pick one and stick to it) plus a \`.env\` file.
The operator must run steps **one at a time** (separate CLI commands). Do **not** combine them.

## Required order (matches the eReport hub: Orgs → reports)
1. \`access\` — check that the API key can use eReport
2. \`orgs\` — list owned organizations
3. \`org-reports\` — list reports inside one org (to obtain report ids)
4. \`get\` / \`put\` — read then full-replace **one** org report

## Base URL & auth
- Base URL from env \`EDUARDOOS_BASE_URL\` (default \`https://eduardoos.com\`, no trailing slash).
- API key from env \`EDUARDOOS_API_KEY\` (value looks like \`eos_live_<hex>\`).
- Every authenticated request: header \`Authorization: Bearer <EDUARDOOS_API_KEY>\`.
- Optional: send \`X-Correlation-ID\` as a UUID for tracing.
- Rate limit: 60 requests/minute/key; on HTTP 429 honor \`Retry-After\`.

## Entitlements
Key owner needs \`api\` + \`ereport\` (platform admin keys skip product checks). Writes only for reports **owned** by that key's user.
Create/revoke keys only in the UI (/auth/profile or /api-keys) — never via API clients.

## Canonical viewUrl (always print after get/put)
\`{BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}\`
Also returned as \`viewUrl\` on GET/POST org report. End every successful run with:
  Ver reporte: <viewUrl>

## Dates (do not wipe)
Item fields \`fechaIncidencia\` / \`fechaSolucion\` are \`YYYY-MM-DD\`, \`YYYY-MM-DDTHH:mm\`, or \`""\`.
Full replace must preserve non-empty dates unless the operator clears them intentionally.

## Endpoints (in order)

### Step 1 — check access
GET {BASE}/api/v1/ereport/access
→ \`{ allowed: true, service: "ereport", email, ownerSafe }\`

### Step 2 — list orgs
GET {BASE}/api/v1/ereport/orgs
→ \`{ ownerSafe, orgs: [{ id, name, order, updatedAt }] }\`
Print a table. Operator picks \`EDUARDOOS_ORG_ID\` (or CLI flag).

### Step 3 — list reports in that org
GET {BASE}/api/v1/ereport/orgs/{orgId}/reports
→ \`{ orgId, orgName, reports: [{ id, tema, reportNumber, updatedAt }] }\`
Print ids + tema. Operator picks \`EDUARDOOS_REPORT_ID\`.

### Step 4 — first edit (get, then put — separate commands)
a) GET {BASE}/api/v1/ereport/orgs/{orgId}/reports/{reportId}
   → \`{ orgId, reportId, ownerSafe, viewUrl, meta, payload }\`

b) POST {BASE}/api/v1/ereport/orgs/{orgId}/reports/{reportId}
   Content-Type: application/json
   {
     "confirmOverwrite": true,
     "tema": "<optional>",
     "payload": { /* FULL .ereport JSON — required */ }
   }
   Without confirmOverwrite:true → 400. May return snapshotId + viewUrl.

## Deliverables
1. \`.env.example\`:
   EDUARDOOS_BASE_URL=https://eduardoos.com
   EDUARDOOS_API_KEY=
   EDUARDOOS_ORG_ID=
   EDUARDOOS_REPORT_ID=
2. \`.env\` gitignored; dotenv.
3. CLI (separate invocations): \`access\`, \`orgs\`, \`org-reports\`, \`get\`, \`put --file report.json\`
4. Errors for 401/403/404/400/429.
5. README: subscribe API+eReport, create key at /auth/profile; run access → orgs → org-reports → get → put; always print Ver reporte: <viewUrl>.

Do not use browser JWT. Do not invent endpoints. Prefer org paths over legacy flat /library or /reports/{ownerSafe}/…. Optional: GET {BASE}/api/v1/docs.`;

type DocsCatalog = {
  version?: string;
  title?: string;
  keyPolicy?: string;
  routes?: Array<{
    method: string;
    path: string;
    auth: string;
    summary: string;
    body?: string;
    requirements?: string;
  }>;
  rateLimit?: { requestsPerMinute?: number; onExceed?: string };
  entitlements?: { apiProduct?: string; notes?: string };
  auth?: { header?: string; scheme?: string; keyPrefix?: string; notes?: string };
  ownerSafe?: string;
};

function RouteCard({
  row,
}: {
  row: {
    method: string;
    path: string;
    auth: string;
    summary: string;
    body?: string;
    requirements?: string;
  };
}) {
  const methodClass = `api-docs__method api-docs__method--${row.method.toLowerCase()}`;
  return (
    <article className="api-docs__card">
      <div className="api-docs__card-top">
        <span className={methodClass}>{row.method}</span>
        <code className="api-docs__card-path">{row.path}</code>
      </div>
      <p className="api-docs__card-summary">{row.summary}</p>
      <dl className="api-docs__card-meta">
        <div>
          <dt>Auth</dt>
          <dd>{row.auth}</dd>
        </div>
        {row.requirements ? (
          <div>
            <dt>Requirements</dt>
            <dd>{row.requirements}</dd>
          </div>
        ) : null}
      </dl>
      {row.body ? (
        <pre className="api-docs__card-body">
          <code>{row.body}</code>
        </pre>
      ) : null}
    </article>
  );
}

export default function ApiDocsPage() {
  const [catalog, setCatalog] = useState<DocsCatalog | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<DocsCatalog>(API_DOCS_ROUTE, {
        correlationId: createCorrelationId(),
      });
      if (cancelled) return;
      if (result.error) {
        setError(formatApiError(result.error));
        return;
      }
      setCatalog(result.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(EREPORT_API_CLIENT_AGENT_PROMPT);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="api-docs">
      <p className="api-docs__brand">Developer</p>
      <h1 className="api-docs__title">API docs</h1>
      <p className="api-docs__lead">
        External apps call Eduardo OS with a long-lived API key (not a browser session). Subscribe to{" "}
        <a href={APP_ROUTES.subscription}>API</a> (+ the product you call), create a key in the{" "}
        <a href={APP_ROUTES.profile}>Profile</a> or <a href={APP_ROUTES.apiKeys}>API keys</a> UI, then
        use <code>Authorization: Bearer</code>.
      </p>

      <section className="api-docs__section" aria-labelledby="api-docs-auth">
        <h2 id="api-docs-auth">Requirements</h2>
        <ul>
          <li>
            <strong>Auth header:</strong>{" "}
            <code>
              {catalog?.auth?.header ?? "Authorization"}: {catalog?.auth?.scheme ?? "Bearer"}{" "}
              {catalog?.auth?.keyPrefix ?? "eos_live_"}…
            </code>
          </li>
          <li>
            <strong>Entitlements:</strong> {catalog?.entitlements?.notes ?? "api + target product"}
          </li>
          <li>
            <strong>Rate limit:</strong>{" "}
            {catalog?.rateLimit?.requestsPerMinute ?? 60}/minute/key —{" "}
            {catalog?.rateLimit?.onExceed ?? "429 + Retry-After"}
          </li>
          <li>
            <strong>ownerSafe:</strong> {catalog?.ownerSafe ?? "lowercase email, @ → _at_"}
          </li>
        </ul>
        {error ? <p className="api-docs__error">{error}</p> : null}
      </section>

      <section className="api-docs__section" aria-labelledby="api-docs-keys">
        <h2 id="api-docs-keys">API keys (UI only)</h2>
        <p className="api-docs__lead">
          {catalog?.keyPolicy ??
            "Create, list, and revoke API keys only in the signed-in UI. Key lifecycle is not part of the external API."}{" "}
          Use <a href={APP_ROUTES.profile}>Profile</a> or <a href={APP_ROUTES.apiKeys}>API keys</a>.
        </p>
      </section>

      <section className="api-docs__section" aria-labelledby="api-docs-routes">
        <h2 id="api-docs-routes">External routes</h2>
        <div className="api-docs__cards">
          {(catalog?.routes ?? []).map((row) => (
            <RouteCard key={`${row.method}:${row.path}`} row={row} />
          ))}
        </div>
        <p className="api-docs__hint">
          Machine-readable catalog: <code>GET {API_DOCS_ROUTE}</code> (no auth).
        </p>
      </section>

      <section className="api-docs__section" aria-labelledby="api-docs-ereport">
        <h2 id="api-docs-ereport">eReport flow (orgs → reports → edit)</h2>
        <ol>
          <li>
            <code>GET /api/v1/ereport/access</code> — confirm the key can use eReport.
          </li>
          <li>
            <code>GET /api/v1/ereport/orgs</code> — list organizations (same as the hub Orgs cards).
          </li>
          <li>
            <code>GET /api/v1/ereport/orgs/&#123;orgId&#125;/reports</code> — list report ids under that org.
          </li>
          <li>
            <code>GET</code> then <code>POST …/orgs/&#123;orgId&#125;/reports/&#123;reportId&#125;</code> with{" "}
            <code>confirmOverwrite: true</code> and the <strong>full</strong> payload.
          </li>
        </ol>
        <p className="api-docs__hint">
          Canonical view URL:{" "}
          <code>
            &#123;BASE&#125;/ereport/workspace?user=&#123;ownerSafe&#125;&amp;org=&#123;orgId&#125;&amp;report=&#123;reportId&#125;
          </code>
          . GET/POST responses include <code>viewUrl</code>. Always end with{" "}
          <code>Ver reporte: &lt;viewUrl&gt;</code>. Preserve{" "}
          <code>fechaIncidencia</code> / <code>fechaSolucion</code> on full replace.
        </p>
      </section>

      <section className="api-docs__section" aria-labelledby="api-docs-prompt">
        <h2 id="api-docs-prompt">Agent prompt (other repo)</h2>
        <p className="api-docs__lead">
          Paste this into another coding agent to generate a <code>.env</code> + CLI that calls the
          eReport API.
        </p>
        <div className="api-docs__actions">
          <button type="button" className="btn btn--primary" onClick={() => void copyPrompt()}>
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <pre className="api-docs__prompt">{EREPORT_API_CLIENT_AGENT_PROMPT}</pre>
      </section>
    </div>
  );
}
