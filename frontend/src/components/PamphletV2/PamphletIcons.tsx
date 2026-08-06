import { ACTIVITY_BAR_ICON_CLASS } from "./activityBarIcon";
export function IconAddBelow() {
    return (<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>
    </svg>);
}
export function IconZoomIn() {
    return (<svg className={ACTIVITY_BAR_ICON_CLASS} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d="M10.5 3a7.5 7.5 0 015.3 12.8L21 21l-1.4 1.4-5.2-5.2A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM10 9h2v4h-2V9zm0-2h2v2h-2V7z"/>
    </svg>);
}
export function IconZoomOut() {
    return (<svg className={ACTIVITY_BAR_ICON_CLASS} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d="M10.5 3a7.5 7.5 0 015.3 12.8L21 21l-1.4 1.4-5.2-5.2A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM9 10h5v2H9v-2z"/>
    </svg>);
}
export function IconPrint() {
    return (<svg className={ACTIVITY_BAR_ICON_CLASS} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 3h10v4H7V3zm-2 6h14a2 2 0 012 2v5h-3v4H6v-4H3v-5a2 2 0 012-2zm2 2v2h10V11H7zm0 4v3h10v-3H7z"/>
    </svg>);
}
