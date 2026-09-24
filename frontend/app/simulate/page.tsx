"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STATE_DISTRICTS, apiGet, fmtInt, title } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PRESETS = [10, 25, 50, 100, 250, 500];
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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimOut | null>(null);
  const [compare, setCompare] = useState<CompareOut | null>(null);

  useEffect(() => {
    apiGet<{ interventions: Record<string, string[]> }>("/api/v1/simulate/interventions")
      .then((d) => setInterventions(d.interventions))
      .catch(() => setInterventions({}));
  }, []);

  const options = interventions[sector] ?? [];
  const effectiveIntervention = options.includes(intervention) ? intervention : options[0] ?? "";

  async function run(cr: number) {
    setError(null);
    setResult(null);
    if (!Number.isFinite(cr) || cr <= 0) {
      setError("Enter a budget greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, district, category: sector, budget: cr * 1e7, intervention: effectiveIntervention || undefined }),
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

  async function runCompare() {
    setError(null);
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
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-zinc-500">Policy Scenario Simulator</p>
      <h1 className="mt-1 text-3xl font-semibold">What could this budget achieve?</h1>
      <p className="mt-1 text-xs text-zinc-500">Scenario estimate — prototype simulation, not a guaranteed outcome.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="s-state">State</label>
          <select id="s-state" className="mt-2 w-full rounded-md border p-2" value={state} disabled={loading}
            onChange={(e) => { setState(e.target.value); setDistrict(STATE_DISTRICTS[e.target.value][0]); }}>
            {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-district">District</label>
          <select id="s-district" className="mt-2 w-full rounded-md border p-2" value={district} disabled={loading}
            onChange={(e) => setDistrict(e.target.value)}>
            {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-sector">Sector</label>
          <select id="s-sector" className="mt-2 w-full rounded-md border p-2" value={sector} disabled={loading}
            onChange={(e) => setSector(e.target.value)}>
            {Object.keys(interventions).map((s) => <option key={s} value={s}>{title(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="s-interv">Intervention</label>
          <select id="s-interv" className="mt-2 w-full rounded-md border p-2" value={effectiveIntervention} disabled={loading}
            onChange={(e) => setIntervention(e.target.value)}>
            {(interventions[sector] ?? []).map((i) => <option key={i} value={i}>{title(i)}</option>)}
          </select>
        </div>
      </div>

      <label className="mt-6 block text-sm font-medium" htmlFor="s-budget">Budget: ₹{budgetCr} Cr</label>
      <input id="s-budget" type="range" min={10} max={500} step={5} value={Math.min(500, Math.max(10, budgetCr))}
        className="mt-2 w-full" disabled={loading}
        onChange={(e) => run(Number(e.target.value))} />
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
          <section className="mt-6 rounded-md border p-5">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500">CURRENT STATE</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Population affected</dt><dd className="font-semibold">{fmtInt(result.baseline.population_affected)}</dd></div>
              <div className="flex justify-between"><dt>Coverage</dt><dd className="font-semibold">{(result.baseline.coverage_index * 100).toFixed(0)}%</dd></div>
              <div className="flex justify-between"><dt>Infrastructure gap</dt><dd className="font-semibold">{(result.baseline.gap_index * 100).toFixed(0)}%</dd></div>
            </dl>
          </section>
          <section className="mt-4 rounded-md border p-5">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
              SCENARIO ESTIMATE — {title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr
            </h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Estimated reach</dt><dd className="font-semibold">{fmtInt(result.estimate.population_reached)}</dd></div>
              <div className="flex justify-between"><dt>Coverage improvement</dt><dd className="font-semibold">+{(result.estimate.coverage_improvement * 100).toFixed(1)}%</dd></div>
              <div className="flex justify-between"><dt>Gap reduction</dt><dd className="font-semibold">{(result.estimate.gap_reduction * 100).toFixed(1)}%</dd></div>
              <div className="flex justify-between"><dt>Locations affected</dt><dd className="font-semibold">{result.estimate.locations_affected}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">ASSUMPTIONS</h3>
            <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600">
              {result.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </section>
          <Button className="mt-4" variant="outline" onClick={runCompare} disabled={loading}>
            Compare ₹50 / ₹100 / ₹250 Cr
          </Button>
        </>
      )}

      {compare && (
        <section className="mt-4 overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr><th className="px-3 py-2" /><th className="px-3 py-2">₹50 Cr</th><th className="px-3 py-2">₹100 Cr</th><th className="px-3 py-2">₹250 Cr</th></tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="px-3 py-2 font-medium">Population reached</td>
                {compare.comparison.map((c) => <td key={c.budget_cr} className="px-3 py-2">{fmtInt(c.population_reached)}</td>)}</tr>
              <tr className="border-t"><td className="px-3 py-2 font-medium">Coverage</td>
                {compare.comparison.map((c) => <td key={c.budget_cr} className="px-3 py-2">+{(c.coverage_improvement * 100).toFixed(1)}%</td>)}</tr>
              <tr className="border-t"><td className="px-3 py-2 font-medium">Gap reduction</td>
                {compare.comparison.map((c) => <td key={c.budget_cr} className="px-3 py-2">{(c.gap_reduction * 100).toFixed(1)}%</td>)}</tr>
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-zinc-500">{compare.label}</p>
        </section>
      )}
    </main>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-6 py-12"><p className="text-zinc-600">Loading simulator…</p></main>}>
      <Simulator />
    </Suspense>
  );
}
