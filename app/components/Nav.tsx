"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Standings" },
  { href: "/games", label: "Games" },
  { href: "/bracket", label: "Bracket" },
  { href: "/wins", label: "Win Totals" },
  { href: "/elo", label: "Elo Ratings" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.getAttribute("data-theme") === "dark"); }, []);
  function toggle() {
    const next = !dark; setDark(next);
    if (next) { document.documentElement.setAttribute("data-theme", "dark"); localStorage.setItem("theme", "dark"); }
    else { document.documentElement.removeAttribute("data-theme"); localStorage.setItem("theme", "light"); }
  }
  return (
    <button onClick={toggle} aria-label="Toggle dark mode"
      className="w-8 h-8 flex items-center justify-center rounded-full text-s-muted hover:text-s-text hover:bg-s-hover transition-colors">
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="border-b border-s-border sticky top-0 z-50" style={{ backgroundColor: "var(--color-surface)" }}>
      <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-3 h-12">
        <ThemeToggle />
        <div className="h-5 w-px bg-s-border hidden sm:block" />
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/samalytics_ncaaf_logo.png" alt="Samalytics NCAAF" width={30} height={30} className="object-contain" />
          <div className="flex flex-col leading-none">
            <span className="font-orbitron font-black tracking-wider" style={{ fontSize: "0.8rem", color: "var(--color-accent)" }}>SAMALYTICS</span>
            <span className="font-bold text-s-muted tracking-widest uppercase hidden sm:block" style={{ fontSize: "0.55rem" }}>NCAAF ENGINE</span>
          </div>
        </Link>
        <div className="h-5 w-px bg-s-border hidden sm:block" />

        {/* desktop links */}
        <nav className="hidden sm:flex items-center gap-0.5 flex-1">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href}
              className={clsx("px-3 py-1 rounded-lg text-xs font-semibold tracking-wide uppercase transition-colors whitespace-nowrap",
                isActive(href) ? "text-white" : "text-s-muted hover:text-s-text")}
              style={isActive(href) ? { backgroundColor: "var(--color-accent)" } : undefined}>
              {label}
            </Link>
          ))}
        </nav>

        {/* mobile hamburger */}
        <button className="sm:hidden ml-auto w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-s-hover"
          onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"}>
          <span className={clsx("block h-0.5 w-5 bg-s-text transition-all", open && "translate-y-2 rotate-45")} />
          <span className={clsx("block h-0.5 w-5 bg-s-text transition-all", open && "opacity-0")} />
          <span className={clsx("block h-0.5 w-5 bg-s-text transition-all", open && "-translate-y-2 -rotate-45")} />
        </button>
      </div>

      {/* mobile dropdown */}
      {open && (
        <nav className="sm:hidden border-t border-s-border" style={{ backgroundColor: "var(--color-surface)" }}>
          <div className="max-w-screen-xl mx-auto px-2 py-2 grid grid-cols-2 gap-1">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href}
                className={clsx("px-3 py-2.5 rounded-lg text-sm font-semibold tracking-wide uppercase text-center transition-colors",
                  isActive(href) ? "text-white" : "text-s-muted hover:text-s-text hover:bg-s-hover")}
                style={isActive(href) ? { backgroundColor: "var(--color-accent)" } : undefined}>
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
