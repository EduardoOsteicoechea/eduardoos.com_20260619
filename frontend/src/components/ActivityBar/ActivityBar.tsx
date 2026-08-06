import { useEffect, useState, type ReactNode } from "react";
import "./ActivityBar.css";
export interface ActivityBarButton {
    id: string;
    label: string;
    title?: string;
    icon?: ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
}
interface ActivityBarProps {
    buttons: ActivityBarButton[];
    pinnedButtons?: ActivityBarButton[];
    mobilePrimaryButtons?: ActivityBarButton[];
    mobileOverflowButtons?: ActivityBarButton[];
    ariaLabel?: string;
}
function useDesktopActivityBar(): boolean {
    const [isDesktop, setIsDesktop] = useState(() => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return true;
        }
        return window.matchMedia("(min-width: 768px)").matches;
    });
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return;
        }
        const media = window.matchMedia("(min-width: 768px)");
        const update = () => setIsDesktop(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return isDesktop;
}
function renderButton(button: ActivityBarButton) {
    return (<button key={button.id} type="button" className={`site-activity-bar__btn${button.active ? " is-active" : ""}`} title={button.title ?? button.label} aria-label={button.label} disabled={button.disabled} onClick={button.onClick}>
      {button.icon ?? <span className="site-activity-bar__label">{button.label}</span>}
    </button>);
}
export function ActivityBar({ buttons, pinnedButtons = [], mobilePrimaryButtons, mobileOverflowButtons, ariaLabel = "Page actions", }: ActivityBarProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isDesktop = useDesktopActivityBar();
    const hasMobileSplit = Boolean(mobilePrimaryButtons?.length && mobileOverflowButtons?.length);
    const useMobileSplit = hasMobileSplit && !isDesktop;
    function handleOverflowClick(button: ActivityBarButton) {
        button.onClick();
        setMobileMenuOpen(false);
    }
    return (<aside className={`site-activity-bar${mobileMenuOpen ? " is-mobile-menu-open" : ""}`} role="toolbar" aria-label={ariaLabel}>
      {useMobileSplit && mobileMenuOpen ? (<div className="site-activity-bar__mobile-tray" role="dialog" aria-label="More actions">
          <div className="site-activity-bar__mobile-tray-inner">
            {mobileOverflowButtons!.map((button) => renderButton({ ...button, onClick: () => handleOverflowClick(button) }))}
          </div>
        </div>) : null}

      <div className="site-activity-bar__shell">
        {pinnedButtons.length > 0 ? (<div className="site-activity-bar__pinned" aria-label="Primary actions">
            {pinnedButtons.map(renderButton)}
          </div>) : null}

        {useMobileSplit ? (<>
            <div className="site-activity-bar__mobile-primary" aria-label="Primary tools">
              {mobilePrimaryButtons!.map(renderButton)}
            </div>
            <button type="button" className={`site-activity-bar__menu-btn${mobileMenuOpen ? " is-active" : ""}`} aria-label={mobileMenuOpen ? "Close menu" : "More actions"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
              Menu
            </button>
          </>) : (<div className="site-activity-bar__deck" aria-label="Page tools">
            {buttons.map(renderButton)}
          </div>)}
      </div>
    </aside>);
}
export default ActivityBar;
