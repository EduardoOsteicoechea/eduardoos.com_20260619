/**
 * Header.tsx — Fixed chrome: eduardoos home brand, nav links, mobile expandable menu.
 */
import { useEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import { getAuthToken, logoutUser } from "../../lib/auth";
import "./Header.css";

/** Returns the uppercase first letter of the email from a JWT sub claim. */
function profileInitialFromToken(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return "?";
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { sub?: string };
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    const email = sub.includes("@") ? sub : sub;
    const letter = email.charAt(0);
    return letter ? letter.toUpperCase() : "?";
  } catch {
    return "?";
  }
}

interface HeaderProps {
  pathname: string;
}

const NAV_LINKS = [
  { href: APP_ROUTES.home, label: "Home" },
  { href: APP_ROUTES.login, label: "Login" },
  { href: APP_ROUTES.register, label: "Register" },
  { href: APP_ROUTES.logger, label: "Logger" },
  { href: APP_ROUTES.tester, label: "Tester" },
  { href: APP_ROUTES.mediaGallery, label: "Media" },
  { href: APP_ROUTES.mediaPlaylist, label: "Playlist" },
  { href: APP_ROUTES.pamphlet, label: "Pamphlet" },
  { href: APP_ROUTES.subscriptionMonthlyBasic, label: "Subscribe" },
] as const;

export function Header({ pathname }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileInitial, setProfileInitial] = useState("");
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

  async function handleLogout() {
    closeMenu();
    await logoutUser();
    setProfileInitial("");
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
  }, [menuOpen, pathname]);

  useEffect(() => {
    setClientReady(true);
    const token = getAuthToken();
    setProfileInitial(token ? profileInitialFromToken(token) : "");
  }, [pathname]);

  return (
    <header
      ref={headerRef}
      className={`site-header${menuOpen ? " site-header--open" : ""}`}
    >
      <a
        className={`site-header__brand${pathname === "/" ? " is-active" : ""}`}
        href={APP_ROUTES.home}
        onClick={closeMenu}
      >
        eduardoos
      </a>
      <div className="site-header__bar">
        {clientReady && profileInitial ? (
          <>
            <a
              className="site-header__profile"
              href={APP_ROUTES.home}
              title="Account"
              aria-label="Account home"
              onClick={closeMenu}
            >
              {profileInitial}
            </a>
            <button
              type="button"
              className="site-header__logout"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="site-header__menu"
          aria-expanded={menuOpen}
          aria-controls="site-header-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={toggleMenu}
        >
          Menu
        </button>
      </div>
      <nav
        id="site-header-nav"
        className="site-header__nav"
        aria-label="Main"
      >
        {NAV_LINKS.map(({ href, label }) => (
          <a
            key={href}
            className={navClass(href)}
            href={href}
            onClick={closeMenu}
          >
            {label}
          </a>
        ))}
        {clientReady && profileInitial ? (
          <>
            <a
              className={`site-header__profile site-header__profile--nav${pathname === APP_ROUTES.home ? " is-active" : ""}`}
              href={APP_ROUTES.home}
              title="Account"
              aria-label="Account home"
              onClick={closeMenu}
            >
              {profileInitial}
            </a>
            <button
              type="button"
              className="site-header__logout site-header__logout--nav"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          </>
        ) : null}
      </nav>
    </header>
  );
}

export default Header;
