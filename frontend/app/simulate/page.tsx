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
  "h-12 w-full appearance-none rounded-lg border border-[#d8d8d8] bg-white pl-4 pr-10 text-[15px] transition-colors duration-200 hover:border-[var(--js-faint)] focus:border-[var(--js-accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--js-accent-strong)]/25 dark:border-[var(--border)] dark:bg-[var(--js-surface)]";

/** Compact Indian-unit formatting of a real API value (no new numbers). */
function fmtCompact(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  return fmtInt(n);
}

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
      <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]" htmlFor={id}>{label}</label>
      <div className="relative mt-2">
        <select id={id} className={SELECT_CLS} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--js-muted)]">▾</span>
      </div>
    </div>
  );
}

function StageHead({ n, title: t }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-serif text-lg font-semibold text-[var(--js-accent-strong)]" aria-hidden="true">{n}</span>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--js-muted)]">{t}</h3>
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
  const sliderFill = Math.min(100, Math.max(0, ((Math.min(500, Math.max(10, budgetCr)) - 10) / 490) * 100));
  const engineState = loading ? "RUNNING" : result ? "READY" : "READY";

  return (
    <RequireAuth>
    <main className="mx-auto w-full max-w-[1280px] px-5 md:px-8 pb-16">
      {/* ============ HERO ============ */}
      <div className="grid grid-cols-1 gap-6 pt-6 lg:grid-cols-[1.6fr_1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
            <span className="inline-block h-px w-8 bg-[var(--js-accent-strong)]" aria-hidden="true" />
            JANSETU · INVESTMENT INTELLIGENCE
          </p>
          <h1 className="mt-4 font-serif text-[clamp(2.25rem,5.5vw,4.5rem)] font-semibold uppercase leading-[1.02] tracking-tight">
            Model development interventions before committing resources.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--js-muted)]">
            Explore prototype investment scenarios using citizen demand,
            infrastructure gaps and demographic context.
          </p>
        </div>
        <aside className="h-fit rounded-xl bg-[#0B0C0F] p-5 text-sm text-white dark:border dark:border-[var(--border)] lg:justify-self-end lg:w-full lg:max-w-xs" aria-label="Scenario status">
          <p className="flex items-center justify-between text-[11px] font-bold tracking-[0.2em] text-zinc-400">
            SCENARIO STATUS
            <span className={`flex items-center gap-1.5 ${loading ? "text-[var(--js-accent-strong)]" : "text-emerald-400"}`}>
              <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${loading ? "animate-pulse bg-[var(--js-accent-strong)]" : "bg-emerald-400"}`} />
              {loading ? "RUNNING" : "READY"}
            </span>
          </p>
          <dl className="mt-3 space-y-2 border-t border-white/10 pt-3 dark:border-[var(--border)]">
            <div className="flex justify-between"><dt className="text-zinc-400">Mode</dt><dd className="font-semibold">Prototype</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-400">Engine</dt><dd className="font-semibold">Deterministic</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-400">Evidence</dt><dd className="font-semibold">{context ? "linked" : "baseline only"}</dd></div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-zinc-400 dark:border-[var(--border)]">
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${engineState === "RUNNING" ? "animate-pulse bg-[var(--js-accent-strong)]" : "bg-emerald-400"}`} />
            SIMULATION ENGINE {engineState === "RUNNING" ? "RUNNING" : result ? "· SCENARIO READY" : "READY"}
          </p>
        </aside>
      </div>

      {/* ============ CURRENT CONTEXT ============ */}
      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--js-surface)] px-5 py-4 sm:px-6" aria-label="Current context">
        <p className="text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">CURRENT CONTEXT</p>
        {context ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dd className="font-serif text-[1.35rem] font-semibold leading-tight">{context.district}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--js-muted)]">{context.state}</dt>
            </div>
            <div>
              <dd className="font-serif text-[1.35rem] font-semibold leading-tight">{title(context.category)}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--js-muted)]">Sector · {trendLabel(context.trend_pct)}</dt>
            </div>
            <div>
              <dd className="font-serif text-[1.35rem] font-semibold leading-tight tabular-nums">{fmtInt(context.signals)}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--js-muted)]">Citizen signals</dt>
            </div>
            <div>
              <dd className="font-serif text-[1.35rem] font-semibold leading-tight tabular-nums">{context.gap_index?.toFixed(2) ?? "—"}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--js-muted)]">Infrastructure gap</dt>
            </div>
            <div>
              <dd className="font-serif text-[1.35rem] font-semibold leading-tight tabular-nums">{fmtInr(context.investment_inr)}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--js-muted)]">Current investment</dt>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-[var(--js-muted)]">No hotspot row for this district/sector — simulation uses baseline demographics and infrastructure.</p>
        )}
      </section>

      {/* ============ WORKSPACE ============ */}
      <section id="scenario-builder" className="mt-8 scroll-mt-24" aria-label="Scenario builder">
        <h2 className="font-serif text-[clamp(1.6rem,2.6vw,2.2rem)] font-semibold tracking-tight">Build your scenario</h2>
        <p className="mt-1.5 text-sm text-[var(--js-muted)]">Define the location, intervention and investment level.</p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
            <StageHead n="01" title="Location" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LabSelect id="s-state" label="State" value={state} disabled={loading}
                onChange={(v) => changeLocation(v, STATE_DISTRICTS[v][0], sector, "")}>
                {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
              </LabSelect>
              <LabSelect id="s-district" label="District" value={district} disabled={loading}
                onChange={(v) => changeLocation(state, v, sector, "")}>
                {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
              </LabSelect>
            </div>
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-[13px] text-[var(--js-muted)]">
              Selected district ·{" "}
              <strong className="font-semibold text-[var(--foreground)] tabular-nums">{context ? fmtInt(context.population) : "—"}</strong> population ·{" "}
              <strong className="font-semibold text-[var(--foreground)] tabular-nums">{context?.gap_index?.toFixed(2) ?? "—"}</strong> infrastructure gap
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
            <StageHead n="02" title="Intervention" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <LabSelect id="s-sector" label="Sector" value={sector} disabled={loading}
                onChange={(v) => changeLocation(state, district, v, "")}>
                {Object.keys(interventions).map((s) => <option key={s} value={s}>{title(s)}</option>)}
              </LabSelect>
              <LabSelect id="s-interv" label="Intervention" value={effectiveIntervention} disabled={loading}
                onChange={(v) => { setIntervention(v); setResult(null); setCompare(null); }}>
                {(interventions[sector] ?? []).map((i) => <option key={i} value={i}>{title(i)}</option>)}
              </LabSelect>
            </div>
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-[13px] text-[var(--js-muted)]">
              Primary need ·{" "}
              <strong className="font-semibold text-[var(--foreground)]">{effectiveIntervention ? title(effectiveIntervention) : "—"}</strong>
              {" "}for {title(sector)} in {district}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5 sm:p-6">
          <StageHead n="03" title="Investment" />
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]">Proposed investment</p>
              <p className="mt-1 font-serif text-[clamp(2.4rem,4vw,3.4rem)] font-semibold leading-none tabular-nums">
                ₹{budgetCr} <span className="text-[0.45em] font-normal text-[var(--js-muted)]">Cr</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => run(p)} disabled={loading}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-px disabled:translate-none ${budgetCr === p ? "border-transparent bg-[#0B0C0F] text-white dark:bg-[var(--js-accent-strong)] dark:text-black" : "border-[var(--border)] hover:border-[var(--js-faint)]"}`}>
                    ₹{p} Cr
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="s-custom" className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]">Custom</label>
                <span className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5">
                  <span className="text-[var(--js-muted)]">₹</span>
                  <input id="s-custom" className="w-16 bg-transparent tabular-nums focus:outline-none" value={custom} inputMode="decimal"
                    onChange={(e) => setCustom(e.target.value)} disabled={loading} aria-label="Custom budget in crore" />
                  <span className="text-[var(--js-muted)]">Cr</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => run(Number(custom))} disabled={loading}>Apply</Button>
              </div>
            </div>
            <div>
              <label htmlFor="s-budget" className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--js-muted)]">Budget allocation · drag to remodel</label>
              <input id="s-budget" type="range" min={10} max={500} step={5} value={Math.min(500, Math.max(10, budgetCr))}
                className="js-range mt-4 w-full" style={{ ["--fill" as string]: `${sliderFill}%` }}
                disabled={loading} onChange={(e) => onSlider(Number(e.target.value))}
                aria-label="Budget in crore rupees" />
              <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[var(--js-faint)]" aria-hidden="true">
                <span>₹10 Cr</span><span>₹500 Cr</span>
              </div>
              <button onClick={() => run(budgetCr)} disabled={loading}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B0C0F] px-6 py-3.5 text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-px hover:shadow-[0_12px_32px_rgba(11,12,15,0.3)] disabled:translate-none disabled:opacity-60 dark:bg-[var(--js-accent-strong)] dark:text-black dark:hover:shadow-[0_12px_36px_rgba(245,180,0,0.35)] sm:w-auto sm:px-10">
                {loading ? "RUNNING SCENARIO…" : "RUN SCENARIO →"}
              </button>
              <p className="mt-2.5 text-xs text-[var(--js-muted)]">Deterministic simulation · Prototype estimate</p>
            </div>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-lg border border-[#C93636]/40 bg-[#C93636]/10 p-3 text-sm text-[#C93636] dark:text-[#F87171]">{error}</p>}
      {loading && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--js-surface)] p-4" role="status" aria-live="polite">
          <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--js-muted)]">JANSETU INTELLIGENCE</p>
          <p className="mt-2 text-sm text-[var(--js-muted)]">
            <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#635BFF]" />
            Calculating scenario — reading district baseline, applying intervention model…
          </p>
        </div>
      )}

      {!result && !loading && (
        <section className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-6 text-center" aria-label="Awaiting scenario">
          <p className="font-serif text-xl font-semibold">Configure your scenario to model a potential intervention.</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--js-muted)]">Choose a district, intervention and budget above — projected impact appears here.</p>
        </section>
      )}

      {result && (
        <div key={`${result.scenario.budget_cr}-${result.scenario.intervention}`} className="animate-[fade-up_.45s_ease-out]">
          {/* ============ PROJECTED IMPACT ============ */}
          <section className="relative mt-6 overflow-hidden rounded-xl bg-[#0A0C10] p-6 text-white dark:border dark:border-[var(--border)] sm:p-8" aria-label="Projected scenario impact">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[var(--js-accent-strong)] opacity-[0.08] blur-3xl" />
            </div>
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-bold tracking-[0.24em] text-zinc-400">PROJECTED SCENARIO IMPACT</p>
              <p className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold tracking-widest text-emerald-300">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                SCENARIO READY
              </p>
            </div>
            <p className="relative mt-2 text-sm text-zinc-400">Prototype estimate · {title(result.scenario.intervention)} @ ₹{result.scenario.budget_cr} Cr</p>
            <div className="relative mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Projected population reached</p>
                <p className="mt-2 font-serif text-[clamp(3rem,7vw,5.2rem)] font-semibold leading-none tabular-nums">
                  {fmtCompact(result.estimate.population_reached)}
                  <span className="ml-2 align-middle font-sans text-base font-normal text-zinc-400">people</span>
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 dark:border-[var(--border)]">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Coverage</dt>
                    <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums text-emerald-300">+{(result.estimate.coverage_improvement * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Gap</dt>
                    <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums text-emerald-300">−{(result.estimate.gap_reduction * 100).toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Investment</dt>
                    <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums">₹{result.scenario.budget_cr} Cr</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 dark:border-[var(--border)]" aria-label="Before after comparison">
                <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400">CURRENT → SCENARIO</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="flex justify-between text-[13px]"><span className="text-zinc-400">Infrastructure gap · current</span><strong className="tabular-nums">{(result.baseline.gap_index * 100).toFixed(0)}%</strong></p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10 dark:bg-[var(--js-track)]" aria-hidden="true">
                      <div className="h-2 rounded-full bg-zinc-400" style={{ width: `${Math.min(100, result.baseline.gap_index * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="flex justify-between text-[13px]"><span className="text-zinc-400">Infrastructure gap · scenario</span><strong className="tabular-nums text-[var(--js-accent-strong)]">{(projGap * 100).toFixed(1)}%</strong></p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10 dark:bg-[var(--js-track)]" aria-hidden="true">
                      <div className="h-2 rounded-full bg-[var(--js-accent-strong)]" style={{ width: `${Math.min(100, projGap * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="flex justify-between text-[13px]"><span className="text-zinc-400">Coverage · scenario</span><strong className="tabular-nums">{(projCoverage * 100).toFixed(1)}%</strong></p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10 dark:bg-[var(--js-track)]" aria-hidden="true">
                      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, projCoverage * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-zinc-500">Prototype model estimate — not a guaranteed real-world outcome.</p>
              </div>
            </div>
          </section>

          {/* ============ EVIDENCE ============ */}
          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Scenario evidence">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
              <h2 className="text-[11px] font-bold tracking-[0.2em] text-[var(--js-muted)]">WHY THIS SCENARIO?</h2>
              {context ? (
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex justify-between gap-3"><span className="text-[var(--js-muted)]">Citizen demand</span><strong className="tabular-nums">{fmtInt(context.signals)} signals</strong></li>
                  <li className="flex justify-between gap-3"><span className="text-[var(--js-muted)]">Infrastructure gap</span><strong className="tabular-nums">{context.gap_index?.toFixed(2) ?? "—"}</strong></li>
                  <li className="flex justify-between gap-3"><span className="text-[var(--js-muted)]">Population</span><strong className="tabular-nums">{fmtInt(context.population)}</strong></li>
                  <li className="flex justify-between gap-3"><span className="text-[var(--js-muted)]">Existing investment</span><strong>{fmtInr(context.investment_inr)}</strong></li>
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--js-muted)]">Baseline demographics and infrastructure (no hotspot row for this combination).</p>
              )}
              <p className="mt-3 border-t border-[var(--border)] pt-3 text-[13px] leading-relaxed text-[var(--js-muted)]">
                JanSetu models how the selected intervention could affect the identified development gap.
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
              <h2 className="text-[11px] font-bold tracking-[0.2em] text-[var(--js-muted)]">HOW IT IS CALCULATED</h2>
              <p className="mt-3 text-sm leading-relaxed">
                Citizen demand + Infrastructure gap + Population + Existing investment + Intervention + Budget
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--js-accent-strong)]">→ Prototype scenario estimate</p>
              <p className="mt-2 text-xs text-[var(--js-muted)]">Deterministic backend calculations — Gemini never generates these numbers.</p>
              <ul className="mt-2 list-disc pl-5 text-xs leading-relaxed text-[var(--js-muted)]">
                {result.assumptions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          </section>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {context && (
              <>
                <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-[var(--js-faint)]">
                  Explore Evidence →
                </Link>
                <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-[var(--js-faint)]">
                  View Hotspot →
                </Link>
              </>
            )}
            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => document.getElementById("scenario-builder")?.scrollIntoView({ behavior: "smooth" })}>
              Run Another Scenario
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg" onClick={runCompare} disabled={loading || comparing}>
              {comparing ? "Comparing…" : "Compare ₹50 / ₹100 / ₹250 Cr"}
            </Button>
          </div>
        </div>
      )}

      {compare && (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5" aria-label="Compare scenarios">
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-[var(--js-muted)]">COMPARE SCENARIOS — {title(compare.scenario.intervention).toUpperCase()}</h2>
          <div className="mt-3 space-y-2.5">
            {compare.comparison.map((c) => (
              <div key={c.budget_cr} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 font-semibold tabular-nums">₹{c.budget_cr} Cr</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--js-track)]">
                  <span className="block h-2.5 rounded-full bg-[var(--js-accent-strong)]" style={{ width: `${Math.round((c.population_reached / maxReach) * 100)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">{fmtInt(c.population_reached)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-[var(--js-track)]/60">
                <tr>
                  {["Budget", "Reached", "Gap reduction", "Coverage"].map((h) => (
                    <th key={h} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--js-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {compare.comparison.map((c) => (
                  <tr key={c.budget_cr}>
                    <td className="px-3 py-2 font-semibold tabular-nums">₹{c.budget_cr} Cr</td>
                    <td className="px-3 py-2 tabular-nums">{fmtInt(c.population_reached)}</td>
                    <td className="px-3 py-2 tabular-nums">{(c.gap_reduction * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 tabular-nums">+{(c.coverage_improvement * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--js-muted)]">{compare.label}</p>
        </section>
      )}

      {result && (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-5" aria-label="Scenario summary">
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-[var(--js-muted)]">SCENARIO SUMMARY</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">District</dt><dd className="font-medium">{result.scenario.district}, {result.scenario.state}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">Need</dt><dd className="font-medium">{title(result.scenario.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">Intervention</dt><dd className="font-medium">{title(result.scenario.intervention)}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">Budget</dt><dd className="font-medium tabular-nums">₹{result.scenario.budget_cr} Cr</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">Effect</dt><dd className="font-medium">{fmtInt(result.estimate.population_reached)} reached, gap −{(result.estimate.gap_reduction * 100).toFixed(1)}%</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 text-[var(--js-muted)]">Evidence</dt><dd className="font-medium">{context ? `${fmtInt(context.signals)} signals, gap ${context.gap_index?.toFixed(2) ?? "—"}` : "baseline demographics and infrastructure"}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {context && (
              <Link href={`/hotspots/${encodeURIComponent(context.id)}`} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors duration-200 hover:border-[var(--js-faint)]">
                Return to hotspot
              </Link>
            )}
            <Button variant="outline" size="sm" className="rounded-lg" onClick={runCompare} disabled={loading || comparing}>Compare scenarios</Button>
          </div>
        </section>
      )}

      {/* ============ TRANSPARENCY ============ */}
      <section className="mt-8 rounded-xl bg-[#0B0C0F] p-5 text-white dark:border dark:border-[var(--border)] sm:p-6" aria-label="Model transparency">
        <p className="text-[11px] font-bold tracking-[0.24em] text-[var(--js-accent-strong)]">MODEL TRANSPARENCY</p>
        <div className="mt-4 grid grid-cols-1 gap-5 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-t-2 border-[#303A8C] pt-3">
            <p className="font-bold tracking-wide">AI LAYER</p>
            <p className="mt-1.5 leading-relaxed text-zinc-400">Google Gemini assists with language understanding and explanation.</p>
          </div>
          <div className="border-t-2 border-zinc-600 pt-3">
            <p className="font-bold tracking-wide">DATA LAYER</p>
            <p className="mt-1.5 leading-relaxed text-zinc-400">Demonstration civic and infrastructure dataset.</p>
          </div>
          <div className="border-t-2 border-[var(--js-accent-strong)] pt-3">
            <p className="font-bold tracking-wide">CALCULATION LAYER</p>
            <p className="mt-1.5 leading-relaxed text-zinc-400">Numerical outputs generated by JanSetu&apos;s deterministic simulation engine.</p>
          </div>
          <div className="border-t-2 border-emerald-500 pt-3">
            <p className="font-bold tracking-wide">SCENARIO STATUS</p>
            <p className="mt-1.5 leading-relaxed text-zinc-400">Prototype estimate — not a guaranteed outcome.</p>
          </div>
        </div>
      </section>
    </main>
    </RequireAuth>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1280px] px-6 md:px-10 py-12"><p className="text-[var(--js-muted)]">Loading simulator…</p></main>}>
      <Simulator />
    </Suspense>
  );
}
