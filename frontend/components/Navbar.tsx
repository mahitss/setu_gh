"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

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
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl items-center gap-x-6 px-6 py-3 md:px-10">
        <Link href="/" className="leading-tight" aria-label="JanSetu home">
          <span className="block text-base font-bold tracking-widest">JANSETU</span>
          <span className="block text-[11px] text-zinc-500">AI Civic Intelligence for India</span>
        </Link>
        <nav className="hidden items-center gap-x-5 text-sm md:flex" aria-label="Primary">
          {LINKS.map(([label, href]) => (
            <Link key={href + label} href={href}
              aria-current={path === href ? "page" : undefined}
              className={`relative py-1 transition-colors duration-150 hover:text-black after:absolute after:bottom-0 after:left-0 after:h-px after:bg-current after:transition-all after:duration-200 ${path === href ? "font-semibold text-black after:w-full" : "text-zinc-600 after:w-0 hover:after:w-full"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="rounded border px-2 py-0.5 text-[11px] text-zinc-500">Demo Mode</span>
          {user ? (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white" aria-hidden="true">
                {(user.name || "?").charAt(0).toUpperCase()}
              </span>
              <span className="text-sm text-zinc-600">Hi, {user.name || "there"}</span>
              <button onClick={signout} className="rounded-md border px-3 py-2 text-sm">Sign out</button>
            </>
          ) : (
            <>
              <Link href="/signin" className="text-sm hover:underline">Sign in</Link>
              <Link href="/citizen" className="rounded-md bg-black px-4 py-2 text-sm text-white">Report a Need</Link>
            </>
          )}
        </div>
        <button className="ml-auto rounded-md border px-3 py-2 text-sm md:hidden" aria-label="Open menu"
          aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
      </div>
      {open && (
        <nav className="border-t px-6 py-4 md:hidden" aria-label="Mobile">
          <ul className="space-y-3 text-sm">
            {LINKS.map(([label, href]) => (
              <li key={href + label}>
                <Link href={href} onClick={() => setOpen(false)}
                  aria-current={path === href ? "page" : undefined}
                  className={path === href ? "font-semibold underline underline-offset-4" : undefined}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            {user ? (
              <>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white" aria-hidden="true">
                  {(user.name || "?").charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-zinc-600">Hi, {user.name || "there"}</span>
                <button onClick={() => { signout(); setOpen(false); }} className="rounded-md border px-4 py-2 text-sm">Sign out</button>
              </>
            ) : (
              <>
                <Link href="/signin" onClick={() => setOpen(false)} className="rounded-md border px-4 py-2 text-sm">Sign in</Link>
                <Link href="/citizen" onClick={() => setOpen(false)} className="rounded-md bg-black px-4 py-2 text-sm text-white">Report a Need</Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
