/**
 * API docs page (specs 057 + 061 + 062 + 063) — routes, downloadable skill, short agent prompt.
 */

import { useEffect, useState } from "react";
import { API_DOCS_ROUTE, APP_ROUTES } from "../../config/routes";
import { apiRequest, formatApiError } from "../../lib/api";
import { createCorrelationId } from "../../lib/correlation";
import "./ApiDocsPage.css";

/** Public Cursor skill package (static files under /skills/…). */
export const EREPORT_SKILL_BASE = "/skills/eduardoos-ereport";
export const EREPORT_SKILL_URL = `${EREPORT_SKILL_BASE}/SKILL.md`;
export const EREPORT_SKILL_CAVEATS_URL = `${EREPORT_SKILL_BASE}/CAVEATS.md`;

/**
 * Short prompt: install the downloadable skill, then run Modes A/B/C.
 * Prefer this over scaffolding a full client from scratch (spec 063).
 */
export const EREPORT_API_CLIENT_AGENT_PROMPT = `You are working with Eduardo OS eReport via the public API.

## Install first (required)
1. Read caveats: https://eduardoos.com/skills/eduardoos-ereport/CAVEATS.md
2. Install the Cursor skill into THIS repo:
   Copy https://eduardoos.com/skills/eduardoos-ereport/ into
   .cursor/skills/eduardoos-ereport/  (SKILL.md, CAVEATS.md, reference.md)
3. Invoke skill name: eduardoos-ereport
4. Follow SKILL.md modes A / B / C for the user task below.

## Caveats (do not skip)
- put is FULL payload replace (always get → merge → put). Not a patch API.
- API rate limit: 60 requests/minute/key (429 + Retry-After). Skill download is static.
- Create/revoke keys only in the UI (/auth/profile or /api-keys). Never print the key.
- Writes: owned reports only; entitlements api + ereport.
- Preserve fechaIncidencia / fechaSolucion and untouched items.
- End with: Ver reporte: <viewUrl>
  viewUrl = {BASE}/ereport/workspace?user={ownerSafe}&org={orgId}&report={reportId}

## Task
<USER TASK HERE — e.g. ingest this QA doc into org X report Y as open issues>

## Optional CLI
If the repo has scripts/eduardoos-ereport/ereport_client.py, use its access/orgs/org-reports/get/put commands one at a time. Else call the HTTP endpoints in reference.md.

Do not invent endpoints. Prefer org paths. Catalog: GET https://eduardoos.com/api/v1/docs`;

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

      <section className="api-docs__section" aria-labelledby="api-docs-skill">
        <h2 id="api-docs-skill">Downloadable Cursor skill</h2>
        <p className="api-docs__lead">
          Good use case: teach an agent in <em>any</em> repo to open, update, or extend eReport
          issues from whatever complaints data it can parse — via the public, rate-limited API.
          Install the skill, then give a concrete task (do not treat put as a patch API).
        </p>
        <div className="api-docs__cards">
          <article className="api-docs__card">
            <div className="api-docs__card-top">
              <span className="api-docs__method api-docs__method--get">Skill</span>
              <code className="api-docs__card-path">eduardoos-ereport</code>
            </div>
            <p className="api-docs__card-summary">
              Modes A (website), B (get/put), C (ingest any parseable doc → merge → put).
            </p>
            <ul className="api-docs__skill-links">
              <li>
                <a href={EREPORT_SKILL_URL} download>
                  Download SKILL.md
                </a>
              </li>
              <li>
                <a href={EREPORT_SKILL_CAVEATS_URL} download>
                  Download CAVEATS.md
                </a>
              </li>
              <li>
                <a href={`${EREPORT_SKILL_BASE}/reference.md`} download>
                  Download reference.md
                </a>
              </li>
            </ul>
            <p className="api-docs__hint">
              Install path: <code>.cursor/skills/eduardoos-ereport/</code> — then invoke by skill
              name. Public URL:{" "}
              <a href={EREPORT_SKILL_URL}>https://eduardoos.com{EREPORT_SKILL_URL}</a>
            </p>
          </article>
        </div>
        <p className="api-docs__hint">
          <strong>Caveats for downloaders:</strong> full replace only; 60 req/min/key; keys UI-only;
          owned reports; preserve dates; always end with <code>Ver reporte: &lt;viewUrl&gt;</code>.
          Details in CAVEATS.md.
        </p>
      </section>

      <section className="api-docs__section" aria-labelledby="api-docs-prompt">
        <h2 id="api-docs-prompt">Agent prompt (skill-first)</h2>
        <p className="api-docs__lead">
          Prefer installing the skill above. Copy this short prompt into another coding agent; it
          tells them to install <code>eduardoos-ereport</code> and follow CAVEATS — not to invent a
          parallel API.
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
