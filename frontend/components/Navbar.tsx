"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { useTheme } from "@/components/ThemeContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LINKS = [
  ["Overview", "/"],
  ["Citizen Voice", "/citizen"],
  ["Civic Intelligence", "/dashboard"],
  ["Hotspots", "/hotspots"],
  ["Simulator", "/simulator"],
] as const;

export default function Navbar() {
  const path = usePathname();
  const { user, signout } = useAuth();
  const { theme, mounted, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiLive, setAiLive] = useState<boolean | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => setAiLive(h ? !!h.ai_configured : null))
      .catch(() => setAiLive(null));
  }, []);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b border-white/10 bg-[#0A0A0B]/85 text-zinc-200 backdrop-blur-md transition-shadow duration-200 ${compact ? "shadow-[0_12px_40px_rgba(0,0,0,0.45)]" : ""}`}>
      <div className="mx-auto flex h-20 w-full max-w-[1360px] items-center gap-x-6 px-5 md:px-8 min-[1440px]:px-10">
        <Link href="/" className="leading-tight" aria-label="JanSetu home">
          <span className="block text-base font-bold tracking-[0.22em] text-white">JANSETU<span className="text-[#F5B400]">.</span></span>
          <span className="block text-[11px] tracking-wide text-zinc-500">AI Civic Intelligence for India</span>
        </Link>
        <nav className="hidden items-center gap-x-6 text-sm md:flex" aria-label="Primary">
          {LINKS.map(([label, href]) => (
            <Link key={href + label} href={href}
              aria-current={path === href ? "page" : undefined}
              className={`relative py-1.5 transition-colors duration-150 hover:text-white after:absolute after:bottom-0 after:left-0 after:h-0.5 after:rounded-full after:transition-all after:duration-200 ${path === href ? "font-semibold text-white after:w-full after:bg-[#F5B400]" : "text-zinc-400 after:w-0 after:bg-zinc-300 hover:after:w-full"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] tracking-wide text-zinc-400" title={aiLive == null ? "Backend unreachable" : aiLive ? "Live Gemini configured" : "Demo fallback active"}>
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${aiLive == null ? "bg-zinc-600" : aiLive ? "bg-green-500" : "bg-[#F5B400]"}`} />
            AI SYSTEM {aiLive == null ? "UNKNOWN" : aiLive ? "LIVE" : "FALLBACK"}
          </span>
          <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] tracking-wide text-zinc-400">Demo Mode</span>
          <button
            onClick={toggle}
            title="Switch theme"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-all duration-200 hover:border-[#F5B400]/60 hover:text-[#F5B400]"
          >
            {mounted ? (
              theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <span className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-white/10">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5B400] text-xs font-semibold text-black" aria-hidden="true">
                  {(user.name || "?").charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-zinc-300">Hi, {user.name || "there"}</span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-white/10 bg-[#14161B] p-4 text-sm text-zinc-200 shadow-[0_16px_50px_rgba(0,0,0,0.5)]">
                  <p className="font-semibold text-white">{user.name || "Demo user"}</p>
                  <p className="mt-0.5 break-all text-xs text-zinc-500">{user.email}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Role: {user.role === "policymaker" ? "Policymaker / Analyst" : "Citizen"}</p>
                  <button onClick={() => { signout(); setMenuOpen(false); }}
                    className="mt-3 w-full rounded-md border border-white/15 px-3 py-2 transition-colors hover:bg-white/10">
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/signin" className="text-sm text-zinc-300 transition-colors hover:text-white">Sign in</Link>
              <Link href="/citizen" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-all duration-200 hover:-translate-y-px hover:bg-zinc-200 hover:shadow-[0_8px_24px_rgba(245,180,0,0.25)]">Report a Need</Link>
            </>
          )}
        </div>
        <button className="ml-auto rounded-md border border-white/15 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/10 md:hidden" aria-label="Open menu"
          aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
      </div>
      {open && (
        <nav className="border-t border-white/10 bg-[#0A0A0B] px-6 py-4 md:hidden" aria-label="Mobile">
          <ul className="space-y-3 text-sm">
            {LINKS.map(([label, href]) => (
              <li key={href + label}>
                <Link href={href} onClick={() => setOpen(false)}
                  aria-current={path === href ? "page" : undefined}
                  className={path === href ? "font-semibold text-white underline decoration-[#F5B400] underline-offset-4" : "text-zinc-400"}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-2 rounded-md border border-white/15 px-4 py-2 text-sm text-zinc-200"
            >
              {mounted && theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {user ? (
              <>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F5B400] text-xs font-semibold text-black" aria-hidden="true">
                  {(user.name || "?").charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-zinc-300">Hi, {user.name || "there"}</span>
                <button onClick={() => { signout(); setOpen(false); }} className="rounded-md border border-white/15 px-4 py-2 text-sm text-zinc-200">Sign out</button>
              </>
            ) : (
              <>
                <Link href="/signin" onClick={() => setOpen(false)} className="rounded-md border border-white/15 px-4 py-2 text-sm text-zinc-200">Sign in</Link>
                <Link href="/citizen" onClick={() => setOpen(false)} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black">Report a Need</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
