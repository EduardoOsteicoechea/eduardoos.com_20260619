/**
 * Header.tsx — Fixed site chrome with nav links and theme toggle.
 */
import { useEffect, useState } from "react";
import { APP_ROUTES } from "../../config/routes";
import "./Header.css";

interface HeaderProps {
  pathname: string;
}

type Theme = "light" | "dark";

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export function Header({ pathname }: HeaderProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("eduardoos-theme") as Theme | null;
      const prefersDark =
        stored === "dark" ||
        (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
      setDark(prefersDark);
      applyTheme(prefersDark);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
    try {
      localStorage.setItem("eduardoos-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  function navClass(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
      ? "is-active"
      : "";
  }

  return (
    <header className="site-header">
      <a className="site-header__brand" href={APP_ROUTES.home}>
        Eduardo Osteicoechea
      </a>
      <nav className="site-header__nav" aria-label="Main">
        <a className={navClass(APP_ROUTES.login)} href={APP_ROUTES.login}>
          Login
        </a>
        <a
          className={navClass(APP_ROUTES.register)}
          href={APP_ROUTES.register}
        >
          Register
        </a>
        <a className={navClass(APP_ROUTES.logger)} href={APP_ROUTES.logger}>
          Logger
        </a>
        <a className={navClass(APP_ROUTES.tester)} href={APP_ROUTES.tester}>
          Tester
        </a>
        <button
          type="button"
          className="site-header__theme"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {dark ? "Light" : "Dark"}
        </button>
      </nav>
    </header>
  );
}

export default Header;
