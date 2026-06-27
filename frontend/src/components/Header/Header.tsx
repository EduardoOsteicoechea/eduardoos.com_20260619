/**
 * Header.tsx — Fixed chrome: eduardoos home brand, nav links, mobile expandable menu.
 */
import { useEffect, useRef, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import "./Header.css";

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
      </nav>
    </header>
  );
}

export default Header;
