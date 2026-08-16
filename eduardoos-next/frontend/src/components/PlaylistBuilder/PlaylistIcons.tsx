/**
 * Playlist transport icons — inline Material paths with fill/stroke currentColor
 * so glyphs inherit button color in light and dark themes (and accent pressed states).
 *
 * Do not load light-gray public SVGs as <img> or CSS masks that depend on missing
 * /public assets; empty squares in light mode were caused by that.
 */

interface IconProps {
  className?: string;
}

const iconClass = "playlist-icon";
const materialViewBox = "0 -960 960 960";

function MaterialIcon({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg
      className={className ?? iconClass}
      viewBox={materialViewBox}
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function IconPrevious({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z"
    />
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="m380-300 280-180-280-180v360ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
    />
  );
}

/** Geometric pause keeps the same currentColor contract as Material icons. */
export function IconPause({ className }: IconProps) {
  return (
    <svg
      className={className ?? iconClass}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" fill="currentColor" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M320-320h320v-320H320v320ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
    />
  );
}

export function IconNext({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z"
    />
  );
}

export function IconSeekBack({ className }: IconProps) {
  return (
    <MaterialIcon className={className} path="M560-280 360-480l200-200v400Z" />
  );
}

export function IconSeekForward({ className }: IconProps) {
  return (
    <MaterialIcon className={className} path="M400-280v-400l200 200-200 200Z" />
  );
}

export function IconVolume({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M200-360v-240h160l200-200v640L360-360H200Zm440 40v-322q45 21 72.5 65t27.5 97q0 53-27.5 96T640-320ZM480-606l-86 86H280v80h114l86 86v-252ZM380-480Z"
    />
  );
}

export function IconLoop({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z"
    />
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"
    />
  );
}

export function IconUpload({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"
    />
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"
    />
  );
}

export function IconAddToPlaylist({ className }: IconProps) {
  return (
    <svg
      className={className ?? iconClass}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
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
    <svg
      className={className ?? iconClass}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
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
    <svg
      className={className ?? iconClass}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
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
    <svg
      className={className ?? iconClass}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
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

export function IconMixer({ className }: IconProps) {
  return (
    <MaterialIcon
      className={className}
      path="M482-160q-134 0-228-93t-94-227v-7l-64 64-56-56 160-160 160 160-56 56-64-64v7q0 100 70.5 170T482-240q26 0 51-6t49-18l60 60q-38 22-78 33t-82 11Zm278-161L600-481l56-56 64 64v-7q0-100-70.5-170T478-720q-26 0-51 6t-49 18l-60-60q38-22 78-33t82-11q134 0 228 93t94 227v7l64-64 56 56-160 160Z"
    />
  );
}
