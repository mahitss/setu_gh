"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtInt, title } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SECTORS = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRESETS = [100, 250, 500];

type SimResult = {
  sector: string;
  budget_cr: number;
  assumed_cost_per_person_inr: number;
  projected_population_reached: number;
  projected_coverage_improvement: number;
  high_gap_locations_affected: number;
  note: string;
};

export default function SimulatePage() {
  const [sector, setSector] = useState("healthcare");
  const [budget, setBudget] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);

  async function run() {
    setError(null);
    setResult(null);
    const budget_cr = Number(budget);
    if (!Number.isFinite(budget_cr) || budget_cr <= 0) {
      setError("Enter a valid budget greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector, budget_cr }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Could not run the simulation. Please try again.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run the simulation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Investment simulator</h1>
      <p className="mt-2 text-zinc-600">
        Estimate the reach of a budget allocation. Projections are model estimates, not guaranteed outcomes.
      </p>

      <label className="mt-8 block text-sm font-medium" htmlFor="sector">Sector</label>
      <select
        id="sector"
        className="mt-2 w-full rounded-md border p-2"
        value={sector}
        onChange={(e) => setSector(e.target.value)}
        disabled={loading}
      >
        {SECTORS.map((s) => (
          <option key={s} value={s}>{title(s)}</option>
        ))}
      </select>

      <label className="mt-4 block text-sm font-medium" htmlFor="budget">Budget (₹ crore)</label>
      <input
        id="budget"
        className="mt-2 w-full rounded-md border p-2"
        value={budget}
        inputMode="decimal"
        onChange={(e) => setBudget(e.target.value)}
        disabled={loading}
      />
      <div className="mt-2 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`rounded-md border px-3 py-1 text-sm ${budget === String(p) ? "bg-black text-white" : ""}`}
            onClick={() => setBudget(String(p))}
            disabled={loading}
          >
            ₹{p} Cr
          </button>
        ))}
      </div>

      <Button
        className="mt-6"
        onClick={run}
        disabled={loading}
      >
        {loading ? "Simulating…" : "Run simulation"}
      </Button>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
      )}

      {result && (
        <section className="mt-6 rounded-md border p-5">
          <h2 className="text-xl font-semibold">
            {title(result.sector)} — ₹{result.budget_cr} Cr
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2"><dt className="w-56 font-medium">Projected population reached</dt><dd>{fmtInt(result.projected_population_reached)}</dd></div>
            <div className="flex gap-2"><dt className="w-56 font-medium">Projected coverage improvement</dt><dd>{(result.projected_coverage_improvement * 100).toFixed(1)}%</dd></div>
            <div className="flex gap-2"><dt className="w-56 font-medium">High-gap locations affected</dt><dd>{fmtInt(result.high_gap_locations_affected)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">⚠️ {result.note}</p>
        </section>
      )}
    </main>
  );
}
