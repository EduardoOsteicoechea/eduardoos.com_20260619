/**
 * Operator-facing server error dialog.
 * Spec rule: every failed server response must surface here with a copyable block
 * (not a silent console log or a transient toast).
 *
 * details may arrive as a string OR a mistaken object payload (e.g. callers that
 * passed `{ title, message, status, … }` into openApiErrorModal). Never call
 * `.trim()` on a non-string — coerce first so the modal never crashes the page.
 */

import "./ServerErrorModal.css";

const ROOT_ID = "eos-server-error-modal-root";

export type ServerErrorModalInput = {
  title?: string;
  /** Human summary shown above the copy block. */
  summary?: string;
  /** Full diagnostic text (HTTP status, message, correlation id, body, etc.). */
  details: unknown;
};

/**
 * Coerce any details value into a safe display/copy string.
 * Handles strings, nullish, Error, and the mistaken openApiErrorModal object shape.
 */
export function coerceErrorDetails(details: unknown): string {
  if (details == null) return "";
  if (typeof details === "string") return details.trim();
  if (details instanceof Error) return (details.message || String(details)).trim();

  if (typeof details === "object") {
    const o = details as Record<string, unknown>;
    // Mistaken call shape: openApiErrorModal({ title, status, message, … })
    if (typeof o.message === "string" || typeof o.error === "string") {
      const parts: string[] = [];
      if (o.method != null || o.path != null) {
        parts.push(`${String(o.method ?? "GET")} ${String(o.path ?? "")}`.trim());
      }
      if (o.status != null && o.status !== "") {
        parts.push(`HTTP ${String(o.status)}`);
      }
      const msg =
        typeof o.message === "string"
          ? o.message
          : typeof o.error === "string"
            ? o.error
            : "";
      if (msg) parts.push(msg);
      const cid = o.correlationId ?? o.correlation_id;
      if (cid != null && String(cid)) parts.push(`correlation_id=${String(cid)}`);
      if (o.rawBody != null && String(o.rawBody).trim()) {
        const raw = String(o.rawBody);
        const clipped = raw.length > 1200 ? `${raw.slice(0, 1200)}…` : raw;
        parts.push(`body=${clipped}`);
      }
      const joined = parts.join(" · ").trim();
      if (joined) return joined;
    }
    try {
      return JSON.stringify(details, null, 2).trim();
    } catch {
      return String(details).trim();
    }
  }

  return String(details).trim();
}

function ensureRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function closeModal(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.replaceChildren();
  root.hidden = true;
}

/**
 * Show a modal with a selectable/copyable server error block.
 * Safe to call from React or vanilla pamphlet-generator code.
 */
export function openServerErrorModal(input: ServerErrorModalInput): void {
  if (typeof document === "undefined") return;
  const root = ensureRoot();
  root.hidden = false;
  root.replaceChildren();

  const backdrop = document.createElement("div");
  backdrop.className = "server-error-modal__backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal();
  });

  const dialog = document.createElement("div");
  dialog.className = "server-error-modal";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "server-error-modal-title");

  const title = document.createElement("h2");
  title.id = "server-error-modal-title";
  title.className = "server-error-modal__title";
  title.textContent = input.title ?? "Server error";

  if (input.summary) {
    const summary = document.createElement("p");
    summary.className = "server-error-modal__summary";
    summary.textContent = input.summary;
    dialog.append(title, summary);
  } else {
    dialog.append(title);
  }

  const label = document.createElement("p");
  label.className = "server-error-modal__label";
  label.textContent = "Copyable server response";

  const pre = document.createElement("pre");
  pre.className = "server-error-modal__copyblock";
  pre.tabIndex = 0;
  pre.textContent = coerceErrorDetails(input.details) || "(empty error payload)";

  const actions = document.createElement("div");
  actions.className = "server-error-modal__actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "server-error-modal__btn server-error-modal__btn--primary";
  copyBtn.textContent = "Copy to clipboard";
  copyBtn.addEventListener("click", async () => {
    const text = pre.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy to clipboard";
      }, 1600);
    } catch {
      // Fallback: select the block so the user can Ctrl+C.
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      copyBtn.textContent = "Select — press Ctrl+C";
    }
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "server-error-modal__btn";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeModal);

  actions.append(copyBtn, closeBtn);
  dialog.append(label, pre, actions);
  backdrop.append(dialog);
  root.append(backdrop);

  closeBtn.focus();
}

/**
 * Open the modal from an API failure.
 * Accepts a diagnostic string OR a mistaken object payload (never throws).
 */
export function openApiErrorModal(
  errorText: unknown,
  options?: { title?: string; summary?: string },
): void {
  let title = options?.title ?? "Server error";
  let summary =
    options?.summary ??
    "The server rejected this request. Copy the block below when reporting the issue.";

  // If callers pass the whole diagnostic object as the first arg, prefer its title.
  if (
    errorText != null &&
    typeof errorText === "object" &&
    !Array.isArray(errorText) &&
    typeof (errorText as { title?: unknown }).title === "string" &&
    (errorText as { title: string }).title.trim()
  ) {
    title = (errorText as { title: string }).title.trim();
  }

  openServerErrorModal({
    title,
    summary,
    details: errorText,
  });
}
