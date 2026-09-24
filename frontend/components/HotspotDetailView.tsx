import Link from "next/link";
import { fmtInt, fmtInr, title } from "@/lib/api";
import type { HotspotDetail } from "@/lib/api";

const FACTOR_LABELS: Record<string, string> = {
  demand_index: "Demand Index",
  infra_gap: "Infrastructure Gap",
  pop_impact: "Population Impact",
  invest_gap: "Investment Gap",
  trend: "Trend",
};

export default function HotspotDetailView({ detail }: { detail: HotspotDetail }) {
  const h = detail.hotspot;
  const f = h.factors;
  const flagged: [string, string][] = [
    (f.demand_index ?? 0) >= 0.6
      ? ["✓", "High citizen demand"]
      : ["○", "Moderate citizen demand"],
    h.trend_pct == null
      ? ["○", "New signal cluster — not enough history for a trend"]
      : h.trend_pct > 5
        ? ["✓", `Increasing demand trend (${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%)`]
        : ["△", "Stable or declining demand trend"],
    (f.infra_gap ?? 0) >= 0.5
      ? ["✓", "Low infrastructure coverage"]
      : ["△", "Adequate infrastructure coverage"],
    (f.pop_impact ?? 0) >= 0.5
      ? ["✓", `Large affected population (${fmtInt(h.population)})`]
      : ["○", "Smaller population footprint"],
    (f.invest_gap ?? 0) >= 0.5
      ? ["✓", "Low existing investment"]
      : ["△", "Existing investment already present"],
  ];
  const evidence: [string, string][] = [
    ["Citizen signals", fmtInt(h.signals)],
    ["Recent demand (30d)", fmtInt(h.recent_30d)],
    ["Previous period", fmtInt(Math.max(0, h.signals - h.recent_30d))],
    ["Population affected", fmtInt(h.population)],
    ["Infrastructure coverage", detail.infrastructure?.coverage_index != null ? `${Math.round(detail.infrastructure.coverage_index * 100)}%` : "—"],
    ["Existing facilities", detail.infrastructure?.facility_count != null ? fmtInt(detail.infrastructure.facility_count) : "—"],
    ["Existing investment", fmtInr(h.investment_inr)],
    ["Priority score", h.priority_score.toFixed(2)],
  ];
  const simHref = `/simulate?state=${encodeURIComponent(h.state)}&district=${encodeURIComponent(h.district)}&category=${encodeURIComponent(h.category)}`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <p className="mt-4 text-sm font-semibold tracking-widest text-zinc-500">{h.district.toUpperCase()} DISTRICT</p>
      <h1 className="mt-1 text-3xl font-semibold">{title(h.category)} Access</h1>
      <p className="mt-2 inline-block rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
        {title(h.priority_level)} demand
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border p-3"><dt className="text-zinc-500">Demand trend</dt>
          <dd className="mt-1 text-lg font-semibold">{h.trend_pct == null ? "new" : `↑ ${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%`}</dd></div>
        <div className="rounded-md border p-3"><dt className="text-zinc-500">Population affected</dt>
          <dd className="mt-1 text-lg font-semibold">{fmtInt(h.population)}</dd></div>
        <div className="rounded-md border p-3"><dt className="text-zinc-500">Infrastructure gap</dt>
          <dd className="mt-1 text-lg font-semibold">{h.gap_index != null ? `${Math.round(h.gap_index * 100)}%` : "—"}</dd></div>
      </dl>
      <p className="mt-2 inline-block rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
        Prototype priority analysis — {title(h.priority_level)} priority
      </p>

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

      <h2 className="mt-8 text-xl font-semibold">Why this area is flagged</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {flagged.map(([mark, label]) => (
          <li key={label} className="flex gap-2">
            <span className="w-5">{mark}</span><span>{label}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">Development Recommendation</h2>
      <section className="mt-3 rounded-md border p-5">
        <p className="text-lg font-semibold">{detail.recommendation_structured?.intervention ?? detail.recommendation}</p>
        <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">WHY?</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          <li>✓ {fmtInt(h.signals)} citizen signals</li>
          <li>✓ {fmtInt(h.population)} people affected</li>
          <li>✓ Infrastructure gap: {h.gap_index != null ? `${Math.round(h.gap_index * 100)}%` : "—"}</li>
          <li>{h.trend_pct == null ? "○ Demand history still building" : `↑ Demand ${h.trend_pct >= 0 ? "increased" : "changed"} ${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%`}</li>
        </ul>
        <p className="mt-2 text-sm text-zinc-600">{detail.recommendation}</p>
        <p className="mt-3 text-xs text-zinc-500">
          Prototype analysis based on available demo/public data. Confidence{" "}
          {detail.recommendation_structured
            ? `${detail.recommendation_structured.confidence.toFixed(2)} (${detail.recommendation_structured.confidence_label})`
            : "is system-estimated"}.
        </p>
        <Link href={simHref} className="mt-4 inline-block rounded-md bg-black px-5 py-2.5 text-sm text-white">
          Simulate investment
        </Link>
      </section>
      <p className="mt-2 text-xs text-zinc-500">{detail.note}</p>
    </main>
  );
}
