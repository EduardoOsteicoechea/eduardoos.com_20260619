/**
 * PlaylistIcons.tsx — Inline SVG icons for playlist transport and list actions.
 */

interface IconProps {
  className?: string;
}

const iconClass = "playlist-icon";

export function IconPrevious({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6v12M18 6L10 12l8 6V6z" fill="currentColor" />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  );
}

export function IconPause({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" fill="currentColor" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6h12v12H6V6z" fill="currentColor" />
    </svg>
  );
}

export function IconNext({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6v12M6 6l8 6-8 6V6z" fill="currentColor" />
    </svg>
  );
}

export function IconLoop({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 7h-4V3l-5 5 5 5V9h4a4 4 0 0 1 4 4 4 4 0 0 1-4 4H7v2h10a6 6 0 0 0 0-12zM7 17h4v4l5-5-5-5v4H7a4 4 0 0 1-4-4 4 4 0 0 1 4-4h2V5H7a6 6 0 0 0 0 12z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconAddToPlaylist({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h12m-6-6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChevronUp({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m6 14 6-6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m6 10 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRemove({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mixer / track-info tray toggle (mobile). */
export function IconMixer({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10v4M8 6v12M12 4v16M16 8v8M20 10v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
