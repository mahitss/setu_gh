"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Map from "@/components/Map";
import { Button } from "@/components/ui/button";
import { apiGet, fmtInt, hotspotHref, title, trendLabel } from "@/lib/api";
import type { EmergingHotspot, Hotspot, PulseItem, Summary } from "@/lib/api";

const CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRIORITIES = ["critical", "high", "medium", "low", "minimal"];

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [emerging, setEmerging] = useState<EmergingHotspot[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [fState, setFState] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [nlResult, setNlResult] = useState<{ matches: Hotspot[]; count: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadHotspots(signal: AbortSignal, filters: Record<string, string>) {
    const q = new URLSearchParams({ limit: "50" });
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const h = await apiGet<{ hotspots: Hotspot[] }>(`/api/v1/hotspots?${q}`, signal);
    setHotspots(h.hotspots);
  }

  // Filtered reloads hit the backend API — never fake client-side filtering.
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

  async function askNl() {
    setNlError(null);
    setNlResult(null);
    if (!question.trim()) {
      setNlError("Type a question first.");
      return;
    }
    setNlLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/policy-query/nl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Could not answer that question. Try simpler wording.");
      setNlResult(data);
    } catch (e) {
      setNlError(e instanceof Error ? e.message : "Could not answer that question.");
    } finally {
      setNlLoading(false);
    }
  }

  // Initial load: summary + pulse + states + unfiltered hotspots.
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

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
      </main>
    );
  }
  if (loading || !summary) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-zinc-600">Loading dashboard…</p>
      </main>
    );
  }

  const kpis = [
    ["Citizen Signals", fmtInt(summary.citizen_signals)],
    ["Active Hotspots", fmtInt(summary.active_hotspots)],
    ["High Priority Areas", fmtInt(summary.high_priority_areas)],
    ["Population Affected", fmtInt(summary.population_affected)],
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-medium text-zinc-500">JanSetu · Policymaker Intelligence</p>
      <h1 className="mt-1 text-3xl font-semibold">Demand dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Synthetic demo data. Metrics computed deterministically.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-md border p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Demand hotspots</h2>
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

      <div className="mt-4">
        <Map hotspots={hotspots} />
      </div>

      {hotspots.length === 0 ? (
        <p className="mt-4 rounded-md border p-4 text-zinc-600">No hotspots match these filters.</p>
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
                <tr key={h.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link className="underline" href={hotspotHref(h)}>{h.district}, {h.state}</Link>
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

      <h2 className="mt-10 text-xl font-semibold">Civic Pulse — emerging demand</h2>
      <p className="mt-1 text-sm text-zinc-500">Last 30 days vs prior 30 days.</p>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {pulse.map((p) => (
          <div key={p.category} className="rounded-md border p-4">
            <p className="font-medium">{title(p.category)}</p>
            {p.status === "insufficient_data" ? (
              <p className="mt-1 text-sm text-zinc-500">insufficient_data — not enough history yet</p>
            ) : (
              <>
                <p className={`mt-1 text-2xl font-semibold ${(p.trend_percent ?? 0) >= 0 ? "text-red-700" : "text-green-700"}`}>
                  {trendLabel(p.trend_percent)}
                </p>
                <p className="mt-1 inline-block rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                  {title(p.status)}
                </p>
              </>
            )}
            <p className="mt-1 text-sm text-zinc-500">{fmtInt(p.current_count)} signals (30d)</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Emerging hotspots</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {emerging.map((e) => (
          <Link key={e.id} href={`/hotspots/${encodeURIComponent(e.id)}`} className="rounded-md border p-4 hover:bg-zinc-50">
            <p className="font-medium">{e.district}, {e.state}</p>
            <p className="text-sm text-zinc-600">{title(e.category)}</p>
            <p className="mt-1 text-xl font-semibold text-red-700">↑ {e.trend_percent}%</p>
          </Link>
        ))}
        {emerging.length === 0 && <p className="text-sm text-zinc-500">No emerging hotspots right now.</p>}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Ask in plain English</h2>
      <p className="mt-1 text-sm text-zinc-500">e.g. “Which districts have high healthcare demand but low existing investment?”</p>
      <div className="mt-3 flex gap-2">
        <input
          className="w-full rounded-md border p-2 text-sm"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about demand, gaps, investment…"
          disabled={nlLoading}
        />
        <Button onClick={askNl} disabled={nlLoading}>{nlLoading ? "…" : "Ask"}</Button>
      </div>
      {nlError && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{nlError}</p>}
      {nlResult && (
        <div className="mt-3 rounded-md border p-4 text-sm">
          <p className="font-medium">{nlResult.count} matching district{nlResult.count === 1 ? "" : "s"}</p>
          <ul className="mt-2 space-y-1">
            {nlResult.matches.slice(0, 10).map((m) => (
              <li key={m.id}>
                <Link className="underline" href={hotspotHref(m)}>
                  {m.district}, {m.state}
                </Link>{" "}— {title(m.category)} · {fmtInt(m.signals)} signals · gap {m.gap_index?.toFixed(2) ?? "—"}
              </li>
            ))}
          </ul>
          {nlResult.count === 0 && <p className="mt-1 text-zinc-500">No districts match. Try broader wording.</p>}
        </div>
      )}
    </main>
  );
}
