"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { apiGet, fmtInt, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot } from "@/lib/api";

const CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRIORITIES = ["critical", "high", "medium", "low", "minimal"];

function HotspotsPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [total, setTotal] = useState(0);
  const [states, setStates] = useState<string[]>([]);
  const [fState, setFState] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(signal: AbortSignal, filters: Record<string, string>) {
    const q = new URLSearchParams({ limit: "50" });
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const h = await apiGet<{ hotspots: Hotspot[]; count: number }>(`/api/v1/hotspots?${q}`, signal);
    setHotspots(h.hotspots);
    setTotal(h.count);
  }

  function refetch(filters: Record<string, string>) {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    load(ctrl.signal, filters)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiGet<{ hotspots: Hotspot[]; count: number }>("/api/v1/hotspots?limit=100", ctrl.signal),
    ])
      .then(([h]) => {
        setHotspots(h.hotspots.slice(0, 50));
        setTotal(h.count);
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

  function onFilter(patch: Record<string, string>) {
    const f = { state: fState, district: fDistrict, category: fCategory, priority: fPriority, ...patch };
    if (patch.state !== undefined) f.district = "";
    setFState(f.state);
    setFDistrict(f.district);
    setFCategory(f.category);
    setFPriority(f.priority);
    refetch(f);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link href="/" className="underline hover:text-black">Home</Link>
        <span> → Hotspot intelligence</span>
      </nav>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Hotspot intelligence</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {loading ? "Loading…" : `${fmtInt(total)} hotspots · deterministic ranking`} · Synthetic demonstration dataset.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <label>State{" "}
          <select className="rounded-md border p-1.5" value={fState} onChange={(e) => onFilter({ state: e.target.value })}>
            <option value="">All</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>District{" "}
          <select className="rounded-md border p-1.5" value={fDistrict} onChange={(e) => onFilter({ district: e.target.value })}>
            <option value="">All</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>Category{" "}
          <select className="rounded-md border p-1.5" value={fCategory} onChange={(e) => onFilter({ category: e.target.value })}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{title(c)}</option>)}
          </select>
        </label>
        <label>Priority{" "}
          <select className="rounded-md border p-1.5" value={fPriority} onChange={(e) => onFilter({ priority: e.target.value })}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{title(p)}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading hotspots…</p>
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
                <tr key={h.id} className="border-t hover:bg-zinc-50">
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
    </main>
  );
}

export default function HotspotsRoute() {
  return (
    <RequireAuth>
      <HotspotsPage />
    </RequireAuth>
  );
}
