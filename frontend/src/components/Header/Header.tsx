import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import { AUTH_SESSION_EXPIRED_EVENT, getAuthToken, isAuthenticated, logoutUser, } from "../../lib/auth";
import { fetchUserProfile, PROFILE_IMAGE_UPDATED_EVENT } from "../../lib/profile";
import "./Header.css";
function profileInitialFromToken(token: string): string {
    try {
        const parts = token.split(".");
        if (parts.length < 2)
            return "?";
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson) as {
            sub?: string;
        };
        const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
        const letter = sub.charAt(0);
        return letter ? letter.toUpperCase() : "?";
    }
    catch {
        return "?";
    }
}
interface HeaderProps {
    pathname: string;
}
const NAV_LINKS = [
    { href: APP_ROUTES.home, label: "Home" },
    { href: APP_ROUTES.mediaPlaylist, label: "Playlist" },
    { href: APP_ROUTES.pamphlet, label: "Panfleto" },
    { href: APP_ROUTES.apsAdmin, label: "APS" },
    { href: APP_ROUTES.subscription, label: "Subscribe" },
] as const;
interface AccountMenuProps {
    initial: string;
    profileImageUrl: string;
    onLogout: () => void;
}
function AccountMenu({ initial, profileImageUrl, onLogout }: AccountMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        function handlePointerDown(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [open]);
    return (<div className="site-header__account" ref={rootRef}>
      <button type="button" className="site-header__profile" title="Account" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {profileImageUrl ? (<img className="site-header__profile-img" src={profileImageUrl} alt=""/>) : (initial)}
      </button>
      {open ? (<div className="site-header__account-menu" role="menu" aria-label="Account actions">
          <a className="site-header__account-menu-item" role="menuitem" href={APP_ROUTES.subscription} onClick={() => setOpen(false)}>
            Subscribe
          </a>
          <a className="site-header__account-menu-item" role="menuitem" href={APP_ROUTES.profile} onClick={() => setOpen(false)}>
            Profile image
          </a>
          <button type="button" className="site-header__account-menu-item" role="menuitem" onClick={() => {
                setOpen(false);
                onLogout();
            }}>
            Log out
          </button>
        </div>) : null}
    </div>);
}
interface LoggedOutActionsProps {
    loginClassName?: string;
    onNavigate?: () => void;
}
function LoggedOutActions({ loginClassName = "", onNavigate }: LoggedOutActionsProps) {
    return (<>
      <a className="site-header__auth-link" href={APP_ROUTES.register} onClick={onNavigate}>
        Register
      </a>
      <a className={`site-header__action btn btn--primary${loginClassName ? ` ${loginClassName}` : ""}`} href={APP_ROUTES.login} onClick={onNavigate}>
        Log in
      </a>
    </>);
}
interface AuthControlsProps {
    loggedIn: boolean;
    profileInitial: string;
    profileImageUrl: string;
    onLogout: () => void;
    onNavigate?: () => void;
    variant: "bar" | "nav";
}
function AuthControls({ loggedIn, profileInitial, profileImageUrl, onLogout, onNavigate, variant }: AuthControlsProps) {
    let content: ReactNode;
    if (loggedIn) {
        content = <AccountMenu initial={profileInitial} profileImageUrl={profileImageUrl} onLogout={onLogout}/>;
    }
    else {
        content = <LoggedOutActions onNavigate={onNavigate}/>;
    }
    return (<div className={`site-header__auth site-header__auth--${variant}`}>
      {content}
    </div>);
}
export function Header({ pathname }: HeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [loggedIn, setLoggedIn] = useState(false);
    const [profileInitial, setProfileInitial] = useState("");
    const [profileImageUrl, setProfileImageUrl] = useState("");
    const [clientReady, setClientReady] = useState(false);
    const headerRef = useRef<HTMLElement>(null);
    function navClass(href: string) {
        if (href === APP_ROUTES.home) {
            return pathname === "/" ? "is-active" : "";
        }
        return pathname === href || pathname.startsWith(`${href}/`)
            ? "is-active"
            : "";
    }
    function closeMenu() {
        setMenuOpen(false);
    }
    function toggleMenu() {
        setMenuOpen((open) => !open);
    }
    function syncAuthState() {
        const authed = isAuthenticated();
        setLoggedIn(authed);
        const token = getAuthToken();
        setProfileInitial(authed && token ? profileInitialFromToken(token) : "");
        if (!authed) {
            setProfileImageUrl("");
            return;
        }
        void fetchUserProfile().then((profile) => {
            setProfileImageUrl(profile?.profileImageUrl ?? "");
        });
    }
    async function handleLogout() {
        closeMenu();
        await logoutUser();
        syncAuthState();
        window.location.replace(APP_ROUTES.login);
    }
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);
    useEffect(() => {
        const syncHeaderHeight = () => {
            const height = headerRef.current?.offsetHeight ?? 50;
            document.documentElement.style.setProperty("--header_height", `${height}px`);
        };
        syncHeaderHeight();
        window.addEventListener("resize", syncHeaderHeight);
        return () => window.removeEventListener("resize", syncHeaderHeight);
    }, [menuOpen, pathname, loggedIn]);
    useEffect(() => {
        setClientReady(true);
        syncAuthState();
    }, [pathname]);
    useEffect(() => {
        function handleProfileImageUpdated(event: Event) {
            const detail = (event as CustomEvent<{
                profileImageUrl?: string;
            }>).detail;
            const nextUrl = detail?.profileImageUrl?.trim() ?? "";
            if (nextUrl) {
                setProfileImageUrl(nextUrl);
            }
        }
        window.addEventListener(PROFILE_IMAGE_UPDATED_EVENT, handleProfileImageUpdated);
        return () => window.removeEventListener(PROFILE_IMAGE_UPDATED_EVENT, handleProfileImageUpdated);
    }, []);
    useEffect(() => {
        function handleAuthSessionExpired() {
            syncAuthState();
        }
        window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
        return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
    }, []);
    const showAuth = clientReady;
    return (<header ref={headerRef} className={`site-header${menuOpen ? " site-header--open" : ""}`}>
      <a className={`site-header__brand${pathname === "/" ? " is-active" : ""}`} href={APP_ROUTES.home} onClick={closeMenu}>
        eduardoos
      </a>
      <div className="site-header__bar">
        <div className="site-header__bar-spacer" aria-hidden="true"/>
        {showAuth ? (<AuthControls variant="bar" loggedIn={loggedIn} profileInitial={profileInitial} profileImageUrl={profileImageUrl} onLogout={() => void handleLogout()} onNavigate={closeMenu}/>) : null}
        <button type="button" className="site-header__menu" aria-expanded={menuOpen} aria-controls="site-header-nav" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={toggleMenu}>
          Menu
        </button>
      </div>
      <nav id="site-header-nav" className="site-header__nav" aria-label="Main">
        {NAV_LINKS.map(({ href, label }) => (
          <a
            key={href}
            className={navClass(href)}
            href={href}
            {...(href === APP_ROUTES.apsAdmin ? { "data-astro-reload": true } : {})}
            onClick={closeMenu}
          >
            {label}
          </a>
        ))}
        {showAuth ? (
          <AuthControls
            variant="nav"
            loggedIn={loggedIn}
            profileInitial={profileInitial}
            profileImageUrl={profileImageUrl}
            onLogout={() => void handleLogout()}
            onNavigate={closeMenu}
          />
        ) : null}
      </nav>
    </header>);
}
export default Header;
