"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet, fmtInt, fmtInr, title } from "@/lib/api";
import type { HotspotDetail } from "@/lib/api";

const FACTOR_LABELS: Record<string, string> = {
  demand_index: "Demand Index",
  infra_gap: "Infrastructure Gap",
  pop_impact: "Population Impact",
  invest_gap: "Investment Gap",
  trend: "Trend",
};

export default function HotspotDetailPage() {
  const params = useParams<{ state: string; district: string; category: string }>();
  const [detail, setDetail] = useState<HotspotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const path = `/api/v1/hotspots/${encodeURIComponent(params.state)}/${encodeURIComponent(params.district)}/${encodeURIComponent(params.category)}`;
    apiGet<HotspotDetail>(path, ctrl.signal)
      .then(setDetail)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Could not load this hotspot. It may not exist or the server is unreachable.");
      });
    return () => ctrl.abort();
  }, [params]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block underline">Back to dashboard</Link>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-zinc-600">Loading hotspot…</p>
      </main>
    );
  }

  const h = detail.hotspot;
  const evidence: [string, string][] = [
    ["Citizen signals", fmtInt(h.signals)],
    ["Signals (last 30d)", fmtInt(h.recent_30d)],
    ["Population", fmtInt(h.population)],
    ["Infrastructure gap", h.gap_index?.toFixed(2) ?? "—"],
    ["Existing investment", fmtInr(h.investment_inr)],
    ["Priority score", h.priority_score.toFixed(2)],
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-semibold">
        {title(h.category)} in {h.district}, {h.state}
      </h1>

      <h2 className="mt-8 text-xl font-semibold">Evidence</h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {evidence.map(([k, v]) => (
          <div key={k} className="rounded-md border p-3">
            <dt className="text-sm text-zinc-500">{k}</dt>
            <dd className="mt-1 text-lg font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-xl font-semibold">What drives the score</h2>
      <ul className="mt-3 space-y-2">
        {Object.entries(h.factors).map(([k, v]) => (
          <li key={k} className="flex items-center gap-3 text-sm">
            <span className="w-44">{FACTOR_LABELS[k] ?? k}</span>
            <span className="h-2 flex-1 rounded bg-zinc-100">
              <span className="block h-2 rounded bg-black" style={{ width: `${Math.round(v * 100)}%` }} />
            </span>
            <span className="w-12 text-right font-medium">{v.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">Recommendation</h2>
      <p className="mt-2 rounded-md border p-4">{detail.recommendation}</p>
      <p className="mt-2 text-xs text-zinc-500">{detail.note}</p>
    </main>
  );
}
