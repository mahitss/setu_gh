"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Map from "@/components/Map";
import AskJanSetu from "@/components/AskJanSetu";
import { apiGet, fmtInt, fmtInr, hotspotHref, title, trendLabel } from "@/lib/api";
import type { EmergingHotspot, Hotspot, PulseItem, Summary } from "@/lib/api";

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

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [emerging, setEmerging] = useState<EmergingHotspot[]>([]);
  const [recent, setRecent] = useState<RecentSignal[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [fState, setFState] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    loadHotspots(ctrl.signal, filters)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setFiltering(false);
      });
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
        setStates([...new Set(h.hotspots.map((x) => x.state))].sort());
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const districts = [...new Set(hotspots.filter((h) => !fState || h.state === fState).map((h) => h.district))].sort();
  const stateCount = new Set(hotspots.map((h) => h.state)).size || states.length;
  const districtCount = new Set(hotspots.map((h) => `${h.state}|${h.district}`)).size;
  const selected = hotspots.find((h) => h.id === selectedId) ?? hotspots[0] ?? null;
  const districtsFor = (cat: string) => [...new Set(hotspots.filter((h) => h.category === cat).map((h) => h.district))];

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
        <p className="mt-3 text-sm text-zinc-600">The dashboard needs the backend at {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}. Start it and refresh.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* HERO */}
      <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU · NATIONAL CIVIC INTELLIGENCE</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Turning citizen signals into evidence-backed development priorities.</h1>
      <p className="mt-1 text-sm text-zinc-500">Synthetic demo data (data_source: synthetic_demo). Every metric below is computed live from APIs.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading || !summary ? (
          <div className="contents"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : (
          [
            ["Citizen Signals", fmtInt(summary.citizen_signals)],
            ["Active Hotspots", fmtInt(summary.active_hotspots)],
            ["High Priority Areas", fmtInt(summary.high_priority_areas)],
            ["Population Affected", fmtInt(summary.population_affected)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border p-4">
              <p className="text-sm text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          )))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {fmtInt(stateCount)} states · {fmtInt(districtCount)} districts · 90-day intelligence window (trends: last 30 days vs prior 30 days).
      </p>

      {/* CIVICPULSE */}
      <h2 id="civic-pulse" className="mt-10 text-xl font-semibold">CivicPulse</h2>
      <h2 className="mt-10 text-xl font-semibold">CivicPulse</h2>
      <p className="mt-1 text-sm text-zinc-500">Last 30 days vs prior 30 days.</p>
      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
      ) : pulse.length === 0 ? (
        <p className="mt-4 rounded-md border p-4 text-sm text-zinc-600">No pulse data yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {pulse.map((p) => {
            const d = districtsFor(p.category);
            return (
              <div key={p.category} className="rounded-md border p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{title(p.category)}</p>
                  {p.status !== "insufficient_data" && (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{title(p.status)}</span>
                  )}
                </div>
                {p.status === "insufficient_data" ? (
                  <p className="mt-1 text-sm text-zinc-500">insufficient_data — not enough history yet</p>
                ) : (
                  <p className={`mt-1 text-2xl font-semibold ${(p.trend_percent ?? 0) >= 0 ? "text-red-700" : "text-green-700"}`}>
                    {trendLabel(p.trend_percent)}
                  </p>
                )}
                <p className="mt-1 text-sm text-zinc-500">{fmtInt(p.current_count)} signals (30d)</p>
                {p.status === "rising" && d.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Affected: {d.slice(0, 3).join(", ")}{d.length > 3 ? ` +${d.length - 3} more` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* EMERGING HOTSPOTS */}
      <h2 className="mt-10 text-xl font-semibold">Emerging hotspots</h2>
      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      ) : emerging.length === 0 ? (
        <p className="mt-4 rounded-md border p-4 text-sm text-zinc-600">No emerging hotspots right now.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {emerging.slice(0, 6).map((e) => (
            <Link key={e.id} href={`/hotspots/${encodeURIComponent(e.id)}`} className="rounded-md border p-4 hover:bg-zinc-50">
              <p className="font-semibold">{e.district} <span className="font-normal text-zinc-500">· {e.state}</span></p>
              <p className="text-sm text-zinc-600">{title(e.category)} · {title(e.trend_percent >= 0 ? "rising" : "stable")}</p>
              <div className="mt-2 flex items-baseline justify-between text-sm">
                <span>Demand <b>{fmtInt(e.current_count)}</b></span>
                <span className="font-semibold text-red-700">↑ {e.trend_percent}%</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm text-zinc-600">
                <span>Gap <b>{emergingGap(e.id)}</b></span>
                <span>Priority <b>{emergingPriority(e.id)}</b></span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* MAP + EVIDENCE */}
      <h2 className="mt-10 text-xl font-semibold">National map</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? <Skeleton className="h-96 w-full" /> : <Map hotspots={hotspots} selectedId={selected?.id ?? null} onSelect={setSelectedId} />}
        </div>
        <div className="rounded-md border p-4">
          <h3 className="font-semibold">Evidence panel</h3>
          {!selected ? (
            <p className="mt-2 text-sm text-zinc-500">No hotspot selected.</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium">{selected.district}, {selected.state} — {title(selected.category)}</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-500">Citizen demand</dt><dd className="font-semibold">{fmtInt(selected.signals)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Infrastructure gap</dt><dd className="font-semibold">{selected.gap_index?.toFixed(2) ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Population</dt><dd className="font-semibold">{fmtInt(selected.population)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Investment</dt><dd className="font-semibold">{fmtInr(selected.investment_inr)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Trend</dt><dd className="font-semibold">{trendLabel(selected.trend_pct)}</dd></div>
              </dl>
              <h4 className="mt-4 text-sm font-semibold">Why this hotspot?</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {whyBullets(selected).map(([m, l]) => <li key={l} className="flex gap-2"><span>{m}</span><span>{l}</span></li>)}
              </ul>
              <Link href={hotspotHref(selected)} className="mt-3 inline-block text-sm underline">Open full evidence →</Link>
            </>
          )}
        </div>
      </div>

      {/* HOTSPOT TABLE */}
      <h2 className="mt-10 text-xl font-semibold">Hotspots</h2>
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
        <div className="mt-4 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : hotspots.length === 0 ? (
        <p className="mt-4 rounded-md border p-4 text-sm text-zinc-600">No hotspots match these filters.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border">
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
                <tr key={h.id} className={`border-t hover:bg-zinc-50 ${selected?.id === h.id ? "bg-zinc-50" : ""}`} onClick={() => setSelectedId(h.id)} style={{ cursor: "pointer" }}>
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

      {/* RECENT SIGNALS */}
      <h2 className="mt-10 text-xl font-semibold">Recent signals</h2>
      {loading ? (
        <div className="mt-3 space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {recent.map((s) => (
            <li key={s.id} className="rounded-md border p-3">
              <span className="font-medium">{title(s.category)}</span>
              <span className="text-zinc-500"> · {title(s.severity)} · {s.district}, {s.state}</span>
              <p className="mt-1 text-zinc-700">{s.summary ?? "—"}</p>
            </li>
          ))}
          {recent.length === 0 && <p className="text-sm text-zinc-500">No signals yet.</p>}
        </ul>
      )}

      {/* CTA */}
      <section className="mt-10 rounded-md border p-6">
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

      {/* ASK JANSETU */}
      <h2 className="mt-10 text-xl font-semibold">Ask JanSetu</h2>
      <div className="mt-3">
        <AskJanSetu hotspots={hotspots} />
      </div>
    </main>
  );

  function emergingGap(id: string): string {
    const h = hotspots.find((x) => x.id === id);
    return h?.gap_index?.toFixed(2) ?? "—";
  }

  function emergingPriority(id: string): string {
    const h = hotspots.find((x) => x.id === id);
    return h ? title(h.priority_level) : "—";
  }
}
