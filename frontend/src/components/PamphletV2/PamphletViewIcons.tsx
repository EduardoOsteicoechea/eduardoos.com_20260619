/**
 * PamphletViewIcons.tsx — Activity bar icons for preview viewport tools.
 */

export function IconZoomIn() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="8" x2="11" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconZoomOut() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="16.5" y1="16.5" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconDragMove() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3v18M3 12h18M7 7l5-4 5 4M7 17l5 4 5-4M7 7l-4 5 4 5M17 7l4 5-4 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
