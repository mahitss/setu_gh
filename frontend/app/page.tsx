"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Map from "@/components/Map";
import { apiGet, fmtInt, fmtInr, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot, PulseItem, RecommendationOut, Summary } from "@/lib/api";

const LAT_MIN = 8, LAT_MAX = 37, LON_MIN = 68, LON_MAX = 97;

const PIPELINE: [string, string][] = [
  ["Citizen voice", "People describe what their community needs."],
  ["AI understanding", "Gemini converts voice and text into structured civic signals."],
  ["Civic signal", "A validated, located record of one community concern."],
  ["CivicPulse", "Timestamps reveal which needs are rising."],
  ["Hotspot", "Demand concentrates in specific districts."],
  ["Evidence", "Gaps, people affected and investment, side by side."],
  ["Action", "Policymakers explore recommendations and scenarios."],
];

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      done.current = true;
      io.disconnect();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = reduced ? 0 : 900;
      const start = performance.now();
      const tick = (t: number) => {
        const p = dur === 0 ? 1 : Math.min(1, (t - start) / dur);
        setDisplay(Math.round(value * p));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{format(display)}</span>;
}

type SimPreview = {
  scenario: { intervention: string; budget_cr: number };
  baseline: { population_affected: number; coverage_index: number; gap_index: number };
  estimate: { population_reached: number; coverage_improvement: number; gap_reduction: number };
  assumptions: string[];
};

function HeroMap({ hotspots }: { hotspots: Hotspot[] }) {
  const pts = hotspots
    .filter((h) => h.latitude != null && h.longitude != null)
    .sort((a, b) => b.signals - a.signals)
    .slice(0, 14);
  const max = Math.max(...pts.map((p) => p.signals), 1);
  const X = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
  const Y = (lat: number) => (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 100;
  return (
    <svg viewBox="0 0 100 62" className="h-auto w-full" role="img" aria-label="Stylized civic signal map">
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`v${i}`} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="62" stroke="#3f3f46" strokeWidth="0.15" />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} stroke="#3f3f46" strokeWidth="0.15" />
      ))}
      {pts.map((p, i) => (
        <circle key={p.id} cx={X(p.longitude!)} cy={Y(p.latitude!) * 0.62} r={1 + (p.signals / max) * 2.4}
          fill="#fbbf24" className="signal-dot" style={{ animationDelay: `${(i % 7) * 0.4}s` }}>
          <title>{`${p.district} — ${p.category}: ${p.signals} signals`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [sim, setSim] = useState<SimPreview | null>(null);
  const [rec, setRec] = useState<RecommendationOut | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("Connecting citizen signals…");
  const [reloadKey, setReloadKey] = useState(0);

  function retry() {
    setError(null);
    setLoading(true);
    setLoadMsg("Connecting citizen signals…");
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    const t = setTimeout(() => setLoadMsg("Building civic intelligence…"), 2500);
    return () => clearTimeout(t);
  }, [reloadKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiGet<Summary>("/api/v1/dashboard/summary", ctrl.signal),
      apiGet<{ pulse: PulseItem[] }>("/api/v1/civic-pulse", ctrl.signal),
      apiGet<{ hotspots: Hotspot[] }>("/api/v1/hotspots?limit=100", ctrl.signal),
    ])
      .then(([s, p, h]) => {
        setSummary(s);
        setPulse(p.pulse);
        setHotspots(h.hotspots);
        const top = h.hotspots[0];
        if (top) {
          apiGet<RecommendationOut>(
            `/api/v1/hotspots/${encodeURIComponent(top.id)}/recommendation`, ctrl.signal
          )
            .then(setRec)
            .catch(() => setRec(null));
          fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/simulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: top.state, district: top.district, category: top.category, budget: 100 * 1e7 }),
            signal: ctrl.signal,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setSim(d))
            .catch(() => setSim(null));
        }
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Civic intelligence is temporarily unavailable.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const rising = pulse.filter((p) => p.status === "rising").slice(0, 4);
  const top = hotspots[0] ?? null;
  const states = new Set(hotspots.map((h) => h.state)).size;
  const districts = new Set(hotspots.map((h) => `${h.state}|${h.district}`)).size;

  return (
    <main className="flex-1">
      {/* HERO */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 py-16 md:px-10 lg:grid-cols-2 lg:min-h-[580px]">
          <div className="animate-[fade-up_.5s_ease-out]">
            <p className="text-xs font-semibold tracking-[0.2em] text-amber-400">JANSETU · AI CIVIC INTELLIGENCE FOR INDIA</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
              Turn <span className="text-amber-400">citizen voices</span> into development decisions.
            </h1>
            <p className="mt-4 max-w-xl text-zinc-300">
              JanSetu connects citizen needs, infrastructure gaps, demographic context and
              public investment to surface evidence-backed development priorities.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/citizen" className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                Report a Community Need →
              </Link>
              <Link href="/dashboard" className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-900">
                Explore Civic Intelligence
              </Link>
            </div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
            <HeroMap hotspots={hotspots} />
            {!loading && hotspots.length === 0 && (
              <p className="mt-2 text-xs text-zinc-400">Civic intelligence will appear when the data service is connected.</p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div><dt className="tracking-widest text-zinc-500">CITIZEN SIGNALS</dt><dd className="font-semibold text-zinc-200">{summary ? fmtInt(summary.citizen_signals) : "—"}</dd></div>
              <div><dt className="tracking-widest text-zinc-500">AI UNDERSTANDING</dt><dd className="font-semibold text-zinc-200">{pulse.length ? `${pulse.length} categories` : "—"}</dd></div>
              <div><dt className="tracking-widest text-zinc-500">CIVICPULSE</dt><dd className="font-semibold text-zinc-200">{rising.length ? `${rising.length} rising` : "—"}</dd></div>
              <div><dt className="tracking-widest text-zinc-500">HOTSPOTS</dt><dd className="font-semibold text-zinc-200">{hotspots.length ? `${hotspots.length} tracked` : "—"}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {error && (
        <div className="mx-auto max-w-7xl px-6 md:px-10 pt-6">
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          <button onClick={retry} className="mt-2 rounded-md border px-4 py-1.5 text-sm hover:bg-zinc-50">
            Retry connection
          </button>
        </div>
      )}
      {loading && !summary && (
        <div className="mx-auto max-w-7xl px-6 md:px-10 pt-6">
          <p className="text-sm text-zinc-500" role="status">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#D99A18]" aria-hidden="true" />
            {loadMsg}
          </p>
        </div>
      )}

      {/* DATA STRIP */}
      <section className="border-b">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 py-8 md:px-10 lg:grid-cols-4">
          <div>
            <p className="text-3xl font-semibold">
              {summary ? <><CountUp value={summary.citizen_signals} format={fmtInt} />+</> : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">Citizen signals analyzed</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">{summary ? <CountUp value={states} format={fmtInt} /> : "—"}</p>
            <p className="mt-1 text-sm text-zinc-500">States</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">{summary ? <CountUp value={districts} format={fmtInt} /> : "—"}</p>
            <p className="mt-1 text-sm text-zinc-500">Districts</p>
          </div>
          <div>
            <p className="text-3xl font-semibold">90 days</p>
            <p className="mt-1 text-sm text-zinc-500">Intelligence window</p>
          </div>
        </div>
        <p className="mx-auto max-w-7xl px-6 md:px-10 pb-6 text-xs text-zinc-500">Synthetic demonstration dataset. Values load from the demonstration backend.</p>
      </section>

      {/* PIPELINE */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 py-20">
        <h2 className="text-2xl font-semibold">How JanSetu thinks</h2>
        <ol className="mt-5 flex flex-wrap items-stretch gap-0">
          {PIPELINE.map(([s, d], i) => (
            <li key={s} className="group flex items-center">
              <span className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold transition-colors duration-200 group-hover:bg-[#D99A18] group-hover:text-white">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-medium">{s}</span>
                  <span className="mt-0.5 hidden max-w-44 text-xs text-zinc-500 group-hover:block">{d}</span>
                </span>
              </span>
              {i < PIPELINE.length - 1 && <span className="mx-1 h-px w-4 bg-zinc-300" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-zinc-600">AI interprets human input. Deterministic engines calculate the numbers.</p>
      </section>

      {/* INTELLIGENCE PREVIEW */}
      <section className="border-y bg-[#F6F4EF]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-20 md:px-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">National civic intelligence</h2>
            <div className="mt-4">
              <Map hotspots={hotspots.slice(0, 50)} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">What&apos;s changing?</h3>
            <p className="text-sm text-zinc-500">Rising demand, from CivicPulse.</p>
            <ul className="mt-3 space-y-2">
              {rising.map((p) => (
                <li key={p.category} className="flex items-center justify-between rounded-md border bg-white p-3 text-sm">
                  <span className="font-medium">{title(p.category)}</span>
                  <span className="font-semibold text-red-700">↑ {p.trend_percent}%</span>
                </li>
              ))}
              {rising.length === 0 && <li className="text-sm text-zinc-500">No rising categories right now.</li>}
            </ul>
            <Link href="/dashboard" className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
              Open Intelligence Dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* CIVICPULSE CARDS */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 py-16">
        <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">CIVICPULSE</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Where demand is moving</h2>
        <p className="mt-1 text-sm text-zinc-500">30-day change vs previous 30 days, from the backend.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...pulse].sort((a, b) => (b.trend_percent ?? -Infinity) - (a.trend_percent ?? -Infinity)).slice(0, 4).map((p) => (
            <div key={p.category} className="rounded-md border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <p className="text-sm font-semibold tracking-wide">{title(p.category).toUpperCase()}</p>
              <p className={`mt-1 text-2xl font-semibold ${(p.trend_percent ?? 0) >= 0 ? "text-red-700" : "text-green-700"}`}>
                {(p.trend_percent ?? 0) >= 0 ? "↑" : "↓"} {trendLabel(p.trend_percent)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{fmtInt(p.current_count)} signals · Demand is {p.status === "rising" ? "rising" : p.status.replace("_", " ")}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EVIDENCE */}
      {top && (
        <section className="mx-auto max-w-7xl px-6 md:px-10 py-20">
          <h2 className="text-2xl font-semibold">From signal to evidence</h2>
          <div className="mt-4 rounded-md border p-5">
            <p className="text-sm font-semibold tracking-widest text-zinc-500">{top.district.toUpperCase()}, {top.state.toUpperCase()}</p>
            <p className="mt-1 text-xl font-semibold">{title(top.category)}</p>
            <dl className="mt-3 max-w-xl space-y-2 text-sm">
              {[
                ["Citizen signals", fmtInt(top.signals)],
                ["CivicPulse", trendLabel(top.trend_pct)],
                ["Infrastructure gap", top.gap_index?.toFixed(2) ?? "—"],
                ["Population context", fmtInt(top.population)],
                ["Existing investment", fmtInr(top.investment_inr)],
              ].map(([k, v], i, a) => (
                <div key={k}>
                  <div className="flex items-baseline justify-between rounded-md bg-zinc-50 p-3">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                  {i < a.length - 1 && <p className="py-0.5 pl-3 text-zinc-400">↓</p>}
                </div>
              ))}
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Why this matters</h3>
            <ul className="mt-1 space-y-1 text-sm text-zinc-700">
              <li>• {fmtInt(top.signals)} citizens reported {top.category} issues here</li>
              <li>• Coverage gap of {top.gap_index?.toFixed(2) ?? "—"} leaves {fmtInt(top.population)} people underserved</li>
              <li>• Existing investment of {fmtInr(top.investment_inr)} has not closed the gap</li>
            </ul>
            <Link href={hotspotHref(top)} className="mt-4 inline-block rounded-md border px-4 py-2 text-sm">
              Explore Hotspot →
            </Link>
          </div>
        </section>
      )}

      {/* RECOMMENDATION */}
      {rec && top && (
        <section className="mx-auto max-w-7xl px-6 md:px-10 py-16">
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">WHAT JANSETU RECOMMENDS</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            {rec.recommendation.intervention}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Evidence-backed recommendation · Evidence: {fmtInt(rec.evidence.citizen_signals)} signals ·{" "}
            {fmtInt(rec.evidence.population_affected)} affected · confidence {rec.recommendation.confidence.toFixed(2)}
          </p>
          <Link href={hotspotHref(top)} className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
            Open hotspot evidence →
          </Link>
        </section>
      )}

      {/* SIMULATOR */}
      {sim && top && (
        <section className="border-y bg-[#F6F4EF]">
          <div className="mx-auto max-w-7xl px-6 md:px-10 py-20">
            <h2 className="text-2xl font-semibold">What if we invest?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              JanSetu doesn&apos;t stop at identifying problems. It lets policymakers explore prototype intervention scenarios.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border bg-white p-4">
                <p className="font-semibold">Current</p>
                <p className="mt-1 text-zinc-600">{fmtInt(top.population)} affected · gap {top.gap_index?.toFixed(2) ?? "—"}</p>
              </div>
              <div className="rounded-md border bg-white p-4">
                <p className="font-semibold">Intervention</p>
                <p className="mt-1 text-zinc-600">{title(sim.scenario.intervention)} @ ₹{sim.scenario.budget_cr} Cr</p>
              </div>
              <div className="rounded-md border bg-white p-4">
                <p className="font-semibold">Scenario estimate</p>
                <p className="mt-1 text-zinc-600">{fmtInt(sim.estimate.population_reached)} reached · gap −{(sim.estimate.gap_reduction * 100).toFixed(1)}%</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Prototype scenario estimate — not a guaranteed outcome.</p>
            <Link href="/simulate" className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
              Open Investment Simulator →
            </Link>
          </div>
        </section>
      )}

      {/* CITIZEN CTA */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 py-12 text-center">
        <h2 className="text-2xl font-semibold">Your community already knows what needs attention.</h2>
        <p className="mt-2 text-zinc-600">JanSetu turns those voices into structured civic intelligence.</p>
        <Link href="/citizen" className="mt-6 inline-block rounded-md bg-black px-6 py-3 text-sm text-white">
          Report a Need →
        </Link>
      </section>

      {/* TRANSPARENCY */}
      <section className="border-t">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 py-8 md:px-10 text-sm lg:grid-cols-4">
          <div><p className="font-semibold">AI</p><p className="text-zinc-500">Google Gemini</p></div>
          <div><p className="font-semibold">Data</p><p className="text-zinc-500">Synthetic demonstration dataset</p></div>
          <div><p className="font-semibold">Calculations</p><p className="text-zinc-500">Deterministic backend engines</p></div>
          <div><p className="font-semibold">Scenarios</p><p className="text-zinc-500">Prototype estimates</p></div>
        </div>
      </section>
    </main>
  );
}
