/**
 * Playlist transport icons — Material symbols from /public as CSS masks
 * so they inherit button `currentColor` in light and dark themes.
 */

interface IconProps {
  className?: string;
}

const iconClass = "playlist-icon";

const ICON_URLS = {
  play: "/play_circle_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  stop: "/stop_circle_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  previous: "/skip_previous_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  next: "/skip_next_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  download: "/download_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  upload: "/upload_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  loop: "/autorenew_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  mixer: "/cached_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  copy: "/content_copy_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
} as const;

function MaskIcon({ src, className }: { src: string; className?: string }) {
  return (
    <span
      className={className ?? iconClass}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        backgroundColor: "currentColor",
      }}
      aria-hidden="true"
    />
  );
}

export function IconPrevious({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.previous} className={className} />;
}

export function IconPlay({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.play} className={className} />;
}

/** No pause asset provided — keep a simple geometric pause. */
export function IconPause({ className }: IconProps) {
  return (
    <svg className={className ?? iconClass} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" fill="currentColor" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.stop} className={className} />;
}

export function IconNext({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.next} className={className} />;
}

export function IconLoop({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.loop} className={className} />;
}

export function IconDownload({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.download} className={className} />;
}

export function IconUpload({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.upload} className={className} />;
}

export function IconCopy({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.copy} className={className} />;
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

export function IconMixer({ className }: IconProps) {
  return <MaskIcon src={ICON_URLS.mixer} className={className} />;
}
