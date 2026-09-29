"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "jansetu-theme";

type ThemeCtx = {
  theme: Theme;
  mounted: boolean;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // NOTE: the lazy initializer below runs during SSR (returns "light") and
  // React reuses SSR state on hydration — it does NOT re-run on the client.
  // The mount effect below performs the real client-side sync. Rendered
  // output never depends on `theme` before `mounted`, so this cannot
  // cause a hydration mismatch.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const next = readStoredTheme();
    document.documentElement.classList.toggle("dark", next === "dark");
    // One-time client hydration of the persisted theme (no server equivalent).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(next);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    // Event handler, not an effect.
    setTheme(next);
  }

  return <Ctx.Provider value={{ theme, mounted, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
