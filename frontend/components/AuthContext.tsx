"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type DemoRole = "citizen" | "policymaker";
export type DemoUser = { name: string; email: string; role: DemoRole };

const KEY = "jansetu-demo-user";

type AuthCtx = {
  user: DemoUser | null | undefined; // undefined = still loading
  signin: (email: string, password: string) => string | null; // returns error or null
  signup: (name: string, email: string, password: string, confirm: string, role: DemoRole) => string | null;
  signout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DemoUser | null | undefined>(undefined);

  useEffect(() => {
    // One-time client hydration of the demo session (no server equivalent).
    let initial: DemoUser | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      initial = raw ? (JSON.parse(raw) as DemoUser) : null;
    } catch {
      initial = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(initial);
  }, []);

  function persist(u: DemoUser | null) {
    setUser(u);
    try {
      if (u) localStorage.setItem(KEY, JSON.stringify(u));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable — session-only */
    }
  }

  function signin(email: string, password: string): string | null {
    if (!validEmail(email)) return "Enter a valid email address.";
    if (password.length < 4) return "Password must be at least 4 characters.";
    try {
      const raw = localStorage.getItem(KEY);
      const prev = raw ? (JSON.parse(raw) as DemoUser) : null;
      if (prev && prev.email.toLowerCase() === email.trim().toLowerCase()) {
        persist(prev);
        return null;
      }
    } catch {
      /* ignore */
    }
    persist({ name: "", email: email.trim(), role: "citizen" });
    return null;
  }

  function signup(name: string, email: string, password: string, confirm: string, role: DemoRole): string | null {
    if (name.trim().length < 2) return "Enter your name.";
    if (!validEmail(email)) return "Enter a valid email address.";
    if (password.length < 4) return "Password must be at least 4 characters.";
    if (password !== confirm) return "Passwords do not match.";
    if (role !== "citizen" && role !== "policymaker") return "Choose a valid role.";
    persist({ name: name.trim(), email: email.trim(), role });
    return null;
  }

  return <Ctx.Provider value={{ user, signin, signup, signout: () => persist(null) }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
