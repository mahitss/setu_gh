"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Map from "@/components/Map";
import { apiGet, fmtInt, fmtInr, title } from "@/lib/api";
import type { Hotspot, PulseItem, Summary } from "@/lib/api";

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiGet<Summary>("/api/v1/dashboard/summary", ctrl.signal),
      apiGet<{ hotspots: Hotspot[] }>("/api/v1/hotspots", ctrl.signal),
      apiGet<{ pulse: PulseItem[] }>("/api/v1/civic-pulse", ctrl.signal),
    ])
      .then(([s, h, p]) => {
        setSummary(s);
        setHotspots(h.hotspots);
        setPulse(p.pulse);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
      });
    return () => ctrl.abort();
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
      </main>
    );
  }
  if (!summary) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-zinc-600">Loading dashboard…</p>
      </main>
    );
  }

  const kpis = [
    ["Citizen Signals", fmtInt(summary.total_signals)],
    ["Active Hotspots", fmtInt(summary.active_hotspots)],
    ["High Priority Areas", fmtInt(summary.high_priority_areas)],
    ["Population Covered", fmtInt(summary.population_covered)],
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Policymaker dashboard</h1>
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
      <div className="mt-4">
        <Map hotspots={hotspots} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {["District", "Issue", "Signals", "Last 30d", "Gap", "Population", "Investment", "Priority"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hotspots.slice(0, 20).map((h) => (
              <tr key={`${h.state}-${h.district}-${h.category}`} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    className="underline"
                    href={`/hotspots/${encodeURIComponent(h.state)}/${encodeURIComponent(h.district)}/${encodeURIComponent(h.category)}`}
                  >
                    {h.district}, {h.state}
                  </Link>
                </td>
                <td className="px-3 py-2">{title(h.category)}</td>
                <td className="px-3 py-2">{fmtInt(h.signals)}</td>
                <td className="px-3 py-2">{fmtInt(h.recent_30d)}</td>
                <td className="px-3 py-2">{h.gap_index?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2">{fmtInt(h.population)}</td>
                <td className="px-3 py-2">{fmtInr(h.investment_inr)}</td>
                <td className="px-3 py-2">{h.priority_score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Civic Pulse — emerging demand</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {pulse.map((p) => (
          <div key={p.category} className="rounded-md border p-4">
            <p className="font-medium">{title(p.category)}</p>
            <p className={`mt-1 text-2xl font-semibold ${p.growth_pct >= 0 ? "text-red-700" : "text-green-700"}`}>
              {p.growth_pct >= 0 ? "+" : ""}{p.growth_pct}%
            </p>
            <p className="mt-1 text-sm text-zinc-500">{fmtInt(p.recent_30d)} signals (30d)</p>
          </div>
        ))}
      </div>
    </main>
  );
}
