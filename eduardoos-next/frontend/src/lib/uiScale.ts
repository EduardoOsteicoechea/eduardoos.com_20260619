/**
 * Site-wide text scale — Eduardo OS Next.
 * Persists a multiplier on html (--site-text-scale) so rem-based type grows/shrinks.
 */

export const UI_SCALE_STORAGE_KEY = "eduardoos-text-scale";

/** Discrete steps so A+/A− feel predictable on phone and desktop. */
export const UI_SCALE_STEPS = [0.85, 0.925, 1, 1.075, 1.15, 1.25, 1.4] as const;

export type UiScale = (typeof UI_SCALE_STEPS)[number];

const DEFAULT_SCALE: UiScale = 1;

function nearestStep(value: number): UiScale {
  let best: UiScale = DEFAULT_SCALE;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const step of UI_SCALE_STEPS) {
    const dist = Math.abs(step - value);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

export function readStoredUiScale(): UiScale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return nearestStep(n);
  } catch {
    return null;
  }
}

export function resolveUiScale(): UiScale {
  return readStoredUiScale() ?? DEFAULT_SCALE;
}

export function applyUiScale(scale: UiScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--site-text-scale", String(scale));
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {
    /* private mode */
  }
}

export function bumpUiScale(delta: 1 | -1): UiScale {
  const current = resolveUiScale();
  const idx = UI_SCALE_STEPS.indexOf(current);
  const nextIdx = Math.min(
    UI_SCALE_STEPS.length - 1,
    Math.max(0, (idx < 0 ? UI_SCALE_STEPS.indexOf(DEFAULT_SCALE) : idx) + delta),
  );
  const next = UI_SCALE_STEPS[nextIdx] ?? DEFAULT_SCALE;
  applyUiScale(next);
  return next;
}
