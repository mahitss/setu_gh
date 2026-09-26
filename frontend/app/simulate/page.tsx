"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import RequireAuth from "@/components/RequireAuth";
import { STATE_DISTRICTS, apiGet, fmtInt, fmtInr, title, trendLabel } from "@/lib/api";
import type { Hotspot } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PRESETS = [50, 100, 250, 500];
const COMPARE_BUDGETS = [50, 100, 250];

type SimOut = {
  label: string;
  scenario: { state: string; district: string; category: string; budget_inr: number; budget_cr: number; intervention: string };
  baseline: { population_affected: number; coverage_index: number; gap_index: number; facility_count: number; existing_investment_inr: number };
  estimate: { population_reached: number; coverage_improvement: number; gap_reduction: number; locations_affected: number; estimated_cost_per_person: number };
  assumptions: string[];
};

type CompareOut = {
  label: string;
  scenario: { intervention: string };
  comparison: { budget_cr: number; population_reached: number; coverage_improvement: number; gap_reduction: number }[];
  assumptions: string[];
};

function Simulator() {
  const params = useSearchParams();
  const [state, setState] = useState(params.get("state") ?? "Uttar Pradesh");
  const [district, setDistrict] = useState(params.get("district") ?? "Lucknow");
  const [sector, setSector] = useState(params.get("category") ?? "healthcare");
  const [interventions, setInterventions] = useState<Record<string, string[]>>({});
  const [intervention, setIntervention] = useState("");
  const [budgetCr, setBudgetCr] = useState(100);
  const [custom, setCustom] = useState("100");
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimOut | null>(null);
  const [compare, setCompare] = useState<CompareOut | null>(null);
  const [context, setContext] = useState<Hotspot | null>(null);
  const autoCompared = useRef(false);
  const [sliderCr, setSliderCr] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ interventions: Record<string, string[]> }>("/api/v1/simulate/interventions")
      .then((d) => setInterventions(d.interventions))
      .catch(() => setInterventions({}));
  }, []);

  const options = interventions[sector] ?? [];
  const effectiveIntervention = options.includes(intervention) ? intervention : options[0] ?? "";

  // Debounced slider: display updates instantly, simulation fires when idle.
  useEffect(() => {
    if (sliderCr == null) return;
    const t = setTimeout(() => {
      void doRun(state, district, sector, sliderCr, effectiveIntervention);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliderCr]);

  // District context (demand, trend, gap, investment) — always from the API.
  useEffect(() => {
    const ctrl = new AbortController();
    const q = new URLSearchParams({ state, district, category: sector, limit: "1" });
    apiGet<{ hotspots: Hotspot[] }>(`/api/v1/hotspots?${q}`, ctrl.signal)
      .then((h) => setContext(h.hotspots[0] ?? null))
      .catch(() => setContext(null));
    return () => ctrl.abort();
  }, [state, district, sector]);

  async function doRun(st: string, di: string, cat: string, cr: number, interv: string | undefined) {
    setError(null);
    setResult(null);
    setCompare(null);
    if (!Number.isFinite(cr) || cr <= 0) {
      setError("Enter a budget greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: st, district: di, category: cat, budget: cr * 1e7, intervention: interv || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Could not run the simulation. Please try again.");
      setResult(data);
      setBudgetCr(cr);
      setCustom(String(cr));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run the simulation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function run(cr: number) {
    void doRun(state, district, sector, cr, effectiveIntervention);
  }

  function onSlider(v: number) {
    setBudgetCr(v);
    setCustom(String(v));
    setSliderCr(v);
  }

  function changeLocation(s: string, d: string, c: string, i: string) {
    setSliderCr(null);
    setState(s);
    setDistrict(d);
    setSector(c);
    setIntervention(i);
    setResult(null);
    setCompare(null);
    setError(null);
  }

  async function runCompare() {
    setError(null);
    setComparing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/simulate/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, district, category: sector, intervention: effectiveIntervention || undefined, budgets_cr: COMPARE_BUDGETS }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Could not compare scenarios.");
      setCompare(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compare scenarios.");
    } finally {
      setComparing(false);
    }
  }

  useEffect(() => {
    if (params.get("compare") === "1" && !autoCompared.current && effectiveIntervention) {
      autoCompared.current = true;
      void (async () => {
        await runCompare();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIntervention]);

  const projCoverage = result ? result.baseline.coverage_index + result.estimate.coverage_improvement : 0;
  const projGap = result ? Math.max(0, result.baseline.gap_index - result.estimate.gap_reduction) : 0;
  const maxReach = Math.max(...(compare?.comparison.map((c) => c.population_reached) ?? [1]), 1);

  return (
    <RequireAuth>
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-sm font-semibold tracking-widest text-zinc-500">INVESTMENT SCENARIO LAB</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Explore prototype development scenarios using JanSetu&apos;s civic intelligence.</h1>
      <p className="mt-1 text-xs text-zinc-500">Prototype scenario estimates — not guaranteed outcomes.</p>

      {/* CONTEXT */}
      <section className="mt-6 rounded-md border p-5" aria-label="District context">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500">DISTRICT CONTEXT</h2>
        {context ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-zinc-500">District</dt><dd className="font-semibold">{context.district}, {context.state}</dd></div>
            <div><dt className="text-zinc-500">Primary civic need</dt><dd className="font-semibold">{title(context.category)}</dd></div>
            <div><dt className="text-zinc-500">Citizen demand</dt><dd className="font-semibold">{fmtInt(context.signals)} signals</dd></div>
            <div><dt className="text-zinc-500">Trend</dt><dd className="font-semibold">{trendLabel(context.trend_pct)}</dd></div>
            <div><dt className="text-zinc-500">Infrastructure gap</dt><dd className="font-semibold">{context.gap_index?.toFixed(2) ?? "—"}</dd></div>
            <div><dt className="text-zinc-500">Current investment</dt><dd className="font-semibold">{fmtInr(context.investment_inr)}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No hotspot row for this district/sector combination — simulation still uses baseline demographics and infrastructure.</p>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="s-state">State</label>
          <select id="s-state" className="mt-2 w-full rounded-md border p-2" value={state} disabled={loading}
            onChange={(e) => changeLocation(e.target.value, STATE_DISTRICTS[e.target.value][0], sector, "")}>
            {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-district">District</label>
          <select id="s-district" className="mt-2 w-full rounded-md border p-2" value={district} disabled={loading}
            onChange={(e) => changeLocation(state, e.target.value, sector, "")}>
            {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-sector">Sector</label>
          <select id="s-sector" className="mt-2 w-full rounded-md border p-2" value={sector} disabled={loading}
            onChange={(e) => changeLocation(state, district, e.target.value, "")}>
            {Object.keys(interventions).map((s) => <option key={s} value={s}>{title(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-interv">Intervention</label>
          <select id="s-interv" className="mt-2 w-full rounded-md border p-2" value={effectiveIntervention} disabled={loading}
            onChange={(e) => { setIntervention(e.target.value); setResult(null); setCompare(null); }}>
            {(interventions[sector] ?? []).map((i) => <option key={i} value={i}>{title(i)}</option>)}
          </select>
        </div>
      </div>

      <label className="mt-6 block text-sm font-medium" htmlFor="s-budget">Budget: ₹{budgetCr} Cr</label>
      <input id="s-budget" type="range" min={10} max={500} step={5} value={Math.min(500, Math.max(10, budgetCr))}
        className="mt-2 w-full" disabled={loading} onChange={(e) => onSlider(Number(e.target.value))} />
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p} className={`rounded-md border px-3 py-1 text-sm ${budgetCr === p ? "bg-black text-white" : ""}`}
            onClick={() => run(p)} disabled={loading}>₹{p} Cr</button>
        ))}
        <span className="flex items-center gap-1 text-sm">
          <input className="w-20 rounded-md border p-1" value={custom} inputMode="decimal"
            onChange={(e) => setCustom(e.target.value)} disabled={loading} aria-label="Custom budget in crore" />
          <Button variant="outline" size="sm" onClick={() => run(Number(custom))} disabled={loading}>Apply</Button>
        </span>
      </div>

      {error && <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-4 text-sm text-zinc-500">Simulating…</p>}

      {result && (
        <>
          <section className="mt-6 rounded-md border p-5" aria-label="Before after">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500">CURRENT → INTERVENTION → PROJECTED</h2>
            <p className="mt-1 text-sm font-medium">{title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr</p>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="font-semibold">Coverage</p>
                <p>Current: <b>{(result.baseline.coverage_index * 100).toFixed(0)}%</b></p>
                <p>Projected: <b>{(projCoverage * 100).toFixed(1)}%</b></p>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="font-semibold">Gap</p>
                <p>Current: <b>{(result.baseline.gap_index * 100).toFixed(0)}%</b></p>
                <p>Projected: <b>{(projGap * 100).toFixed(1)}%</b></p>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="font-semibold">Population reached</p>
                <p className="text-lg font-semibold">{fmtInt(result.estimate.population_reached)}</p>
                <p className="text-xs text-zinc-500">Prototype estimate</p>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-md border p-5">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
              SCENARIO ESTIMATE — {title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr
            </h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Estimated reach</dt><dd className="font-semibold">{fmtInt(result.estimate.population_reached)} <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Coverage improvement</dt><dd className="font-semibold">+{(result.estimate.coverage_improvement * 100).toFixed(1)}% <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Gap reduction</dt><dd className="font-semibold">{(result.estimate.gap_reduction * 100).toFixed(1)}% <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Locations affected</dt><dd className="font-semibold">{result.estimate.locations_affected}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">HOW THIS ESTIMATE WORKS</h3>
            <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600">
              {result.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </section>

          {context && (
            <section className="mt-4 rounded-md border p-5">
              <h2 className="text-sm font-semibold tracking-wide text-zinc-500">WHY THIS SCENARIO?</h2>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Citizen demand: <b>{fmtInt(context.signals)} signals</b> in {context.district}</li>
                <li>• Infrastructure gap: <b>{context.gap_index?.toFixed(2) ?? "—"}</b></li>
                <li>• Population context: <b>{fmtInt(context.population)}</b> people</li>
                <li>• Existing investment: <b>{fmtInr(context.investment_inr)}</b></li>
              </ul>
            </section>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={runCompare} disabled={loading || comparing}>
              {comparing ? "Comparing…" : "Compare ₹50 / ₹100 / ₹250 Cr"}
            </Button>
          </div>
        </>
      )}

      {compare && (
        <section className="mt-4 rounded-md border p-5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500">COMPARE SCENARIOS — {title(compare.scenario.intervention)}</h2>
          <div className="mt-3 overflow-x-auto rounded-md border">
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
          <div className="mt-3 space-y-2">
            {compare.comparison.map((c) => (
              <div key={c.budget_cr} className="flex items-center gap-3 text-sm">
                <span className="w-20">₹{c.budget_cr} Cr</span>
                <span className="h-3 flex-1 rounded bg-zinc-100">
                  <span className="block h-3 rounded bg-black" style={{ width: `${Math.round((c.population_reached / maxReach) * 100)}%` }} />
                </span>
                <span className="w-24 text-right">{fmtInt(c.population_reached)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{compare.label}</p>
        </section>
      )}

      {result && (
        <section className="mt-4 rounded-md border p-5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500">SCENARIO SUMMARY</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">District</dt><dd className="font-medium">{result.scenario.district}, {result.scenario.state}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Need</dt><dd className="font-medium">{title(result.scenario.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Selected intervention</dt><dd className="font-medium">{title(result.scenario.intervention)}</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Budget</dt><dd className="font-medium">₹{result.scenario.budget_cr} Cr</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Estimated effect</dt><dd className="font-medium">{fmtInt(result.estimate.population_reached)} reached, gap −{(result.estimate.gap_reduction * 100).toFixed(1)}%</dd></div>
            <div className="flex gap-2"><dt className="w-40 shrink-0 text-zinc-500">Evidence</dt><dd className="font-medium">{context ? `${fmtInt(context.signals)} signals, gap ${context.gap_index?.toFixed(2) ?? "—"}` : "baseline demographics and infrastructure"}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            {context && (
              <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-md border px-4 py-2 text-sm">
                Return to hotspot
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={runCompare} disabled={loading || comparing}>Compare scenarios</Button>
          </div>
        </section>
      )}

      <section className="mt-4 rounded-md bg-zinc-50 p-4 text-xs text-zinc-600">
        <p className="font-semibold">Transparency</p>
        <p className="mt-1">Data — citizen signals: synthetic demonstration dataset. AI — Gemini assists with language understanding and explanation. Numerical model — deterministic JanSetu simulation engine. Scenario status — prototype estimate.</p>
      </section>
    </main>
    </RequireAuth>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-6 py-12"><p className="text-zinc-600">Loading simulator…</p></main>}>
      <Simulator />
    </Suspense>
  );
}
