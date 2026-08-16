/**
 * Site header: primary nav (Home, Contact, OpenBIM, APS) + Services dropdown
 * matching production information architecture.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_ROUTES } from "../../config/routes";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  getAuthToken,
  isAuthenticated,
  logoutUser,
} from "../../lib/auth";
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

const PRIMARY_LINKS = [
  { href: APP_ROUTES.home, label: "Home" },
  { href: APP_ROUTES.contact, label: "Contact" },
  { href: APP_ROUTES.bim, label: "OpenBIM" },
  { href: APP_ROUTES.apsAdmin, label: "APS" },
] as const;

const SERVICES_LINKS = [
  { href: APP_ROUTES.homescool, label: "Homescool" },
  { href: APP_ROUTES.mediaPlaylist, label: "Music" },
  { href: APP_ROUTES.pamphlet, label: "Pamphlet" },
  { href: APP_ROUTES.articles, label: "Articles" },
  { href: APP_ROUTES.mediaGallery, label: "Videos" },
  { href: APP_ROUTES.debateApp, label: "Debate App" },
  { href: APP_ROUTES.subscription, label: "Subscribe" },
] as const;

interface AccountMenuProps {
  initial: string;
  onLogout: () => void;
}

function AccountMenu({ initial, onLogout }: AccountMenuProps) {
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
        {initial}
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
  onLogout: () => void;
  onNavigate?: () => void;
  variant: "bar" | "nav";
}

function AuthControls({
  loggedIn,
  profileInitial,
  onLogout,
  onNavigate,
  variant,
}: AuthControlsProps) {
  let content: ReactNode;
  if (loggedIn) {
    content = <AccountMenu initial={profileInitial} onLogout={onLogout} />;
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
        Services
        <span className="site-header__services-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div
          id="site-header-services-menu"
          className="site-header__services-menu"
          role="menu"
          aria-label="Services"
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

export function Header({ pathname }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileInitial, setProfileInitial] = useState("");
  const [clientReady, setClientReady] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
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
      const height = headerRef.current?.offsetHeight ?? 55;
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
    function handleAuthSessionExpired() {
      syncAuthState();
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
    return () =>
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthSessionExpired);
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
    <header ref={headerRef} className={`site-header${menuOpen ? " site-header--open" : ""}`}>
      <div className="site-header__bar">
        <div className="site-header__bar-spacer" aria-hidden="true" />
        {showAuth ? (
          <AuthControls
            variant="bar"
            loggedIn={loggedIn}
            profileInitial={profileInitial}
            onLogout={() => void handleLogout()}
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
          Menu
        </button>
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
        {PRIMARY_LINKS.map(({ href, label }) => (
          <a key={href} className={navClass(href)} href={href} onClick={closeMenu}>
            {label}
          </a>
        ))}
        <ServicesMenu pathname={pathname} navClass={navClass} onNavigate={closeMenu} />
        {showAuth ? (
          <AuthControls
            variant="nav"
            loggedIn={loggedIn}
            profileInitial={profileInitial}
            onLogout={() => void handleLogout()}
            onNavigate={closeMenu}
          />
        ) : null}
      </nav>
    </header>
  );
}

export default Header;
