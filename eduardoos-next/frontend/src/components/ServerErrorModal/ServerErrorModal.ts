/**
 * Operator-facing server error dialog.
 * Spec rule: every failed server response must surface here with a copyable block
 * (not a silent console log or a transient toast).
 */

import "./ServerErrorModal.css";

const ROOT_ID = "eos-server-error-modal-root";

export type ServerErrorModalInput = {
  title?: string;
  /** Human summary shown above the copy block. */
  summary?: string;
  /** Full diagnostic text (HTTP status, message, correlation id, body, etc.). */
  details: string;
};

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
  pre.textContent = input.details.trim() || "(empty error payload)";

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

export function openApiErrorModal(
  errorText: string,
  options?: { title?: string; summary?: string },
): void {
  openServerErrorModal({
    title: options?.title ?? "Server error",
    summary: options?.summary ?? "The server rejected this request. Copy the block below when reporting the issue.",
    details: errorText,
  });
}
