import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtInt, fmtInr, hotspotHref, title } from "@/lib/api";
import type { CompareOut, HotspotDetail, NlMatch, RecommendationOut } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FACTOR_LABELS: Record<string, string> = {
  demand_index: "Demand Index",
  infra_gap: "Infrastructure Gap",
  pop_impact: "Population Impact",
  invest_gap: "Investment Gap",
  trend: "Trend",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function AskJanSetu({ district }: { district: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ matches: NlMatch[]; count: number; filters: Record<string, unknown> } | null>(null);

  async function ask() {
    setErr(null);
    setRes(null);
    if (!q.trim()) {
      setErr("Type a question first.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/v1/policy-query/nl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.trim() }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error("Could not answer that question.");
      setRes(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not answer that question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="w-full rounded-md border p-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Show rising healthcare hotspots near ${district}`}
          disabled={busy}
        />
        <Button onClick={ask} disabled={busy}>{busy ? "…" : "Ask"}</Button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
      {res && (
        <div className="mt-3 text-sm">
          <p className="font-medium">Interpreted request</p>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(res.filters)}</pre>
          <p className="mt-2 font-medium">Results ({res.count})</p>
          <ul className="mt-1 space-y-1">
            {res.matches.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link className="underline" href={hotspotHref(m)}>{m.district}, {m.state}</Link>
                {" "}— {title(m.category)} · {fmtInt(m.signals)} signals
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HotspotDetailView({ detail, rec, compare }: {
  detail: HotspotDetail;
  rec: RecommendationOut | null;
  compare: CompareOut | null;
}) {
  const h = detail.hotspot;
  const prior = Math.max(0, h.signals - h.recent_30d);
  const pulseLabel = h.trend_pct == null ? "Insufficient data" : h.trend_pct > 5 ? "Rising" : h.trend_pct < -5 ? "Declining" : "Stable";
  const why: [string, string][] = [
    ["Citizen demand", `${fmtInt(h.signals)} signals`],
    ["Recent trend", h.trend_pct == null ? "history building" : `${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%`],
    ["Infrastructure gap", h.gap_index != null ? h.gap_index.toFixed(2) : "—"],
    ["Population affected", fmtInt(h.population)],
    ["Existing investment", fmtInr(h.investment_inr)],
  ];
  const simBase = `/simulate?state=${encodeURIComponent(h.state)}&district=${encodeURIComponent(h.district)}&category=${encodeURIComponent(h.category)}`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>

      {/* HEADER */}
      <p className="mt-4 text-sm font-semibold tracking-widest text-zinc-500">{h.district.toUpperCase()} · {h.state.toUpperCase()}</p>
      <h1 className="mt-1 text-3xl font-semibold">{title(h.category)} Access</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded bg-red-100 px-2 py-1 text-red-800">{title(h.priority_level)} demand</span>
        <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">Trend: {h.trend_pct == null ? "new" : `${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%`}</span>
      </div>

      {/* 1. CITIZEN SIGNAL */}
      <Section title="Citizen signal">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Total relevant signals</dt><dd className="mt-1 text-lg font-semibold">{fmtInt(h.signals)}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Recent volume (30d)</dt><dd className="mt-1 text-lg font-semibold">{fmtInt(h.recent_30d)}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Trend</dt><dd className="mt-1 text-lg font-semibold">{h.trend_pct == null ? "new" : `${h.trend_pct >= 0 ? "+" : ""}${h.trend_pct}%`}</dd></div>
        </dl>
      </Section>

      {/* 2. INFRASTRUCTURE GAP */}
      <Section title="Infrastructure gap">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Gap index</dt><dd className="mt-1 text-lg font-semibold">{h.gap_index?.toFixed(2) ?? "—"}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Coverage</dt><dd className="mt-1 text-lg font-semibold">{detail.infrastructure?.coverage_index != null ? `${Math.round(detail.infrastructure.coverage_index * 100)}%` : "—"}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Existing facilities</dt><dd className="mt-1 text-lg font-semibold">{detail.infrastructure?.facility_count != null ? fmtInt(detail.infrastructure.facility_count) : "—"}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-zinc-500">Source: synthetic demonstration dataset (infrastructure table).</p>
      </Section>

      {/* 3. POPULATION */}
      <Section title="Population context">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Population</dt><dd className="mt-1 text-lg font-semibold">{fmtInt(h.population)}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Density</dt><dd className="mt-1 text-lg font-semibold">{detail.demographics?.population_density != null ? fmtInt(Math.round(detail.demographics.population_density)) : "—"}</dd></div>
        </dl>
      </Section>

      {/* 4. INVESTMENT */}
      <Section title="Current investment">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Existing investment</dt><dd className="mt-1 text-lg font-semibold">{fmtInr(h.investment_inr)}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-zinc-500">Active projects</dt><dd className="mt-1 text-lg font-semibold">{detail.investment?.active_projects ?? "—"}</dd></div>
        </dl>
      </Section>

      {/* 5. CIVICPULSE */}
      <Section title="CivicPulse">
        <div className="rounded-md border p-4 text-sm">
          <p className="font-semibold">Demand is {pulseLabel}</p>
          <p className="mt-1 text-zinc-600">
            {fmtInt(h.recent_30d)} signals in the last 30 days vs {fmtInt(prior)} in the prior 30 days
            {h.trend_pct != null && <> ({h.trend_pct >= 0 ? "+" : ""}{h.trend_pct}%)</>}.
          </p>
        </div>
      </Section>

      {/* 6. WHY */}
      <Section title="Why this hotspot?">
        <ul className="space-y-2 text-sm">
          {why.map(([k, v]) => (
            <li key={k} className="flex gap-3 rounded-md border p-3">
              <span className="w-44 shrink-0 text-zinc-500">• {k}</span>
              <span className="font-semibold">{v}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">What drives the score</h3>
        <ul className="mt-2 space-y-2">
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
      </Section>

      {/* 7. RECOMMENDATION */}
      <Section title="Recommended development action">
        <div className="rounded-md border p-5">
          <p className="text-lg font-semibold">{detail.recommendation_structured?.intervention ?? detail.recommendation}</p>
          {rec && (
            <>
              <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">DETERMINISTIC DATA</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {rec.reasoning.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="mt-2 text-sm">Affected population: <b>{fmtInt(rec.evidence.population_affected)}</b> ·
                Confidence: <b>{rec.recommendation.confidence.toFixed(2)}</b> ({rec.recommendation.confidence_label})</p>
              <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">AI EXPLANATION</h3>
              <p className="mt-1 text-sm text-zinc-600">
                AI-generated explanation based on supplied evidence ({rec.explanation_source}).
              </p>
              <p className="mt-1 text-sm">{rec.explanation.summary}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600">
                {rec.explanation.evidence_points.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs text-zinc-500">Prototype analysis based on available demo/public data. Evidence indicates — the policymaker decides.</p>
        </div>
      </Section>

      {/* 8. ACTIONS */}
      <Section title="Policy actions">
        <div className="flex flex-wrap gap-3">
          <Link href={simBase} className="rounded-md bg-black px-4 py-2 text-sm text-white">Simulate intervention</Link>
          <Link href={`${simBase}&compare=1`} className="rounded-md border px-4 py-2 text-sm">Compare options</Link>
          <Link href="/dashboard#civic-pulse" className="rounded-md border px-4 py-2 text-sm">View CivicPulse</Link>
        </div>
      </Section>

      {/* 9. SCENARIO PREVIEW */}
      {compare && (
        <Section title="Scenario preview">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50">
                <tr><th className="px-3 py-2">Intervention</th><th className="px-3 py-2">Budget</th><th className="px-3 py-2">Reached</th><th className="px-3 py-2">Gap reduction</th><th className="px-3 py-2">Coverage</th></tr>
              </thead>
              <tbody>
                {compare.comparison.map((c) => (
                  <tr key={c.budget_cr} className="border-t">
                    <td className="px-3 py-2">{title(compare.scenario.intervention)}</td>
                    <td className="px-3 py-2">₹{c.budget_cr} Cr</td>
                    <td className="px-3 py-2">{fmtInt(c.population_reached)}</td>
                    <td className="px-3 py-2">{(c.gap_reduction * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2">+{(c.coverage_improvement * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Prototype scenario estimate — not a guaranteed outcome.</p>
        </Section>
      )}

      {/* 10. ASK */}
      <Section title="Ask JanSetu">
        <AskJanSetu district={h.district} />
      </Section>

      {/* 11. TRANSPARENCY */}
      <Section title="Data & AI transparency">
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Data</dt><dd>Synthetic demonstration dataset</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">AI</dt><dd>Google Gemini (extraction + explanations only)</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Numerical calculations</dt><dd>Deterministic backend engines</dd></div>
          <div className="flex gap-2"><dt className="w-48 shrink-0 text-zinc-500">Scenario modeling</dt><dd>Prototype estimates</dd></div>
        </dl>
      </Section>

      <p className="mt-6 text-xs text-zinc-500">{detail.note}</p>
    </main>
  );
}
