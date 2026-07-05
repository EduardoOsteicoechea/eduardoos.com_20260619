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

export function IconOpenFolder() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M3 7.5h6l2 2h10v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 7.5V6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconSaveCloud() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M7 17.5h10M12 4v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8.5 19.5h7a4 4 0 0 0 .8-7.92A5.5 5.5 0 0 0 6.2 9.7 4.5 4.5 0 0 0 8.5 19.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconImmersiveEdit() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="6" y="4" width="12" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="10" width="12" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="16" width="12" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconPreviewLayout() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.25" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
