"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Map, { PRIORITY_TIER } from "@/components/Map";
import AskJanSetu from "@/components/AskJanSetu";
import { EmptyState } from "@/components/ui";
import RequireAuth from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { apiGet, fmtInt, fmtInr, hotspotHref, title, trendLabel } from "@/lib/api";
import type { EmergingHotspot, Hotspot, PulseItem, RecommendationOut, Summary, TopCategory } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRIORITIES = ["critical", "high", "medium", "low", "minimal"];

const TIER_STYLE: Record<string, string> = {
  P0: "bg-[#C93636]/15 text-[#C93636] dark:bg-[#F87171]/15 dark:text-[#F87171]",
  P1: "bg-[#F5B400]/15 text-[#8A5E00] dark:bg-[#F5B400]/15 dark:text-[#F5B400]",
  P2: "bg-[#303A8C]/10 text-[#303A8C] dark:bg-[#7C7CFF]/15 dark:text-[#A5A5FF]",
  P3: "bg-[var(--js-track)] text-[var(--js-muted)]",
};

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      done.current = true;
      io.disconnect();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setDisplay(value);
        return;
      }
      const dur = 1000;
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{format(display)}</span>;
}

function Reveal({ children, className, delay }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        el.classList.add("is-visible");
        io.disconnect();
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className ?? ""}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--js-track)] ${className}`} />;
}

function SectionHead({ eyebrow, title: t, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <Reveal>
      <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
        <span className="inline-block h-px w-8 bg-[var(--js-accent)]" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-[clamp(1.7rem,3vw,2.6rem)] font-semibold tracking-tight">{t}</h2>
      {sub && <p className="mt-2 max-w-2xl text-[15px] text-[var(--js-muted)]">{sub}</p>}
    </Reveal>
  );
}

function trendColor(p: PulseItem): string {
  if (p.status === "rising") return "text-[#C93636] dark:text-[#F87171]";
  if (p.status === "declining") return "text-[#138A52] dark:text-[#34D399]";
  return "text-[var(--js-muted)]";
}

/** Honest two-point momentum line: prior → current only, no invented history. */
function MiniTrend({ p }: { p: PulseItem }) {
  const W = 120, H = 34;
  const max = Math.max(p.previous_count, p.current_count, 1);
  const y = (v: number) => H - 4 - (v / max) * (H - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-9 w-full" aria-hidden="true" preserveAspectRatio="none">
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      <polyline
        points={`0,${y(p.previous_count)} ${W},${y(p.current_count)}`}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      />
      <circle cx={W - 1} cy={y(p.current_count)} r="3" fill="currentColor" />
    </svg>
  );
}

function whyBullets(h: Hotspot): [string, string][] {
  const f = h.factors;
  return [
    (f.demand_index ?? 0) >= 0.6 ? ["✓", "High citizen demand"] : ["○", "Moderate citizen demand"],
    h.trend_pct == null
      ? ["○", "Demand history still building"]
      : h.trend_pct > 5
        ? ["✓", `Increasing demand (${trendLabel(h.trend_pct)})`]
        : ["△", "Stable or easing demand"],
    (f.infra_gap ?? 0) >= 0.5 ? ["✓", "Low infrastructure coverage"] : ["△", "Coverage needs review"],
    (f.pop_impact ?? 0) >= 0.5 ? ["✓", `Large affected population (${fmtInt(h.population)})`] : ["○", "Concentrated population"],
    (f.invest_gap ?? 0) >= 0.5 ? ["✓", "Low existing investment"] : ["△", "Investment already present"],
  ];
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [emerging, setEmerging] = useState<EmergingHotspot[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [stateStats, setStateStats] = useState<StateStat[]>([]);
  const [fState, setFState] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selRec, setSelRec] = useState<RecommendationOut | null>(null);
  const [selSim, setSelSim] = useState<{
    label: string;
    scenario: { intervention: string; budget_cr: number };
    estimate: { population_reached: number; coverage_improvement: number; gap_reduction: number };
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadHotspots(signal: AbortSignal, filters: Record<string, string>) {
    const q = new URLSearchParams({ limit: "50" });
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const h = await apiGet<{ hotspots: Hotspot[] }>(`/api/v1/hotspots?${q}`, signal);
    setHotspots(h.hotspots);
  }

  function refetch(filters: { state: string; district: string; category: string; priority: string }) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFiltering(true);
    setSelRec(null);
    setSelSim(null);
    loadHotspots(ctrl.signal, filters)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setFiltering(false);
      });
  }

  function selectState(s: string) {
    setFState(s);
    setFDistrict("");
    refetch({ state: s, district: "", category: fCategory, priority: fPriority });
  }

  function selectHotspot(id: string) {
    setSelectedId(id);
    setSelRec(null);
    setSelSim(null);
  }

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiGet<Summary>("/api/v1/dashboard/summary", ctrl.signal),
      apiGet<{ pulse: PulseItem[]; emerging_hotspots: EmergingHotspot[] }>("/api/v1/civic-pulse", ctrl.signal),
      apiGet<{ hotspots: Hotspot[] }>("/api/v1/hotspots?limit=100", ctrl.signal),
    ])
      .then(([s, p, h]) => {
        setSummary(s);
        setPulse(p.pulse);
        setEmerging(p.emerging_hotspots ?? []);
        setHotspots(h.hotspots.slice(0, 50));
        const st = [...new Set(h.hotspots.map((x) => x.state))].sort();
        setStates(st);
        // Exact per-state aggregates: a state has ≤24 groups, one filtered call covers it fully.
        Promise.all(
          st.map((x) =>
            apiGet<{ hotspots: Hotspot[] }>(
              `/api/v1/hotspots?${new URLSearchParams({ state: x, limit: "50" })}`, ctrl.signal
            ).then((res) => {
              const rows = res.hotspots;
              const gaps = rows.map((g) => g.gap_index).filter((g): g is number => g != null);
              const byCat: Record<string, number> = {};
              rows.forEach((g) => {
                byCat[g.category] = (byCat[g.category] ?? 0) + g.signals;
              });
              const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
              return {
                state: x,
                signals: rows.reduce((n, g) => n + g.signals, 0),
                districts: new Set(rows.map((g) => g.district)).size,
                topCategory: top,
                avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
                investment: rows.reduce((n, g) => n + g.investment_inr, 0),
              } as StateStat;
            })
          )
        )
          .then((stats) => setStateStats(stats))
          .catch(() => setStateStats([]));
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [reloadKey]);

  function retry() {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  const districts = [...new Set(hotspots.filter((h) => !fState || h.state === fState).map((h) => h.district))].sort();
  const districtCount = stateStats.length
    ? stateStats.reduce((n, s) => n + s.districts, 0)
    : new Set(hotspots.map((h) => `${h.state}|${h.district}`)).size;
  const selected = hotspots.find((h) => h.id === selectedId) ?? hotspots[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const ctrl = new AbortController();
    const base = `/api/v1/hotspots/${encodeURIComponent(selected.id)}`;
    apiGet<RecommendationOut>(`${base}/recommendation`, ctrl.signal)
      .then(setSelRec)
      .catch(() => setSelRec(null));
    fetch(`${API_URL}/api/v1/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: selected.state, district: selected.district, category: selected.category, budget: 100 * 1e7 }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSelSim(s))
      .catch(() => setSelSim(null));
    return () => ctrl.abort();
  }, [selected]);

  function copySummary() {
    if (!selected) return;
    const lines = [
      "JanSetu Policy Summary",
      "",
      `Location: ${selected.district}, ${selected.state}`,
      `Category: ${title(selected.category)}`,
      `Citizen demand: ${fmtInt(selected.signals)} signals (${trendLabel(selected.trend_pct)})`,
      `Trend: ${selected.trend_pct == null ? "history building" : `${selected.trend_pct}% (30d vs prior 30d)`}`,
      `Infrastructure context: gap ${selected.gap_index?.toFixed(2) ?? "—"}, population ${fmtInt(selected.population)}, investment ${fmtInr(selected.investment_inr)}`,
      selRec ? `Recommended intervention: ${selRec.recommendation.intervention}` : "Recommended intervention: see evidence page",
      selSim ? `Prototype scenario: ₹${selSim.scenario.budget_cr} Cr → ${fmtInt(selSim.estimate.population_reached)} reached` : "Prototype scenario: see simulator",
      "",
      "This is for demonstration only (synthetic demonstration dataset).",
    ];
    try {
      void navigator.clipboard.writeText(lines.join("\n")).then(() => setCopied(true));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const topCats: TopCategory[] = summary?.top_categories ?? [];
  const railRising = [...pulse]
    .filter((p) => p.status === "rising")
    .sort((a, b) => (b.trend_percent ?? 0) - (a.trend_percent ?? 0))
    .slice(0, 4);
  const maxCatCount = Math.max(...topCats.map((c) => c.count), 1);
  const maxStateSignals = Math.max(...stateStats.map((s) => s.signals), 1);
  const trendGroups: Record<string, PulseItem[]> = { rising: [], stable: [], declining: [], insufficient_data: [] };
  pulse.forEach((p) => {
    (trendGroups[p.status] ?? trendGroups.insufficient_data).push(p);
  });

  const selectCls =
    "rounded-lg border border-[var(--border)] bg-[var(--js-surface)] px-2.5 py-2 text-[13px] font-medium focus:border-[var(--js-accent)] focus:outline-none";

  if (error) {
    return (
      <RequireAuth>
        <main className="mx-auto max-w-[1360px] px-6 md:px-10 py-12">
          <p role="alert" className="rounded-xl border border-[#C93636]/40 bg-[#C93636]/10 p-4 text-[#C93636] dark:text-[#F87171]">{error}</p>
          <p className="mt-3 text-sm text-[var(--js-muted)]">The dashboard needs the backend at {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}. Start it and refresh.</p>
          <button onClick={retry} className="mt-3 rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium transition-colors hover:bg-[var(--js-track)]">
            Retry
          </button>
        </main>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-[1360px] px-5 md:px-8 min-[1440px]:px-10 pb-20">
        {/* BREADCRUMB */}
        <nav aria-label="Breadcrumb" className="pt-6 text-[13px] text-[var(--js-muted)]">
          <button className="underline underline-offset-2 hover:text-[var(--foreground)]" onClick={() => selectState("")}>India</button>
          <span> / Civic Intelligence</span>
          {fState && (
            <>
              <span> / </span>
              <button className="underline underline-offset-2 hover:text-[var(--foreground)]" onClick={() => { setFDistrict(""); refetch({ state: fState, district: "", category: fCategory, priority: fPriority }); }}>
                {fState}
              </button>
            </>
          )}
          {fState && fDistrict && <span> / {fDistrict}</span>}
        </nav>

        {/* ============ COMMAND HEADER ============ */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <div>
            <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
              <span className="inline-block h-px w-8 bg-[var(--js-accent)]" aria-hidden="true" />
              JANSETU · NATIONAL CIVIC INTELLIGENCE
            </p>
            <h1 className="mt-4 font-serif text-[clamp(2.25rem,5.5vw,4.75rem)] font-semibold uppercase leading-[1.02] tracking-tight">
              From citizen signals to development priorities.
            </h1>
            <p className="mt-4 max-w-2xl text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-[var(--js-muted)]">
              Every signal is transformed into structured civic intelligence
              through AI-assisted understanding and deterministic analysis.
            </p>
          </div>
          <Reveal delay={100} className="lg:justify-self-end lg:w-full lg:max-w-sm">
            <div className="rounded-2xl bg-[#0B0C0F] p-5 text-white dark:bg-[var(--js-surface-2)] dark:border dark:border-[var(--border)]">
              <p className="text-[11px] font-bold tracking-[0.24em] text-zinc-400">SYSTEM STATUS</p>
              <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                LIVE INTELLIGENCE
              </p>
              <dl className="mt-3 space-y-2 border-t border-white/10 pt-3 text-[13px] dark:border-[var(--border)]">
                <div className="flex justify-between"><dt className="text-zinc-400">Window</dt><dd className="font-semibold">90 days</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Dataset</dt><dd className="font-semibold">{summary ? <><CountUp value={summary.citizen_signals} format={fmtInt} />+ signals</> : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Coverage</dt><dd className="font-semibold">{states.length || "—"} states · {districtCount || "—"} districts</dd></div>
              </dl>
            </div>
          </Reveal>
        </div>

        {/* ============ KPI COMMAND BAR ============ */}
        <Reveal className="mt-10">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-[var(--border)] py-7 lg:grid-cols-4">
            {[
              { l: "Citizen signals", v: summary ? <CountUp value={summary.citizen_signals} format={fmtInt} /> : "—" },
              { l: "Active hotspots", v: summary ? <CountUp value={summary.active_hotspots} format={fmtInt} /> : "—" },
              { l: "High-priority areas", v: summary ? <CountUp value={summary.high_priority_areas} format={fmtInt} /> : "—" },
              { l: "Population affected", v: summary ? <CountUp value={summary.population_affected} format={fmtInt} /> : "—" },
            ].map((m) => (
              <div key={m.l} className="min-w-0">
                <dt className="flex items-center gap-1.5 break-words text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]">
                  <span aria-hidden="true" className="inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--js-accent)]" />
                  {m.l}
                </dt>
                <dd className="mt-2 break-words font-serif text-[clamp(1.6rem,3.2vw,2.9rem)] font-semibold leading-none tracking-tight tabular-nums">{m.v}</dd>
                <dd className="mt-2 text-xs text-[var(--js-faint)]">Current demonstration dataset</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* ============ NATIONAL DEMAND MAP + PULSE ============ */}
        <section className="mt-14 lg:mt-20" aria-label="National civic demand map">
          <SectionHead
            eyebrow="GEOGRAPHIC INTELLIGENCE"
            title="National demand map"
            sub="Where citizen demand is concentrating across the intelligence window."
          />
          <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[1.9fr_1fr]">
            <Reveal>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--js-surface)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
                  <span className="mr-auto flex items-center gap-1.5 text-[11px] font-bold tracking-[0.18em] text-[var(--js-muted)]">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--js-accent)]" />
                    LIVE CIVIC SIGNALS · 90 DAYS
                  </span>
                  <label className="text-[11px] font-semibold text-[var(--js-muted)]">Category
                    <select className={`${selectCls} ml-1.5`} value={fCategory} onChange={(e) => { const v = e.target.value; setFCategory(v); refetch({ state: fState, district: fDistrict, category: v, priority: fPriority }); }}>
                      <option value="">All</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{title(c)}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-[var(--js-muted)]">State
                    <select className={`${selectCls} ml-1.5`} value={fState} onChange={(e) => { const v = e.target.value; setFState(v); setFDistrict(""); refetch({ state: v, district: "", category: fCategory, priority: fPriority }); }}>
                      <option value="">All</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-[var(--js-muted)]">Priority
                    <select className={`${selectCls} ml-1.5`} value={fPriority} onChange={(e) => { const v = e.target.value; setFPriority(v); refetch({ state: fState, district: fDistrict, category: fCategory, priority: v }); }}>
                      <option value="">All</option>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{title(p)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="bg-[#F8F6F1] p-3 dark:bg-[#0B0E14] sm:p-4">
                  {loading ? <Skeleton className="h-[420px] w-full sm:h-[500px]" /> : <Map hotspots={hotspots} selectedId={selected?.id ?? null} onSelect={selectHotspot} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--js-muted)]">
                  <span>Demand intensity <strong className="font-semibold">LOW → HIGH</strong></span>
                  <span>Trend <strong className="text-[#C93636] dark:text-[#F87171]">↑ Rising</strong> · <strong>→ Stable</strong> · <strong className="text-[#138A52] dark:text-[#34D399]">↓ Declining</strong></span>
                  <span>Priority <strong>P0 / P1 / P2 / P3</strong></span>
                  {filtering && <span className="ml-auto animate-pulse">Updating…</span>}
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="flex h-full flex-col rounded-2xl bg-[#0B0C0F] p-5 text-white dark:bg-[var(--js-surface-2)] dark:border dark:border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold tracking-[0.24em] text-zinc-400">CIVICPULSE</p>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-emerald-400">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" /> LIVE
                  </p>
                </div>
                <p className="mt-1 font-serif text-xl font-semibold">Rising civic demand</p>
                {loading ? (
                  <div className="mt-4 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : railRising.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-400">No rising categories right now.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-white/10 dark:divide-[var(--border)]">
                    {railRising.map((p) => {
                      const max = Math.max(p.previous_count, p.current_count, 1);
                      return (
                        <li key={p.category} className="group py-3.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[15px] font-semibold">{title(p.category)}</p>
                            <p className="font-serif text-[1.7rem] font-semibold leading-none text-[#F5B400]">↑ {p.trend_percent}%</p>
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">{fmtInt(p.current_count)} signals</p>
                          <div className="mt-2 flex h-1 gap-1" aria-hidden="true">
                            <span className="rounded-full bg-white/20 dark:bg-[var(--js-track)]" style={{ width: `${(p.previous_count / max) * 100}%` }} />
                            <span className="rounded-full bg-[#F5B400]" style={{ width: `${Math.max(6, (p.current_count / max) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Link href="#pulse-analytics" className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-zinc-300 transition-colors hover:text-[#F5B400]">
                  Full trends <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ SELECTED HOTSPOT BRIEFING ============ */}
        {selected && (
          <section className="mt-10 lg:mt-14" aria-label="Selected hotspot briefing">
            <Reveal>
              <div className="overflow-hidden rounded-2xl bg-[#0B0C0F] text-white dark:bg-[var(--js-surface-2)] dark:border dark:border-[var(--border)]">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr]">
                  <div className="relative border-b border-white/10 p-6 dark:border-[var(--border)] sm:p-8 lg:border-b-0 lg:border-r">
                    <p className="text-[11px] font-bold tracking-[0.24em] text-[#F5B400]">SELECTED HOTSPOT</p>
                    <h3 className="mt-3 font-serif text-[clamp(1.8rem,3vw,2.7rem)] font-semibold uppercase leading-tight tracking-tight">
                      {selected.district}
                    </h3>
                    <p className="mt-1 text-sm tracking-wide text-zinc-400">{selected.state.toUpperCase()} · {title(selected.category).toUpperCase()}</p>
                    <p className="mt-3 inline-block rounded-full bg-[#F5B400]/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#F5B400]">
                      {selected.priority_level} priority
                    </p>
                    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                      <div><dt className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Signals</dt><dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{fmtInt(selected.signals)}</dd></div>
                      <div><dt className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Trend</dt><dd className={`mt-1 font-serif text-2xl font-semibold tabular-nums ${(selected.trend_pct ?? 0) >= 0 ? "text-[#F87171]" : "text-emerald-400"}`}>{trendLabel(selected.trend_pct)}</dd></div>
                      <div><dt className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Infrastructure gap</dt><dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{selected.gap_index?.toFixed(2) ?? "—"}</dd></div>
                      <div><dt className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Population</dt><dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">{fmtInt(selected.population)}</dd></div>
                    </dl>
                    <ul className="mt-6 space-y-1.5 border-t border-white/10 pt-4 text-[13px] text-zinc-300 dark:border-[var(--border)]">
                      {whyBullets(selected).map(([m, l]) => <li key={l} className="flex gap-2"><span aria-hidden="true" className="text-[#F5B400]">{m}</span><span>{l}</span></li>)}
                    </ul>
                  </div>
                  <div className="p-6 sm:p-8">
                    <p className="text-[11px] font-bold tracking-[0.24em] text-zinc-400">INTELLIGENCE BRIEFING</p>
                    <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">
                      {selRec ? selRec.recommendation.intervention : "Loading recommendation…"}
                    </p>
                    {selRec && (
                      <p className="mt-2 text-[13px] text-zinc-500">
                        Evidence: {fmtInt(selRec.evidence.citizen_signals)} signals · {fmtInt(selRec.evidence.population_affected)} affected · confidence {selRec.recommendation.confidence.toFixed(2)}
                      </p>
                    )}
                    {selSim && (
                      <p className="mt-2 text-[13px] text-zinc-500">
                        Prototype scenario: ₹{selSim.scenario.budget_cr} Cr → {fmtInt(selSim.estimate.population_reached)} reached · gap −{(selSim.estimate.gap_reduction * 100).toFixed(1)}%
                      </p>
                    )}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link href={hotspotHref(selected)} className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F5B400]">
                        View Evidence <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                      <Link
                        href={`/simulate?state=${encodeURIComponent(selected.state)}&district=${encodeURIComponent(selected.district)}&category=${encodeURIComponent(selected.category)}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium transition-all duration-200 hover:border-white/60 hover:bg-white/10"
                      >
                        Simulate <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Button variant="outline" size="sm" onClick={copySummary}
                        className="self-center rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
                        {copied ? "Copied ✓" : "Copy brief"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </section>
        )}

        {/* ============ SIGNAL → DECISION PIPELINE ============ */}
        <section className="mt-14 lg:mt-20" aria-label="From signal to decision">
          <SectionHead eyebrow="SYSTEM ARCHITECTURE" title="From signal to decision" />
          <Reveal className="mt-8" delay={100}>
            <ol className="relative hidden lg:block">
              <div className="absolute left-0 right-0 top-[26px] h-px bg-[var(--border)]" aria-hidden="true" />
              <div className="js-pipeline-progress absolute left-0 right-0 top-[26px] h-px bg-gradient-to-r from-[var(--js-accent)] via-[var(--js-accent)] to-[#7C7CFF]" aria-hidden="true" />
              <div className="grid grid-cols-5 gap-6">
                {[
                  ["Citizen signal", "Voices become located records."],
                  ["CivicPulse", "Timestamps reveal rising demand."],
                  ["Hotspot", "Demand concentrates by district."],
                  ["Evidence", "Gaps, people and investment weighed."],
                  ["Development action", "Recommendations and scenarios."],
                ].map(([t, d], i) => (
                  <li key={t} className="group relative">
                    <span className="relative z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--js-surface)] font-serif text-base font-semibold text-[var(--js-accent)] transition-all duration-300 group-hover:shadow-[0_10px_30px_rgba(245,180,0,0.3)]" aria-hidden="true">
                      0{i + 1}
                    </span>
                    <p className="mt-4 text-[11px] font-bold tracking-[0.18em] text-[var(--js-accent)]">0{i + 1}</p>
                    <p className="mt-1 text-[15px] font-semibold">{t}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--js-muted)]">{d}</p>
                  </li>
                ))}
              </div>
            </ol>
            <ol className="relative space-y-7 border-l border-[var(--border)] lg:hidden">
              {[
                ["Citizen signal", "Voices become located records."],
                ["CivicPulse", "Timestamps reveal rising demand."],
                ["Hotspot", "Demand concentrates by district."],
                ["Evidence", "Gaps, people and investment weighed."],
                ["Development action", "Recommendations and scenarios."],
              ].map(([t, d], i, a) => (
                <li key={t} className="relative pl-14">
                  <span className="absolute left-0 top-0 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--js-surface)] font-serif font-semibold text-[var(--js-accent)]" aria-hidden="true">
                    {i + 1}
                  </span>
                  {i < a.length - 1 && <span aria-hidden="true" className="absolute bottom-[-28px] left-0 top-11 w-px -translate-x-1/2 bg-gradient-to-b from-[var(--js-accent)]/60 to-transparent" />}
                  <p className="text-[11px] font-bold tracking-[0.18em] text-[var(--js-accent)]">0{i + 1}</p>
                  <p className="mt-0.5 text-base font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-[var(--js-muted)]">{d}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* ============ ANALYTICS + DISTRIBUTION ============ */}
        <div className="mt-14 grid grid-cols-1 gap-5 lg:mt-20 lg:grid-cols-2">
          <section id="pulse-analytics" className="scroll-mt-24 rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5 sm:p-6" aria-label="CivicPulse analytics">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
              <Activity className="h-3.5 w-3.5 text-[var(--js-accent)]" aria-hidden="true" /> CIVICPULSE
            </p>
            <h3 className="mt-2 font-serif text-2xl font-semibold tracking-tight">How demand is changing</h3>
            <p className="mt-1 text-[13px] text-[var(--js-muted)]">30-day window vs prior 30 days.</p>
            {loading ? (
              <div className="mt-4 space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
            ) : pulse.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--js-muted)]">No pulse data yet.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {pulse.map((p) => (
                  <li key={p.category} className={`rounded-xl border border-[var(--border)] bg-[var(--js-surface-2)]/60 p-4 transition-transform duration-200 hover:-translate-y-0.5 ${trendColor(p)}`}>
                    <p className="text-[11px] font-bold tracking-[0.18em] text-[var(--js-muted)]">{title(p.category).toUpperCase()}</p>
                    {p.status === "insufficient_data" ? (
                      <p className="mt-2 text-[13px] text-[var(--js-muted)]">Insufficient data</p>
                    ) : (
                      <>
                        <p className="mt-1 font-serif text-[1.9rem] font-semibold leading-none tabular-nums">
                          {(p.trend_percent ?? 0) >= 0 ? "↑" : "↓"} {trendLabel(p.trend_percent)}
                        </p>
                        <p className="mt-1.5 text-xs text-[var(--js-muted)] tabular-nums">
                          {fmtInt(p.current_count)} signals · {fmtInt(p.previous_count)} → {fmtInt(p.current_count)}
                        </p>
                        <MiniTrend p={p} />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5 sm:p-6" aria-label="Civic need distribution">
            <p className="text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">VOLUME INTELLIGENCE</p>
            <h3 className="mt-2 font-serif text-2xl font-semibold tracking-tight">Civic need distribution</h3>
            <p className="mt-1 text-[13px] text-[var(--js-muted)]">Signal volume across development categories.</p>
            {loading || !summary ? (
              <div className="mt-4 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            ) : (
              <Reveal className="mt-5">
                <ul className="space-y-3.5">
                  {[...topCats].sort((a, b) => b.count - a.count).map((c) => (
                    <li key={c.category} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 font-medium">{title(c.category)}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--js-track)]">
                        <span className="js-bar-fill block h-2.5 rounded-full bg-[var(--js-accent)]" style={{ width: `${Math.round((c.count / maxCatCount) * 100)}%` }} />
                      </span>
                      <span className="w-20 shrink-0 text-right tabular-nums">{fmtInt(c.count)}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </section>
        </div>

        {/* ============ STATE INTELLIGENCE ============ */}
        <section className="mt-14 lg:mt-20" aria-label="State intelligence">
          <SectionHead
            eyebrow="COMPARATIVE INTELLIGENCE"
            title="State intelligence"
            sub="Compare citizen demand and infrastructure context. Select a state to drill into its districts."
          />
          {loading ? (
            <div className="mt-6 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
          ) : stateStats.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5 text-sm text-[var(--js-muted)]">State data unavailable.</p>
          ) : (
            <Reveal className="mt-6" delay={80}>
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--js-surface)]">
                <div className="hidden grid-cols-[1.2fr_2fr_0.7fr_1fr_0.8fr_0.9fr] gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-bold tracking-[0.16em] text-[var(--js-muted)] md:grid" aria-hidden="true">
                  <span>STATE</span><span>SIGNAL VOLUME</span><span className="text-right">SIGNALS</span><span>TOP CATEGORY</span><span className="text-right">GAP</span><span className="text-right">INVESTMENT</span>
                </div>
                <ul className="divide-y divide-[var(--border)]">
                  {[...stateStats].sort((a, b) => b.signals - a.signals).map((s) => (
                    <li key={s.state}>
                      <button
                        onClick={() => selectState(s.state)}
                        className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-4 text-left text-sm transition-colors duration-200 hover:bg-[var(--js-track)]/50 md:grid-cols-[1.2fr_2fr_0.7fr_1fr_0.8fr_0.9fr] ${fState === s.state ? "bg-[var(--js-accent)]/10" : ""}`}
                        aria-pressed={fState === s.state}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {fState === s.state && <span className="h-2 w-2 rounded-full bg-[var(--js-accent)]" aria-hidden="true" />}
                          {s.state}
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-[var(--js-track)] md:order-none">
                          <span className="block h-2 rounded-full bg-[var(--js-accent)]" style={{ width: `${Math.round((s.signals / maxStateSignals) * 100)}%` }} />
                        </span>
                        <span className="hidden text-right tabular-nums md:block">{fmtInt(s.signals)}</span>
                        <span className="hidden text-[var(--js-muted)] md:block">{title(s.topCategory)}</span>
                        <span className="hidden text-right tabular-nums text-[var(--js-muted)] md:block">{s.avgGap?.toFixed(2) ?? "—"}</span>
                        <span className="hidden text-right text-[var(--js-muted)] md:block">{fmtInr(s.investment)}</span>
                        <span className="text-right tabular-nums md:hidden">{fmtInt(s.signals)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}
        </section>

        {/* ============ EMERGING HOTSPOTS ============ */}
        <section className="mt-14 lg:mt-20" aria-label="Emerging hotspots">
          <SectionHead
            eyebrow="VELOCITY WATCH"
            title="Emerging hotspots"
            sub="Locations where civic demand is changing rapidly."
          />
          {loading ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-56" />
            </div>
          ) : emerging.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5 text-sm text-[var(--js-muted)]">
              No emerging hotspot detected. JanSetu has not identified a significant rise
              in any category during the current intelligence window.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {emerging.filter((e) => e.trend_percent > 0).slice(0, 3).map((e, i) => (
                <Reveal key={e.id} delay={i * 90}>
                  <Link
                    href={`/hotspots/${encodeURIComponent(e.id)}`}
                    className="group block h-full rounded-2xl bg-[#0B0C0F] p-6 text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(11,12,15,0.35)] dark:bg-[var(--js-surface-2)] dark:border dark:border-[var(--border)]"
                  >
                    <p className="font-serif text-2xl font-semibold uppercase tracking-tight">{e.district}</p>
                    <p className="mt-0.5 text-xs tracking-[0.18em] text-zinc-400">{e.state.toUpperCase()} · {title(e.category).toUpperCase()}</p>
                    <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-4 dark:border-[var(--border)]">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">DEMAND</p>
                        <p className="mt-1 font-serif text-3xl font-semibold tabular-nums">{fmtInt(e.current_count)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">TREND</p>
                        <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-[#F5B400]">↑ {e.trend_percent}%</p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-zinc-400">
                      Infrastructure gap {emergingGap(e.id)} · Priority {emergingPriority(e.id)}
                    </p>
                    <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-white transition-colors group-hover:text-[#F5B400]">
                      View hotspot <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </section>

        {/* ============ TREND BOARD ============ */}
        {!loading && pulse.length > 0 && (
          <section className="mt-14 lg:mt-20" aria-label="Trend board">
            <SectionHead eyebrow="MARKET-STYLE SIGNALS" title="Trend board" />
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {([
                { g: "rising" as const, icon: TrendingUp, cls: "text-[#C93636] dark:text-[#F87171]", empty: "No rising categories" },
                { g: "stable" as const, icon: Minus, cls: "text-[var(--js-muted)]", empty: "No significant change" },
                { g: "declining" as const, icon: TrendingDown, cls: "text-[#138A52] dark:text-[#34D399]", empty: "No significant decline" },
              ]).map(({ g, icon: Icon, cls, empty }, i) => (
                <Reveal key={g} delay={i * 80}>
                  <div className="h-full rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
                    <p className={`flex items-center gap-2 text-[11px] font-bold tracking-[0.22em] ${cls}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" /> {g.toUpperCase()}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {trendGroups[g].map((p) => (
                        <li key={p.category} className="flex items-center justify-between border-b border-[var(--border)]/60 pb-2 last:border-0 last:pb-0">
                          <span className="font-medium">{title(p.category)}</span>
                          <span className={`font-semibold tabular-nums ${cls}`}>{trendLabel(p.trend_percent)}</span>
                        </li>
                      ))}
                      {trendGroups[g].length === 0 && <li className="text-[var(--js-faint)]">{empty}</li>}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* ============ HOTSPOT INTELLIGENCE TABLE ============ */}
        <section className="mt-14 lg:mt-20" aria-label="Hotspot intelligence">
          <SectionHead
            eyebrow="RANKED DEMAND"
            title="Hotspot intelligence"
            sub="Deterministic ranking. Select any row to brief it above."
          />
          <Reveal className="mt-6">
            <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
              <label className="font-semibold text-[var(--js-muted)]">State
                <select className={`${selectCls} ml-1.5`} value={fState} onChange={(e) => { const v = e.target.value; setFState(v); setFDistrict(""); refetch({ state: v, district: "", category: fCategory, priority: fPriority }); }}>
                  <option value="">All</option>
                  {states.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="font-semibold text-[var(--js-muted)]">District
                <select className={`${selectCls} ml-1.5`} value={fDistrict} onChange={(e) => { const v = e.target.value; setFDistrict(v); refetch({ state: fState, district: v, category: fCategory, priority: fPriority }); }}>
                  <option value="">All</option>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="font-semibold text-[var(--js-muted)]">Category
                <select className={`${selectCls} ml-1.5`} value={fCategory} onChange={(e) => { const v = e.target.value; setFCategory(v); refetch({ state: fState, district: fDistrict, category: v, priority: fPriority }); }}>
                  <option value="">All</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{title(c)}</option>)}
                </select>
              </label>
              <label className="font-semibold text-[var(--js-muted)]">Priority
                <select className={`${selectCls} ml-1.5`} value={fPriority} onChange={(e) => { const v = e.target.value; setFPriority(v); refetch({ state: fState, district: fDistrict, category: fCategory, priority: v }); }}>
                  <option value="">All</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{title(p)}</option>)}
                </select>
              </label>
              {filtering && <span className="animate-pulse text-[var(--js-muted)]">Updating…</span>}
            </div>
          </Reveal>
          {loading ? (
            <div className="mt-4 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : hotspots.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No hotspots match these filters"
                body="Widen the state, district, category or priority selection to see the deterministic ranking again."
              />
            </div>
          ) : (
            <Reveal className="mt-4" delay={60}>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--js-surface)]">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--js-track)]/70 backdrop-blur">
                    <tr>
                      {["District", "Category", "Demand", "Trend", "Infra gap", "Population", "Priority"].map((h) => (
                        <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--js-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {hotspots.slice(0, 20).map((h, i) => {
                      const tier = PRIORITY_TIER[h.priority_level] ?? "P3";
                      return (
                        <tr
                          key={h.id}
                          onClick={() => selectHotspot(h.id)}
                          style={{ cursor: "pointer" }}
                          className={`transition-colors duration-150 hover:bg-[var(--js-track)]/50 ${selected?.id === h.id ? "bg-[var(--js-accent)]/10" : i % 2 === 1 ? "bg-[var(--js-surface-2)]/50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <Link className="font-medium underline underline-offset-2" href={hotspotHref(h)} onClick={(e) => e.stopPropagation()}>
                              {h.district}, {h.state}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{title(h.category)}</td>
                          <td className="px-4 py-3 tabular-nums">{fmtInt(h.signal_count)}</td>
                          <td className={`px-4 py-3 font-medium tabular-nums ${(h.trend_pct ?? 0) >= 0 ? "text-[#C93636] dark:text-[#F87171]" : "text-[#138A52] dark:text-[#34D399]"}`}>
                            {trendLabel(h.trend_pct)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{h.gap_index?.toFixed(2) ?? "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{fmtInt(h.population)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${TIER_STYLE[tier]}`}>
                              {tier}
                            </span>
                            <span className="ml-2 text-xs text-[var(--js-muted)] tabular-nums">{h.priority_score.toFixed(2)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Reveal>
          )}
        </section>

        {/* ============ ASK ============ */}
        <section className="mt-14 lg:mt-20" aria-label="Ask JanSetu">
          <SectionHead eyebrow="NATURAL LANGUAGE QUERY" title="Ask JanSetu" sub="Query the intelligence layer in plain English." />
          <Reveal className="mt-6" delay={60}>
            <AskJanSetu hotspots={hotspots} />
          </Reveal>
        </section>

        {/* ============ PROVENANCE ============ */}
        <Reveal className="mt-12">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] px-6 py-5 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Signals", "Synthetic demo data"],
              ["AI", "Gemini extraction only"],
              ["Math", "Deterministic engines"],
              ["Ranking", "Hotspot engine"],
              ["Trends", "CivicPulse 30d/30d"],
              ["Scenarios", "Prototype estimates"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </main>
    </RequireAuth>
  );

  function emergingGap(id: string): string {
    const h = hotspots.find((x) => x.id === id);
    return h?.gap_index?.toFixed(2) ?? "see evidence";
  }

  function emergingPriority(id: string): string {
    const h = hotspots.find((x) => x.id === id);
    return h ? title(h.priority_level) : "see evidence";
  }
}

type StateStat = {
  state: string;
  signals: number;
  districts: number;
  topCategory: string;
  avgGap: number | null;
  investment: number;
};
