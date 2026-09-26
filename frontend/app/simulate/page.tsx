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

const SELECT_CLS =
  "h-[52px] w-full appearance-none rounded-md border border-[#d8d8d8] bg-white pl-4 pr-10 text-[15px]";

function LabSelect({ id, label, value, onChange, disabled, children }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
      <div className="relative mt-2">
        <select id={id} className={SELECT_CLS} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">▾</span>
      </div>
    </div>
  );
}

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
    <main className="mx-auto max-w-7xl px-6 md:px-10 py-12">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold tracking-widest text-zinc-500">INVESTMENT SCENARIO LAB</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight">Model development interventions before committing resources.</h1>
          <p className="mt-3 max-w-xl text-zinc-600">
            Explore prototype investment scenarios using JanSetu&apos;s civic intelligence,
            infrastructure gaps and citizen demand.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Prototype estimates — not guaranteed outcomes.</p>
        </div>
        <aside className="h-fit rounded-md border p-4 text-sm" aria-label="Scenario status">
          <p className="text-xs font-semibold tracking-widest text-zinc-500">SCENARIO STATUS</p>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between"><dt className="text-zinc-500">Mode</dt><dd className="font-medium">Prototype</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Engine</dt><dd className="font-medium">Deterministic simulation</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Evidence</dt><dd className="font-medium">{context ? "linked" : "baseline only"}</dd></div>
          </dl>
        </aside>
      </div>

      {/* CONTEXT */}
      <section className="mt-8 rounded-md border p-6" aria-label="District context">
        <h2 className="text-sm font-semibold tracking-widest text-zinc-500">DISTRICT INTELLIGENCE</h2>
        {context ? (
          <>
            <p className="mt-2 font-serif text-2xl font-semibold">{context.district}</p>
            <p className="text-sm text-zinc-500">{context.state}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div><dd className="text-2xl font-semibold">{title(context.category)}</dd><dt className="mt-1 text-xs text-zinc-500">Primary need</dt></div>
              <div><dd className="text-2xl font-semibold">{fmtInt(context.signals)}</dd><dt className="mt-1 text-xs text-zinc-500">Citizen demand · {trendLabel(context.trend_pct)}</dt></div>
              <div><dd className="text-2xl font-semibold">{context.gap_index?.toFixed(2) ?? "—"}</dd><dt className="mt-1 text-xs text-zinc-500">Infrastructure gap</dt></div>
              <div><dd className="text-2xl font-semibold">{fmtInr(context.investment_inr)}</dd><dt className="mt-1 text-xs text-zinc-500">Current investment</dt></div>
              <div><dd className="text-2xl font-semibold">{fmtInt(context.population)}</dd><dt className="mt-1 text-xs text-zinc-500">Population context</dt></div>
              <div><dd className="text-2xl font-semibold">{context.priority_score.toFixed(2)}</dd><dt className="mt-1 text-xs text-zinc-500">Priority score</dt></div>
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No hotspot row for this district/sector combination — simulation still uses baseline demographics and infrastructure.</p>
        )}
      </section>

      {/* BUILDER */}
      <section id="scenario-builder" className="mt-8 rounded-md border p-6" aria-label="Scenario builder">
        <h2 className="font-serif text-2xl font-semibold">Build a scenario</h2>
        <p className="mt-1 text-sm text-zinc-600">Choose where and how much to invest. JanSetu calculates a prototype impact estimate from the selected district context.</p>
        <h3 className="mt-6 text-xs font-semibold tracking-widest text-zinc-500">STEP 01 — LOCATION</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabSelect id="s-state" label="State" value={state} disabled={loading}
            onChange={(v) => changeLocation(v, STATE_DISTRICTS[v][0], sector, "")}>
            {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
          </LabSelect>
          <LabSelect id="s-district" label="District" value={district} disabled={loading}
            onChange={(v) => changeLocation(state, v, sector, "")}>
            {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
          </LabSelect>
        </div>
        <h3 className="mt-6 text-xs font-semibold tracking-widest text-zinc-500">STEP 02 — SECTOR</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabSelect id="s-sector" label="Sector" value={sector} disabled={loading}
            onChange={(v) => changeLocation(state, district, v, "")}>
            {Object.keys(interventions).map((s) => <option key={s} value={s}>{title(s)}</option>)}
          </LabSelect>
          <LabSelect id="s-interv" label="Intervention" value={effectiveIntervention} disabled={loading}
            onChange={(v) => { setIntervention(v); setResult(null); setCompare(null); }}>
            {(interventions[sector] ?? []).map((i) => <option key={i} value={i}>{title(i)}</option>)}
          </LabSelect>
        </div>
        <h3 className="mt-6 text-xs font-semibold tracking-widest text-zinc-500">STEP 03 — BUDGET</h3>
        <p className="mt-3 text-sm text-zinc-500">Budget allocation</p>
        <p className="font-serif text-4xl font-semibold">₹{budgetCr} Cr</p>
        <input id="s-budget" type="range" min={10} max={500} step={5} value={Math.min(500, Math.max(10, budgetCr))}
          className="mt-3 w-full accent-black" disabled={loading} onChange={(e) => onSlider(Number(e.target.value))}
          aria-label="Budget in crore rupees" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p} className={`rounded-md border px-4 py-2 text-sm ${budgetCr === p ? "bg-black text-white" : "bg-white"}`}
              onClick={() => run(p)} disabled={loading}>₹{p} Cr</button>
          ))}
          <span className="ml-2 flex items-center gap-2 text-sm">
            <label htmlFor="s-custom" className="text-zinc-500">Custom amount</label>
            <span className="flex items-center gap-1">
              <span className="text-zinc-500">₹</span>
              <input id="s-custom" className="w-20 rounded-md border border-[#d8d8d8] p-2" value={custom} inputMode="decimal"
                onChange={(e) => setCustom(e.target.value)} disabled={loading} aria-label="Custom budget in crore" />
              <span className="text-zinc-500">Cr</span>
            </span>
            <Button variant="outline" size="sm" onClick={() => run(Number(custom))} disabled={loading}>Apply</Button>
          </span>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && <p className="mt-4 text-sm text-zinc-500">Simulating…</p>}

      {result && (
        <>
          <section className="mt-8 rounded-md border border-zinc-300 p-6" aria-label="Scenario outcome">
            <p className="text-xs font-semibold tracking-widest text-zinc-500">SCENARIO OUTCOME</p>
            <p className="mt-2 font-serif text-4xl font-semibold">₹{result.scenario.budget_cr} Cr</p>
            <p className="mt-1 text-lg">{title(result.scenario.intervention)}</p>
            <p className="text-sm text-zinc-500">Prototype estimate</p>
            <p className="mt-4 font-serif text-5xl font-semibold">{fmtInt(result.estimate.population_reached)}</p>
            <p className="text-sm text-zinc-500">people potentially reached</p>
            <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Population affected</dt>
                <dd className="mt-1 text-xl font-semibold">{fmtInt(result.baseline.population_affected)}</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Current infrastructure gap</dt>
                <dd className="mt-1 text-xl font-semibold">{(result.baseline.gap_index * 100).toFixed(0)}%</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Estimated reach</dt>
                <dd className="mt-1 text-xl font-semibold">{fmtInt(result.estimate.population_reached)}</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Projected gap</dt>
                <dd className="mt-1 text-xl font-semibold">−{(result.estimate.gap_reduction * 100).toFixed(1)}%</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Coverage improvement</dt>
                <dd className="mt-1 text-xl font-semibold">+{(result.estimate.coverage_improvement * 100).toFixed(1)}%</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <dt className="text-xs text-zinc-500">Locations affected</dt>
                <dd className="mt-1 text-xl font-semibold">{result.estimate.locations_affected}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6 rounded-md border p-6" aria-label="Before after">
            <h2 className="text-sm font-semibold tracking-widest text-zinc-500">BEFORE → AFTER</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md bg-zinc-50 p-4">
                <p className="text-xs font-semibold tracking-wide text-zinc-500">CURRENT</p>
                <p className="mt-1">Infrastructure gap <b>{(result.baseline.gap_index * 100).toFixed(0)}%</b></p>
                <p>Coverage <b>{(result.baseline.coverage_index * 100).toFixed(0)}%</b></p>
              </div>
              <div className="rounded-md border border-dashed p-4">
                <p className="text-xs font-semibold tracking-wide text-zinc-500">INTERVENTION</p>
                <p className="mt-1 font-medium">{title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr</p>
              </div>
              <div className="rounded-md bg-zinc-50 p-4">
                <p className="text-xs font-semibold tracking-wide text-zinc-500">PROJECTED</p>
                <p className="mt-1">Infrastructure gap <b>{(projGap * 100).toFixed(1)}%</b></p>
                <p>Coverage <b>{(projCoverage * 100).toFixed(1)}%</b></p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Prototype model estimate — not a guaranteed real-world outcome.</p>
          </section>

          <section className="mt-6 rounded-md border p-6">
            <h2 className="text-sm font-semibold tracking-widest text-zinc-500">
              SCENARIO ESTIMATE — {title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr
            </h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Estimated reach</dt><dd className="font-semibold">{fmtInt(result.estimate.population_reached)} <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Coverage improvement</dt><dd className="font-semibold">+{(result.estimate.coverage_improvement * 100).toFixed(1)}% <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Gap reduction</dt><dd className="font-semibold">{(result.estimate.gap_reduction * 100).toFixed(1)}% <span className="font-normal text-zinc-500">(prototype estimate)</span></dd></div>
              <div className="flex justify-between"><dt>Locations affected</dt><dd className="font-semibold">{result.estimate.locations_affected}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold tracking-wide text-zinc-500">HOW THIS SCENARIO IS CALCULATED</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Citizen demand + Infrastructure gap + Population context + Existing investment +
              Selected intervention + Budget
            </p>
            <p className="mt-1 text-sm font-medium">↓</p>
            <p className="text-sm font-medium">Prototype scenario estimate</p>
            <p className="mt-1 text-xs text-zinc-500">Deterministic backend calculations — Gemini never generates these numbers.</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
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
            {context && (
              <>
                <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-md border px-4 py-2 text-sm">
                  Explore Evidence →
                </Link>
                <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-md border px-4 py-2 text-sm">
                  View Hotspot →
                </Link>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => document.getElementById("scenario-builder")?.scrollIntoView({ behavior: "smooth" })}>
              Run Another Scenario
            </Button>
            <Button variant="outline" size="sm" onClick={runCompare} disabled={loading || comparing}>
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

      <section className="mt-6 rounded-md border p-6">
        <h2 className="text-sm font-semibold tracking-widest text-zinc-500">TRANSPARENCY</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="font-semibold">AI layer</p><p className="mt-1 text-zinc-600">Google Gemini assists with language understanding and explanation.</p></div>
          <div><p className="font-semibold">Data layer</p><p className="mt-1 text-zinc-600">Synthetic demonstration dataset for this prototype.</p></div>
          <div><p className="font-semibold">Calculation layer</p><p className="mt-1 text-zinc-600">Numerical outputs are generated by JanSetu&apos;s deterministic simulation engine.</p></div>
          <div><p className="font-semibold">Scenario status</p><p className="mt-1 text-zinc-600">Prototype estimate — not a guaranteed outcome.</p></div>
        </div>
      </section>
    </main>
    </RequireAuth>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-6 md:px-10 py-12"><p className="text-zinc-600">Loading simulator…</p></main>}>
      <Simulator />
    </Suspense>
  );
}
