/**
 * Guards Backspace/Delete for the Instrumentalist belief canvas.
 *
 * React Flow's built-in `deleteKeyCode` uses a *document-level* key listener
 * (`useGlobalKeyHandler` → `useKeyPress`). Docs/default: Backspace deletes any
 * selected nodes/edges. `isInputDOMNode` skips INPUT/SELECT/TEXTAREA and
 * `.nokey`, but focus on toolbar buttons (e.g. "Add group") or the pane still
 * deletes the selection — which feels like "creating a group removed an idea"
 * or "clicking another node deleted the previous one" when Backspace was used
 * while a card stayed selected.
 *
 * Prefer `deleteKeyCode={null}` plus a canvas-scoped handler that calls this guard.
 */

const INPUT_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/**
 * Returns true when Delete/Backspace must NOT remove flow selection.
 * Mirrors @xyflow/system `isInputDOMNode`, and also skips buttons/links and
 * anything marked `.nokey` (xyflow convention for custom interactive chrome).
 */
export function shouldIgnoreFlowDeleteKey(
  target: EventTarget | null | undefined,
): boolean {
  if (!target || !(target instanceof Element)) return true;

  const el = target as Element;
  const tag = el.tagName;
  if (INPUT_TAGS.has(tag)) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el.closest(".nokey")) return true;
  if (tag === "BUTTON" || tag === "A") return true;
  if (el.closest("button, a, label")) return true;
  return false;
}

/** True for Delete / Backspace (event.key), ignoring other keys. */
export function isFlowDeleteKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}