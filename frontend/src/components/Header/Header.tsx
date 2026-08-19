/**
 * Site chrome: desktop left rail (60px) + mobile top bar.
 * Desktop rail (top → bottom): logo → menu → avatar → separator → Header
 * Dynamic Menu (per-route tools, e.g. Pamphlet). Mobile bar: logo left,
 * dynamic section centered, avatar then menu on the right. Hamburger opens
 * the nav tray from the left (after the 60px rail on desktop). Tray chrome
 * (A+ / A− / theme / close) sits in a top toolbar; Services and auth links
 * follow. Music keeps the bottom Activity Bar and does not register a
 * dynamic header section.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  getAuthToken,
  isPlatformAdmin,
  isAuthenticated,
  logoutUser,
} from "../../lib/auth";
import {
  fetchUserProfile,
  PROFILE_IMAGE_UPDATED_EVENT,
  resolveProfileImageUrl,
} from "../../lib/profile";
import { applyTheme, resolveTheme, toggleTheme, type SiteTheme } from "../../lib/theme";
import { applyUiScale, bumpUiScale, resolveUiScale, type UiScale } from "../../lib/uiScale";
import HeaderDynamicMenu from "../HeaderDynamicMenu/HeaderDynamicMenu";
import "./Header.css";

function profileInitialFromToken(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return "?";
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { sub?: string };
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const letter = sub.charAt(0);
    return letter ? letter.toUpperCase() : "?";
  } catch {
    return "?";
  }
}

interface HeaderProps {
  pathname: string;
}

/** Home is the logo; omit a redundant "Home" row in the tray.
 * OpenBIM / APS stay reachable by URL but are hidden from the main tray for now. */
const PRIMARY_LINKS = [
  { href: APP_ROUTES.contact, label: "Contact" },
] as const;

const SERVICES_LINKS = [
  { href: APP_ROUTES.homescool, label: "Homescool" },
  { href: APP_ROUTES.church, label: "Church" },
  // Greek hidden from Services nav for now (routes/API remain for direct admin use).
  { href: APP_ROUTES.mediaPlaylist, label: "Music" },
  { href: APP_ROUTES.pamphlet, label: "Pamphlet" },
  { href: APP_ROUTES.articles, label: "Articles" },
  // Videos / Debate App / Instrumentalist / Subscribe hidden for now (URLs stay live).
] as const;

interface AccountMenuProps {
  initial: string;
  profileImageUrl: string;
  onLogout: () => void;
  onProfileImageBroken: () => void;
}

function AccountMenu({
  initial,
  profileImageUrl,
  onLogout,
  onProfileImageBroken,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="site-header__account" ref={rootRef}>
      <button
        type="button"
        className="site-header__profile"
        title="Account"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {profileImageUrl ? (
          <img
            className="site-header__profile-img"
            src={profileImageUrl}
            alt=""
            width={36}
            height={36}
            decoding="async"
            onError={onProfileImageBroken}
          />
        ) : (
          <span className="site-header__profile-initial" aria-hidden="true">
            {initial || "?"}
          </span>
        )}
      </button>
      {open ? (
        <div className="site-header__account-menu" role="menu" aria-label="Account actions">
          <a
            className="site-header__account-menu-item"
            role="menuitem"
            href={APP_ROUTES.subscription}
            onClick={() => setOpen(false)}
          >
            Subscribe
          </a>
          <a
            className="site-header__account-menu-item"
            role="menuitem"
            href={APP_ROUTES.profile}
            onClick={() => setOpen(false)}
          >
            Profile
          </a>
          <button
            type="button"
            className="site-header__account-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface LoggedOutActionsProps {
  onNavigate?: () => void;
}

function LoggedOutActions({ onNavigate }: LoggedOutActionsProps) {
  return (
    <>
      <a className="site-header__auth-link" href={APP_ROUTES.register} onClick={onNavigate}>
        Register
      </a>
      <a
        className="site-header__action btn btn--primary"
        href={APP_ROUTES.login}
        onClick={onNavigate}
      >
        Log in
      </a>
    </>
  );
}

interface AuthControlsProps {
  loggedIn: boolean;
  profileInitial: string;
  profileImageUrl: string;
  onLogout: () => void;
  onProfileImageBroken: () => void;
  onNavigate?: () => void;
  variant: "bar" | "nav";
}

function AuthControls({
  loggedIn,
  profileInitial,
  profileImageUrl,
  onLogout,
  onProfileImageBroken,
  onNavigate,
  variant,
}: AuthControlsProps) {
  let content: ReactNode;
  if (loggedIn) {
    content = (
      <AccountMenu
        initial={profileInitial}
        profileImageUrl={profileImageUrl}
        onLogout={onLogout}
        onProfileImageBroken={onProfileImageBroken}
      />
    );
  } else {
    content = <LoggedOutActions onNavigate={onNavigate} />;
  }
  return <div className={`site-header__auth site-header__auth--${variant}`}>{content}</div>;
}

interface ServicesMenuProps {
  pathname: string;
  navClass: (href: string) => string;
  onNavigate: () => void;
}

function ServicesMenu({ pathname, navClass, onNavigate }: ServicesMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const servicesActive = SERVICES_LINKS.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="site-header__services" ref={rootRef}>
      <button
        type="button"
        className={`site-header__services-toggle${servicesActive ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls="site-header-services-menu"
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        Services Apps & Subscriptions
        <span className="site-header__services-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div
          id="site-header-services-menu"
          className="site-header__services-menu"
          role="menu"
          aria-label="Services Apps & Subscriptions"
        >
          {SERVICES_LINKS.map(({ href, label }) => (
            <a
              key={href}
              className={`site-header__services-item${navClass(href) ? ` ${navClass(href)}` : ""}`}
              role="menuitem"
              href={href}
              onClick={() => onNavigate()}
            >
              {label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="site-header__menu-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      {open ? (
        <path
          fill="currentColor"
          d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M4 7h16a1 1 0 1 0 0-2H4a1 1 0 0 0 0 2zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 0 0 0 2zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 0 0 0 2z"
        />
      )}
    </svg>
  );
}

export function Header({ pathname }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileInitial, setProfileInitial] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [clientReady, setClientReady] = useState(false);
  const [theme, setTheme] = useState<SiteTheme>("light");
  const [uiScale, setUiScale] = useState<UiScale>(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const trayRef = useRef<HTMLElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  function navClass(href: string) {
    if (href === APP_ROUTES.home) {
      return pathname === "/" ? "is-active" : "";
    }
    return pathname === href || pathname.startsWith(`${href}/`) ? "is-active" : "";
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function syncAuthState() {
    const authed = isAuthenticated();
    setLoggedIn(authed);
    const token = getAuthToken();
    setProfileInitial(authed && token ? profileInitialFromToken(token) : "");
    setIsAdmin(authed && isPlatformAdmin());
    if (!authed) {
      setProfileImageUrl("");
    }
  }

  async function loadProfileImage() {
    if (!isAuthenticated()) {
      setProfileImageUrl("");
      return;
    }
    const profile = await fetchUserProfile();
    const url = resolveProfileImageUrl(profile).trim();
    setProfileImageUrl(url);
  }

  async function handleLogout() {
    closeMenu();
    await logoutUser();
    setProfileImageUrl("");
    syncAuthState();
    window.location.replace(APP_ROUTES.login);
  }

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    /*
     * Sync width/height chrome tokens only. Never measure `.site-header`:
     * its children are position:fixed, so offsetHeight is 0 and previously
     * collapsed --header_height → bar height 0 → logo/menu clipped above the viewport.
     * Mobile bar height stays the CSS token (60px); --header_offset adds safe-area.
     */
    const syncChromeTokens = () => {
      const root = document.documentElement;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      if (isDesktop) {
        root.style.setProperty("--header_width", "60px");
        root.style.setProperty("--header_height", "0px");
        root.style.setProperty("--header_safe_top", "0px");
        root.style.setProperty("--header_offset", "0px");
      } else {
        root.style.setProperty("--header_width", "0px");
        root.style.removeProperty("--header_height");
        root.style.removeProperty("--header_safe_top");
        root.style.removeProperty("--header_offset");
      }
    };
    syncChromeTokens();
    window.addEventListener("resize", syncChromeTokens);
    return () => window.removeEventListener("resize", syncChromeTokens);
  }, [menuOpen, pathname, loggedIn]);

  useEffect(() => {
    setClientReady(true);
    syncAuthState();
    setTheme(resolveTheme());
    applyTheme(resolveTheme());
    const scale = resolveUiScale();
    setUiScale(scale);
    applyUiScale(scale);
    void loadProfileImage();
  }, [pathname]);

  useEffect(() => {
    function handleAuthSessionExpired() {
      syncAuthState();
      setProfileImageUrl("");
    }
    function handleProfileImageUpdated(event: Event) {
      const detail = (event as CustomEvent<{ profileImageUrl?: string }>).detail;
      const url = detail?.profileImageUrl?.trim() ?? "";
      if (url) setProfileImageUrl(url);
      else void loadProfileImage();
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
    window.addEventListener(PROFILE_IMAGE_UPDATED_EVENT, handleProfileImageUpdated);
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
      window.removeEventListener(PROFILE_IMAGE_UPDATED_EVENT, handleProfileImageUpdated);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (trayRef.current?.contains(target)) return;
      if (menuBtnRef.current?.contains(target)) return;
      closeMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const showAuth = clientReady;

  return (
    <header className={`site-header${menuOpen ? " site-header--open" : ""}`}>
      <div className="site-header__bar">
        <a className="site-header__logo" href={APP_ROUTES.home} aria-label="Eduardo OS home">
          <img className="site-header__logo-img" src="/favicon-48.png" alt="" width={28} height={28} />
        </a>
        {/*
          Mobile order: logo | dynamic (center) | bar-end.
          Desktop order (CSS order): logo | bar-end | dynamic (after avatar + sep).
          Pamphlet mounts tools here; Music does not register.
        */}
        <div className="site-header__dynamic-slot">
          <hr className="site-header__dynamic-sep" aria-hidden="true" />
          <HeaderDynamicMenu />
        </div>
        <div className="site-header__bar-end">
          {showAuth ? (
            <AuthControls
              variant="bar"
              loggedIn={loggedIn}
              profileInitial={profileInitial}
              profileImageUrl={profileImageUrl}
              onLogout={() => void handleLogout()}
              onProfileImageBroken={() => setProfileImageUrl("")}
              onNavigate={closeMenu}
            />
          ) : null}
          <button
            ref={menuBtnRef}
            type="button"
            className="site-header__menu"
            aria-expanded={menuOpen}
            aria-controls="site-header-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>
      <div
        className="site-header__backdrop"
        hidden={!menuOpen}
        aria-hidden="true"
        onClick={closeMenu}
      />
      <nav
        ref={trayRef}
        id="site-header-nav"
        className="site-header__nav"
        aria-label="Main"
        hidden={!menuOpen}
      >
        <div className="site-header__tray-toolbar" role="toolbar" aria-label="Tray controls">
          <button
            type="button"
            className="site-header__tray-btn"
            aria-label="Increase text size"
            title="Increase text size"
            onClick={() => setUiScale(bumpUiScale(1))}
          >
            <span className="site-header__tray-btn-label" aria-hidden="true">
              A+
            </span>
          </button>
          <button
            type="button"
            className="site-header__tray-btn"
            aria-label="Decrease text size"
            title="Decrease text size"
            onClick={() => setUiScale(bumpUiScale(-1))}
          >
            <span className="site-header__tray-btn-label" aria-hidden="true">
              A−
            </span>
          </button>
          <button
            type="button"
            className="site-header__tray-btn site-header__tray-btn--theme"
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => {
              const next = toggleTheme();
              setTheme(next);
            }}
          >
            <span className="site-header__tray-theme-icon" aria-hidden="true">
              {theme === "dark" ? "☀" : "☾"}
            </span>
          </button>
          <span className="site-header__tray-spacer" aria-hidden="true" />
          <button
            type="button"
            className="site-header__tray-btn site-header__tray-btn--close"
            aria-label="Close menu"
            title="Close menu"
            onClick={closeMenu}
          >
            <span className="site-header__tray-close-x" aria-hidden="true">
              ×
            </span>
          </button>
        </div>
        <span className="visually-hidden">Text scale {Math.round(uiScale * 100)}%</span>
        {PRIMARY_LINKS.map(({ href, label }) => (
          <a key={href} className={navClass(href)} href={href} onClick={closeMenu}>
            {label}
          </a>
        ))}
        <ServicesMenu pathname={pathname} navClass={navClass} onNavigate={closeMenu} />
        {isAdmin ? (
          <a
            className={navClass(APP_ROUTES.adminUsers)}
            href={APP_ROUTES.adminUsers}
            onClick={closeMenu}
          >
            Admin users
          </a>
        ) : null}
        {showAuth ? (
          <AuthControls
            variant="nav"
            loggedIn={loggedIn}
            profileInitial={profileInitial}
            profileImageUrl={profileImageUrl}
            onLogout={() => void handleLogout()}
            onProfileImageBroken={() => setProfileImageUrl("")}
            onNavigate={closeMenu}
          />
        ) : null}
      </nav>
    </header>
  );
}

export default Header;
