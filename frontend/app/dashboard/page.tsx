"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Map, { PRIORITY_TIER } from "@/components/Map";
import AskJanSetu from "@/components/AskJanSetu";
import { Button } from "@/components/ui/button";
import { apiGet, fmtInt, fmtInr, hotspotHref, title, trendLabel } from "@/lib/api";
import type { EmergingHotspot, Hotspot, PulseItem, RecommendationOut, Summary, TopCategory } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRIORITIES = ["critical", "high", "medium", "low", "minimal"];

export type RecentSignal = {
  id: number;
  category: string;
  severity: string;
  summary: string | null;
  language: string;
  state: string;
  district: string;
  created_at: string | null;
};

type StateStat = {
  state: string;
  signals: number;
  districts: number;
  topCategory: string;
  avgGap: number | null;
  investment: number;
};

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

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 ${className}`} />;
}

function severityBorder(level: string): string {
  if (level === "critical" || level === "high") return "border-l-4 border-l-red-700";
  if (level === "medium") return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-green-700";
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [emerging, setEmerging] = useState<EmergingHotspot[]>([]);
  const [recent, setRecent] = useState<RecentSignal[]>([]);
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
      apiGet<{ signals: RecentSignal[] }>("/api/v1/signals/recent?limit=8", ctrl.signal),
    ])
      .then(([s, p, h, r]) => {
        setSummary(s);
        setPulse(p.pulse);
        setEmerging(p.emerging_hotspots ?? []);
        setHotspots(h.hotspots.slice(0, 50));
        setRecent(r.signals);
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
  }, []);

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

  const districtsFor = (cat: string) => [...new Set(hotspots.filter((h) => h.category === cat).map((h) => h.district))];
  const topCats: TopCategory[] = summary?.top_categories ?? [];
  const maxCatCount = Math.max(...topCats.map((c) => c.count), 1);
  const maxPulse = Math.max(...pulse.flatMap((p) => [p.current_count, p.previous_count]), 1);
  const maxStateSignals = Math.max(...stateStats.map((s) => s.signals), 1);
  const trendGroups: Record<string, PulseItem[]> = { rising: [], stable: [], declining: [], insufficient_data: [] };
  pulse.forEach((p) => {
    (trendGroups[p.status] ?? trendGroups.insufficient_data).push(p);
  });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
        <p className="mt-3 text-sm text-zinc-600">The dashboard needs the backend at {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}. Start it and refresh.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* BREADCRUMB */}
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <button className="underline hover:text-black" onClick={() => selectState("")}>India</button>
        {fState && (
          <>
            <span> → </span>
            <button className="underline hover:text-black" onClick={() => { setFDistrict(""); refetch({ state: fState, district: "", category: fCategory, priority: fPriority }); }}>
              {fState}
            </button>
          </>
        )}
        {fState && fDistrict && <span> → {fDistrict}</span>}
      </nav>

      {/* HERO + KPI HIERARCHY */}
      <p className="mt-2 text-sm font-semibold tracking-widest text-zinc-500">JANSETU · NATIONAL CIVIC INTELLIGENCE</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">From citizen signals to development priorities.</h1>
      <p className="mt-1 text-sm text-zinc-500">Synthetic demonstration dataset. Every metric below is computed live from APIs.</p>

      {loading || !summary ? (
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ["Citizen signals", fmtInt(summary.citizen_signals)],
              ["Active hotspots", fmtInt(summary.active_hotspots)],
              ["High priority areas", fmtInt(summary.high_priority_areas)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-5">
                <p className="text-sm text-zinc-500">{label}</p>
                <p className="mt-1 text-3xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
            <span>States <b className="text-black">{fmtInt(states.length)}</b></span>
            <span>Districts <b className="text-black">{fmtInt(districtCount)}</b></span>
            <span>Population affected <b className="text-black">{fmtInt(summary.population_affected)}</b></span>
            <span>Top category <b className="text-black">{summary.top_categories[0] ? title(summary.top_categories[0].category) : "—"}</b></span>
            <span className="text-zinc-400">90-day intelligence window</span>
          </div>
        </>
      )}

      {/* MAP + SIDE PANEL */}
      <section className="relative mt-8" aria-label="National civic demand map">
        <svg aria-hidden="true" className="pointer-events-none absolute -top-6 right-0 h-28 w-64 opacity-20" viewBox="0 0 200 80" fill="none" stroke="#a1a1aa" strokeWidth="1">
          <ellipse cx="100" cy="45" rx="90" ry="32" />
          <ellipse cx="100" cy="45" rx="65" ry="22" />
          <ellipse cx="100" cy="45" rx="40" ry="13" />
        </svg>
        <h2 className="text-xl font-semibold">National civic demand map</h2>
        <p className="mt-1 text-sm text-zinc-500">Where citizen demand is concentrated across the current demonstration dataset.</p>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {loading ? <Skeleton className="h-[28rem] w-full" /> : <Map hotspots={hotspots} selectedId={selected?.id ?? null} onSelect={selectHotspot} />}
          </div>
          <aside className="rounded-md border p-4 lg:col-span-5" aria-label="Selected hotspot">
            <h3 className="text-sm font-semibold tracking-wide text-zinc-500">SELECTED HOTSPOT</h3>
            {!selected ? (
              <p className="mt-2 text-sm text-zinc-500">No hotspot selected.</p>
            ) : (
              <>
                <p className="mt-1 font-semibold">{selected.district}, {selected.state} — {title(selected.category)}</p>
                <p className="text-sm text-zinc-600">
                  {title(selected.priority_level)} · {PRIORITY_TIER[selected.priority_level] ?? "—"} · {fmtInt(selected.signals)} signals · {trendLabel(selected.trend_pct)}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {whyBullets(selected).slice(0, 3).map(([m, l]) => <li key={l} className="flex gap-2"><span>{m}</span><span>{l}</span></li>)}
                </ul>
                <div className="mt-3 flex gap-3 text-sm">
                  <Link className="underline" href={hotspotHref(selected)}>View Evidence →</Link>
                  <Link className="underline" href={`/simulate?state=${encodeURIComponent(selected.state)}&district=${encodeURIComponent(selected.district)}&category=${encodeURIComponent(selected.category)}`}>Simulate →</Link>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>

      {/* PULSE CHART + DISTRIBUTION */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-md border p-4" aria-label="CivicPulse demand trend">
          <h2 className="text-lg font-semibold">CivicPulse — demand trend</h2>
          <p className="text-xs text-zinc-500">Previous 30 days vs current 30 days. Backend comparison, not frontend math.</p>
          {loading ? (
            <div className="mt-3 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : pulse.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No pulse data yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pulse.map((p) => (
                <li key={p.category} className="text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{title(p.category)}</span>
                    <span className={`font-semibold ${p.status === "insufficient_data" ? "text-zinc-400" : (p.trend_percent ?? 0) >= 0 ? "text-red-700" : "text-green-700"}`}>
                      {p.status === "insufficient_data" ? "insufficient data" : trendLabel(p.trend_percent)}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-zinc-500">Prev {fmtInt(p.previous_count)}</span>
                      <span className="h-2 flex-1 rounded bg-zinc-100">
                        <span className="block h-2 rounded bg-zinc-400" style={{ width: `${Math.round((p.previous_count / maxPulse) * 100)}%` }} />
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-zinc-500">Curr {fmtInt(p.current_count)}</span>
                      <span className="h-2 flex-1 rounded bg-zinc-100">
                        <span className="block h-2 rounded bg-black" style={{ width: `${Math.round((p.current_count / maxPulse) * 100)}%` }} />
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border p-4" aria-label="Civic need distribution">
          <h2 className="text-lg font-semibold">Civic need distribution</h2>
          <p className="text-xs text-zinc-500">Volumes from the backend; display sorted descending.</p>
          {loading || !summary ? (
            <div className="mt-3 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {[...topCats].sort((a, b) => b.count - a.count).map((c) => (
                <li key={c.category} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 font-medium">{title(c.category)}</span>
                  <span className="h-3 flex-1 rounded bg-zinc-100">
                    <span className="block h-3 rounded bg-black" style={{ width: `${Math.round((c.count / maxCatCount) * 100)}%` }} />
                  </span>
                  <span className="w-20 text-right">{fmtInt(c.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* STATE COMPARISON */}
      <section className="mt-8" aria-label="State comparison">
        <h2 className="text-xl font-semibold">State comparison</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a state to drill into its districts. Bars proportional to API signal volumes.</p>
        {loading ? (
          <div className="mt-3 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : stateStats.length === 0 ? (
          <p className="mt-3 rounded-md border p-4 text-sm text-zinc-600">State data unavailable.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-md border">
            {[...stateStats].sort((a, b) => b.signals - a.signals).map((s) => (
              <li key={s.state}>
                <button onClick={() => selectState(s.state)} className={`flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-zinc-50 ${fState === s.state ? "bg-zinc-50" : ""}`}>
                  <span className="w-36 shrink-0 font-semibold">{s.state}</span>
                  <span className="h-3 flex-1 rounded bg-zinc-100">
                    <span className="block h-3 rounded bg-black" style={{ width: `${Math.round((s.signals / maxStateSignals) * 100)}%` }} />
                  </span>
                  <span className="w-20 shrink-0 text-right">{fmtInt(s.signals)}</span>
                  <span className="hidden w-32 shrink-0 text-zinc-600 md:block">{title(s.topCategory)}</span>
                  <span className="hidden w-20 shrink-0 text-right text-zinc-600 lg:block">gap {s.avgGap?.toFixed(2) ?? "—"}</span>
                  <span className="hidden w-24 shrink-0 text-right text-zinc-600 lg:block">{fmtInr(s.investment)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* EMERGING HOTSPOTS */}
      <h2 className="mt-8 text-xl font-semibold">Emerging hotspots</h2>
      {loading ? (
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      ) : emerging.length === 0 ? (
        <p className="mt-3 rounded-md border p-4 text-sm text-zinc-600">No emerging hotspots right now.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {emerging.slice(0, 6).map((e) => (
            <Link key={e.id} href={`/hotspots/${encodeURIComponent(e.id)}`}
              className={`rounded-md border p-4 hover:bg-zinc-50 ${severityBorder(hotspots.find((x) => x.id === e.id)?.priority_level ?? "")}`}>
              <p className="font-semibold">{e.district} <span className="font-normal text-zinc-500">· {e.state}</span></p>
              <p className="text-sm text-zinc-600">{title(e.category)}</p>
              <div className="mt-2 flex items-baseline justify-between text-sm">
                <span>Demand <b>{fmtInt(e.current_count)}</b></span>
                <span className="font-semibold text-red-700">↑ {e.trend_percent}%</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-xs text-zinc-500">
                <span>Gap {emergingGap(e.id)}</span>
                <span>Priority {emergingPriority(e.id)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* TREND GROUPS */}
      {!loading && pulse.length > 0 && (
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Trend groups">
          {(["rising", "stable", "declining"] as const).map((g) => (
            <div key={g} className="rounded-md border p-4">
              <h3 className="text-sm font-semibold tracking-wide text-zinc-500">{g.toUpperCase()}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {trendGroups[g].map((p) => (
                  <li key={p.category} className="flex justify-between">
                    <span>{title(p.category)}</span>
                    <span className="font-medium">{trendLabel(p.trend_percent)}</span>
                  </li>
                ))}
                {trendGroups[g].length === 0 && <li className="text-zinc-400">—</li>}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* HOTSPOT TABLE */}
      <h2 className="mt-8 text-xl font-semibold">Hotspots</h2>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label>State{" "}
          <select className="rounded-md border p-1.5" value={fState} onChange={(e) => { const v = e.target.value; setFState(v); setFDistrict(""); refetch({ state: v, district: "", category: fCategory, priority: fPriority }); }}>
            <option value="">All</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>District{" "}
          <select className="rounded-md border p-1.5" value={fDistrict} onChange={(e) => { const v = e.target.value; setFDistrict(v); refetch({ state: fState, district: v, category: fCategory, priority: fPriority }); }}>
            <option value="">All</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>Category{" "}
          <select className="rounded-md border p-1.5" value={fCategory} onChange={(e) => { const v = e.target.value; setFCategory(v); refetch({ state: fState, district: fDistrict, category: v, priority: fPriority }); }}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{title(c)}</option>)}
          </select>
        </label>
        <label>Priority{" "}
          <select className="rounded-md border p-1.5" value={fPriority} onChange={(e) => { const v = e.target.value; setFPriority(v); refetch({ state: fState, district: fDistrict, category: fCategory, priority: v }); }}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{title(p)}</option>)}
          </select>
        </label>
        {filtering && <span className="self-center text-zinc-500">Updating…</span>}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : hotspots.length === 0 ? (
        <p className="mt-3 rounded-md border p-4 text-sm text-zinc-600">No hotspots match these filters.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr>
                {["District", "Category", "Demand", "Trend", "Infrastructure Gap", "Population", "Priority"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hotspots.slice(0, 20).map((h) => (
                <tr key={h.id} className={`border-t hover:bg-zinc-50 ${selected?.id === h.id ? "bg-zinc-50" : ""}`} onClick={() => selectHotspot(h.id)} style={{ cursor: "pointer" }}>
                  <td className="px-3 py-2">
                    <Link className="underline" href={hotspotHref(h)} onClick={(e) => e.stopPropagation()}>{h.district}, {h.state}</Link>
                  </td>
                  <td className="px-3 py-2">{title(h.category)}</td>
                  <td className="px-3 py-2">{fmtInt(h.signal_count)}</td>
                  <td className="px-3 py-2">{trendLabel(h.trend_pct)}</td>
                  <td className="px-3 py-2">{h.gap_index?.toFixed(2) ?? "—"}</td>
                  <td className="px-3 py-2">{fmtInt(h.population)}</td>
                  <td className="px-3 py-2">{title(h.priority_level)} ({h.priority_score.toFixed(2)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* EVIDENCE → ACTION */}
      {selected && (
        <section className="mt-8 rounded-md border border-zinc-300 p-5" aria-label="Evidence to action">
          <h2 className="text-xl font-semibold">From signal to action</h2>
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex gap-3"><span className="font-semibold">Citizen demand:</span><span>{fmtInt(selected.signals)} signals in {selected.district}</span></li>
            <li className="flex gap-3"><span className="font-semibold">CivicPulse:</span><span>{trendLabel(selected.trend_pct)} (30d vs prior 30d)</span></li>
            <li className="flex gap-3"><span className="font-semibold">Infrastructure gap:</span><span>{selected.gap_index?.toFixed(2) ?? "—"}</span></li>
            <li className="flex gap-3"><span className="font-semibold">Recommendation:</span><span>{selRec ? selRec.recommendation.intervention : "loading…"}</span></li>
            <li className="flex gap-3"><span className="font-semibold">Investment scenario:</span><span>{selSim ? `₹${selSim.scenario.budget_cr} Cr → ${fmtInt(selSim.estimate.population_reached)} reached (prototype estimate)` : "loading…"}</span></li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={hotspotHref(selected)} className="rounded-md bg-black px-4 py-2 text-sm text-white">View Evidence</Link>
            <Link href={`/simulate?state=${encodeURIComponent(selected.state)}&district=${encodeURIComponent(selected.district)}&category=${encodeURIComponent(selected.category)}`}
              className="rounded-md border px-4 py-2 text-sm">
              Simulate Intervention
            </Link>
          </div>
        </section>
      )}

      {/* IMPACT */}
      {!loading && summary && (
        <section className="mt-8 rounded-md border p-5">
          <h2 className="text-xl font-semibold">JanSetu impact</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
            {[
              ["Citizen signals analyzed", fmtInt(summary.citizen_signals)],
              ["States represented", fmtInt(states.length)],
              ["Districts represented", fmtInt(districtCount)],
              ["Rising civic categories", fmtInt(pulse.filter((p) => p.status === "rising").length)],
              ["Emerging hotspots", fmtInt(emerging.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs text-zinc-500">{k}</dt>
                <dd className="mt-1 text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-zinc-500">Synthetic demonstration dataset. All values from backend APIs.</p>
        </section>
      )}

      {/* STORY FLOW */}
      {!loading && summary && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              `${fmtInt(summary.citizen_signals)}+ citizen signals`,
              "CivicPulse",
              "Emerging hotspots",
              "Evidence",
              "Policy action",
            ].map((s, i, a) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-md border px-3 py-1.5 font-medium">{s}</span>
                {i < a.length - 1 && <span className="text-zinc-400">↓</span>}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">Prototype dataset — signal counts are demo data, not official statistics.</p>
        </section>
      )}

      {/* RISING */}
      {!loading && pulse.filter((p) => p.status === "rising").length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Where demand is rising</h2>
          <div className="mt-3 overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  {["Category", "Location", "Previous", "Current", "Change", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pulse.filter((p) => p.status === "rising").map((p) => {
                  const d = districtsFor(p.category);
                  return (
                    <tr key={p.category} className="border-t">
                      <td className="px-3 py-2 font-medium">{title(p.category)}</td>
                      <td className="px-3 py-2">{d.slice(0, 3).join(", ")}{d.length > 3 ? ` +${d.length - 3}` : ""}</td>
                      <td className="px-3 py-2">{fmtInt(p.previous_count)}</td>
                      <td className="px-3 py-2">{fmtInt(p.current_count)}</td>
                      <td className="px-3 py-2 font-semibold text-red-700">{trendLabel(p.trend_percent)}</td>
                      <td className="px-3 py-2">{title(p.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* WHY SELECTED */}
      {selected && (
        <section className="mt-8 rounded-md border p-5">
          <h2 className="text-xl font-semibold">Why this matters — {selected.district}, {selected.state}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
            <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Citizen demand</dt><dd className="mt-1 font-semibold">{fmtInt(selected.signals)} signals</dd></div>
            <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Trend</dt><dd className="mt-1 font-semibold">{trendLabel(selected.trend_pct)}</dd></div>
            <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Infrastructure gap</dt><dd className="mt-1 font-semibold">{selected.gap_index?.toFixed(2) ?? "—"}</dd></div>
            <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Population</dt><dd className="mt-1 font-semibold">{fmtInt(selected.population)}</dd></div>
            <div className="rounded-md bg-zinc-50 p-3"><dt className="text-xs text-zinc-500">Investment</dt><dd className="mt-1 font-semibold">{fmtInr(selected.investment_inr)}</dd></div>
          </dl>
          <ul className="mt-3 space-y-1 text-sm">
            {whyBullets(selected).map(([m, l]) => <li key={l} className="flex gap-2"><span>{m}</span><span>{l}</span></li>)}
          </ul>
        </section>
      )}

      {/* RECOMMENDS */}
      {selected && selRec && (
        <section className="mt-6 rounded-md border p-5">
          <h2 className="text-xl font-semibold">What JanSetu recommends</h2>
          <p className="mt-2 text-lg font-semibold">{selRec.recommendation.intervention}</p>
          <p className="mt-1 text-sm text-zinc-600">
            Evidence: {fmtInt(selRec.evidence.citizen_signals)} signals · {fmtInt(selRec.evidence.population_affected)} affected ·
            confidence {selRec.recommendation.confidence.toFixed(2)}
          </p>
          <Link href={hotspotHref(selected)} className="mt-3 inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
            Explore recommendation
          </Link>
        </section>
      )}

      {/* WHAT IF */}
      {selected && selSim && (
        <section className="mt-6 rounded-md border p-5">
          <h2 className="text-xl font-semibold">What if we invest?</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Current: {fmtInt(selected.population)} affected →
            Intervention: {title(selSim.scenario.intervention)} →
            Prototype scenario estimate: <b>{fmtInt(selSim.estimate.population_reached)} reached</b>
          </p>
          <Link
            href={`/simulate?state=${encodeURIComponent(selected.state)}&district=${encodeURIComponent(selected.district)}&category=${encodeURIComponent(selected.category)}`}
            className="mt-3 inline-block rounded-md border px-4 py-2 text-sm">
            Open Investment Scenario Lab
          </Link>
        </section>
      )}

      {/* BRIEF */}
      {selected && (
        <section className="mt-6 rounded-md border p-5">
          <h2 className="text-xl font-semibold">JanSetu policy brief</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Location</dt><dd className="font-medium">{selected.district}, {selected.state}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Category</dt><dd className="font-medium">{title(selected.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Demand</dt><dd className="font-medium">{fmtInt(selected.signals)} signals ({trendLabel(selected.trend_pct)})</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Infrastructure gap</dt><dd className="font-medium">{selected.gap_index?.toFixed(2) ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Recommendation</dt><dd className="font-medium">{selRec ? selRec.recommendation.intervention : "loading…"}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Scenario</dt><dd className="font-medium">{selSim ? `₹${selSim.scenario.budget_cr} Cr → ${fmtInt(selSim.estimate.population_reached)} reached (prototype estimate)` : "loading…"}</dd></div>
          </dl>
          <Button variant="outline" size="sm" className="mt-3" onClick={copySummary}>
            {copied ? "Copied ✓" : "Copy summary"}
          </Button>
        </section>
      )}

      {/* RECENT SIGNALS */}
      <h2 className="mt-8 text-xl font-semibold">What citizens are saying</h2>
      <p className="mt-1 text-sm text-zinc-500">Actual recent reports from the database. No personal information collected.</p>
      {loading ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {recent.map((s) => (
            <li key={s.id} className="rounded-md border p-3">
              <span className="font-medium">{title(s.category)}</span>
              <span className="text-zinc-500"> · {s.district} · {s.language} · {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</span>
              <p className="mt-1 text-zinc-700">{s.summary ?? "—"}</p>
            </li>
          ))}
          {recent.length === 0 && <p className="text-sm text-zinc-500">No signals yet.</p>}
        </ul>
      )}

      {/* CTA */}
      <section className="mt-8 rounded-md border p-6">
        <h2 className="text-xl font-semibold">From signal to decision</h2>
        <p className="mt-1 text-sm text-zinc-600">Open the evidence for the top hotspot, or model an intervention budget.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={selected ? hotspotHref(selected) : "/dashboard"}
            className={`rounded-md px-4 py-2 text-sm text-white ${selected ? "bg-black" : "bg-zinc-400 pointer-events-none"}`}>
            Explore recommendation
          </Link>
          <Link href={selected
            ? `/simulate?state=${encodeURIComponent(selected.state)}&district=${encodeURIComponent(selected.district)}&category=${encodeURIComponent(selected.category)}`
            : "/simulate"}
            className="rounded-md border px-4 py-2 text-sm">
            Simulate intervention
          </Link>
        </div>
      </section>

      {/* ASK */}
      <h2 className="mt-8 text-xl font-semibold">Ask JanSetu</h2>
      <div className="mt-3">
        <AskJanSetu hotspots={hotspots} />
      </div>

      {/* PROVENANCE */}
      <section className="mt-8 rounded-md border p-5">
        <h2 className="text-xl font-semibold">Data & methodology</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Citizen signals</dt><dd>Synthetic demonstration dataset</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">AI</dt><dd>Google Gemini where configured (extraction + explanations only)</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Numerical aggregation</dt><dd>Deterministic Python backend</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Hotspot ranking</dt><dd>Deterministic hotspot engine (factors exposed per hotspot)</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Trend detection</dt><dd>CivicPulse (last 30 days vs prior 30 days)</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Scenario modeling</dt><dd>Prototype simulation engine (estimates, not projections)</dd></div>
        </dl>
      </section>

      {/* ARCHITECTURE + SCALE */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border p-5">
          <h2 className="text-lg font-semibold">How intelligence flows</h2>
          <ol className="mt-2 space-y-1 text-sm text-zinc-700">
            {["Citizen inputs", "AI understanding", "Civic signal layer", "National data layer", "Civic intelligence", "Policy decisions"].map((s, i, a) => (
              <li key={s} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
                <span>{s}{i < a.length - 1 ? " ↓" : ""}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-zinc-500">Logical pipeline — not a claim about deployed cloud services.</p>
        </div>
        <div className="rounded-md border p-5">
          <h2 className="text-lg font-semibold">Designed for scale</h2>
          <p className="mt-2 text-sm text-zinc-700">
            The geographic model is Country → Region → District → Locality, and every
            engine aggregates by those levels. Architecture can be extended beyond India
            by replacing geographic and public-data adapters.
          </p>
          <p className="mt-2 text-xs text-zinc-500">The system does not currently operate outside the demo dataset.</p>
        </div>
      </section>
    </main>
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
