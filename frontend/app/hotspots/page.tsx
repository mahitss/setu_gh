"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import Map from "@/components/Map";
import { EmptyState, Skeleton, TierBadge } from "@/components/ui";
import { apiGet, fmtInt, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot, Summary } from "@/lib/api";

const CATEGORIES = ["healthcare", "water", "roads", "education", "electricity", "sanitation"];
const PRIORITIES = ["critical", "high", "medium", "low", "minimal"];

const FILTERS: { key: "state" | "district" | "category" | "priority"; label: string; options: (s: { states: string[]; districts: string[] }) => string[] }[] = [
  { key: "state", label: "State", options: (s) => s.states },
  { key: "district", label: "District", options: (s) => s.districts },
  { key: "category", label: "Category", options: () => CATEGORIES },
  { key: "priority", label: "Priority", options: () => PRIORITIES },
];

function tierOf(h: Hotspot): string {
  switch (h.priority_level) {
    case "critical": return "P0";
    case "high": return "P1";
    case "medium": return "P2";
    default: return "P3";
  }
}

function Trend({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="font-semibold tabular-nums text-[var(--js-muted)]">new</span>;
  }
  if (value > 1) {
    return (
      <span className="font-serif text-lg font-semibold tabular-nums text-[#C93636] dark:text-[#F87171]">
        ↑ {Math.abs(value)}%
      </span>
    );
  }
  if (value < -1) {
    return (
      <span className="font-serif text-lg font-semibold tabular-nums text-[#138A52] dark:text-[#34D399]">
        ↓ {Math.abs(value)}%
      </span>
    );
  }
  return <span className="font-serif text-lg font-semibold tabular-nums text-[var(--js-muted)]">→ {Math.abs(value)}%</span>;
}

function HotspotsPage() {
  const router = useRouter();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [states, setStates] = useState<string[]>([]);
  const [fState, setFState] = useState("");
  const [fDistrict, setFDistrict] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load(signal: AbortSignal, filters: Record<string, string>) {
    const q = new URLSearchParams({ limit: "50" });
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const h = await apiGet<{ hotspots: Hotspot[]; count: number }>(`/api/v1/hotspots?${q}`, signal);
    setHotspots(h.hotspots);
    setTotal(h.count);
    setFailed(false);
  }

  function refetch(filters: Record<string, string>) {
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    load(ctrl.signal, filters)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      apiGet<{ hotspots: Hotspot[]; count: number }>("/api/v1/hotspots?limit=100", ctrl.signal),
      apiGet<Summary>("/api/v1/dashboard/summary", ctrl.signal).catch(() => null),
    ])
      .then(([h, s]) => {
        setHotspots(h.hotspots.slice(0, 50));
        setTotal(h.count);
        setStates([...new Set(h.hotspots.map((x) => x.state))].sort());
        if (s) setSummary(s);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Cannot reach the server. Start the backend and refresh.");
        setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const districts = [...new Set(hotspots.filter((h) => !fState || h.state === fState).map((h) => h.district))].sort();
  const filters = { state: fState, district: fDistrict, category: fCategory, priority: fPriority };
  const hasFilters = Object.values(filters).some(Boolean);
  const selected = hotspots.find((h) => h.id === selectedId) ?? hotspots[0] ?? null;
  const rising = hotspots.filter((h) => (h.trend_pct ?? 0) > 5).length;
  const topCat = summary?.top_categories?.[0];

  function onFilter(patch: Record<string, string>) {
    const f = { state: fState, district: fDistrict, category: fCategory, priority: fPriority, ...patch };
    if (patch.state !== undefined) f.district = "";
    setFState(f.state);
    setFDistrict(f.district);
    setFCategory(f.category);
    setFPriority(f.priority);
    refetch(f);
  }

  function clearFilters() {
    setFState("");
    setFDistrict("");
    setFCategory("");
    setFPriority("");
    refetch({ state: "", district: "", category: "", priority: "" });
  }

  function openHotspot(h: Hotspot) {
    router.push(hotspotHref(h));
  }

  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--js-surface)] pl-3 pr-8 text-sm font-medium transition-all duration-200 hover:border-[var(--js-faint)] focus:border-[var(--js-accent-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--js-accent-strong)]/25";

  return (
    <main className="mx-auto w-full max-w-[1360px] px-5 md:px-8 min-[1440px]:px-10 pb-16">
      {/* ============ COMMAND HEADER ============ */}
      <div className="mt-2 grid grid-cols-1 gap-6 pt-6 lg:grid-cols-[1.6fr_1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
            <span className="inline-block h-px w-8 bg-[var(--js-accent-strong)]" aria-hidden="true" />
            JANSETU · HOTSPOT INTELLIGENCE
          </p>
          <h1 className="mt-4 font-serif text-[clamp(2.2rem,4.5vw,3.6rem)] font-semibold leading-[1.04] tracking-tight">
            Hotspot intelligence
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--js-muted)]">
            Where citizen demand is concentrating across India.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-4 lg:justify-items-end">
          <div className="lg:text-right">
            <dd className="font-serif text-[clamp(1.9rem,3vw,2.6rem)] font-semibold leading-none tabular-nums">
              {loading ? "—" : fmtInt(total)}
            </dd>
            <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--js-muted)]">Active hotspots</dt>
          </div>
          <div className="lg:border-l lg:border-[var(--border)] lg:pl-4 lg:text-right">
            <dd className="font-serif text-[clamp(1.9rem,3vw,2.6rem)] font-semibold leading-none">90<span className="text-[0.55em] font-normal text-[var(--js-muted)]">d</span></dd>
            <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--js-muted)]">Intel window</dt>
          </div>
          <div className="lg:border-l lg:border-[var(--border)] lg:pl-4 lg:text-right">
            <dd className="font-serif text-[clamp(1.1rem,1.8vw,1.4rem)] font-semibold leading-tight">Deterministic</dd>
            <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--js-muted)]">Ranking</dt>
          </div>
        </dl>
      </div>

      {/* ============ FILTER TOOLBAR ============ */}
      <div className="mt-7 rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">FILTER BY</p>
          <button
            onClick={clearFilters}
            disabled={!hasFilters}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${hasFilters ? "border-[var(--border)] hover:border-[var(--js-accent-strong)] hover:text-[var(--foreground)]" : "cursor-default border-[var(--border)]/60 text-[var(--js-faint)]"}`}
          >
            Reset filters
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FILTERS.map((f) => {
            const val = filters[f.key];
            const opts = f.options({ states, districts });
            return (
              <div key={f.key}>
                <label htmlFor={`flt-${f.key}`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--js-muted)]">
                  {f.label}
                </label>
                <select
                  id={`flt-${f.key}`}
                  className={selectCls}
                  value={val}
                  onChange={(e) => onFilter({ [f.key]: e.target.value })}
                >
                  <option value="">All</option>
                  {opts.map((o) => (
                    <option key={o} value={o}>{f.key === "state" || f.key === "district" ? o : title(o)}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ MAP ============ */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0A0C10] dark:bg-[#0A0C10]" aria-label="National demand map">
        <div className="bg-[#0A0C10]">
          {loading ? (
            <Skeleton className="h-[360px] w-full rounded-none sm:h-[560px]" />
          ) : (
            <Map hotspots={hotspots} selectedId={selected?.id ?? null} onSelect={setSelectedId} chrome totalCount={total} />
          )}
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl border border-[#C93636]/40 bg-[#C93636]/10 p-3.5 text-sm text-[#C93636] dark:text-[#F87171]">{error}</p>}

      {/* ============ INTELLIGENCE SUMMARY ============ */}
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] lg:grid-cols-4">
        {[
          { l: "Hotspots analyzed", v: loading ? "—" : fmtInt(total) },
          { l: "High priority", v: summary ? fmtInt(summary.high_priority_areas) : "—" },
          { l: "Rising demand", v: loading ? "—" : `${fmtInt(rising)} in view` },
          { l: "Largest cluster", v: topCat ? `${title(topCat.category)} · ${fmtInt(topCat.count)}` : "—" },
        ].map((m) => (
          <div key={m.l} className="bg-[var(--js-surface)] px-5 py-4">
            <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--js-muted)]">{m.l}</dt>
            <dd className="mt-1.5 font-serif text-[1.45rem] font-semibold leading-none tabular-nums">{m.v}</dd>
          </div>
        ))}
      </dl>

      {/* ============ SELECTED INTELLIGENCE ============ */}
      {selected && !loading && (
        <section className="mt-5 flex flex-col gap-4 rounded-2xl bg-[#0B0C0F] p-5 text-white dark:border dark:border-[var(--border)] sm:p-6 lg:flex-row lg:items-center" aria-label="Selected hotspot">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.24em] text-[var(--js-accent-strong)]">SELECTED INTELLIGENCE</p>
            <p className="mt-1.5 font-serif text-2xl leading-tight font-semibold tracking-tight">
              {selected.district} <span className="text-base font-normal text-zinc-400">· {selected.state} · {title(selected.category)}</span>
            </p>
            <p className="mt-1.5 text-sm text-zinc-300">
              {fmtInt(selected.signals)} signals · trend {trendLabel(selected.trend_pct)} · gap {selected.gap_index?.toFixed(2) ?? "—"} · {fmtInt(selected.population)} affected
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <TierBadge tier={tierOf(selected)} score={selected.priority_score} />
            <Link
              href={hotspotHref(selected)}
              className="group inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--js-accent-strong)]"
            >
              Open detail <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </section>
      )}

      {/* ============ INTELLIGENCE TABLE ============ */}
      <section className="mt-10" aria-label="Hotspot intelligence ranking">
        <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-[var(--js-muted)]">
          <span className="inline-block h-px w-8 bg-[var(--js-accent-strong)]" aria-hidden="true" />
          RANKED DEMAND
        </p>
        <h2 className="mt-3 font-serif text-[clamp(1.7rem,3vw,2.6rem)] font-semibold tracking-tight">Hotspot intelligence</h2>
        <p className="mt-2 text-sm text-[var(--js-muted)]">
          {loading ? "Loading ranking…" : failed ? "Hotspot data unavailable." : `Showing ${fmtInt(Math.min(20, hotspots.length))} of ${fmtInt(total)} matching hotspots.`}
        </p>

        {loading ? (
          <div className="mt-5 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : hotspots.length === 0 ? (
          <div className="mt-5">
            {failed ? (
              <EmptyState
                title="Hotspot data is temporarily unavailable"
                body="The backend could not be reached, so no hotspot data is shown. Your filters are unchanged."
                actionLabel="Retry connection"
                onAction={() => refetch(filters)}
              />
            ) : (
              <EmptyState
                title="No hotspots match these filters"
                body="Try removing a filter — for example, widen the state or lower the priority threshold."
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--js-track)]/70 backdrop-blur">
                  <tr>
                    {["Location", "Signals", "Trend", "Gap", "Population", "Priority", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--js-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {hotspots.slice(0, 20).map((h, i) => (
                    <tr
                      key={h.id}
                      onClick={() => openHotspot(h)}
                      onMouseEnter={() => setSelectedId(h.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openHotspot(h);
                        }
                      }}
                      className={`group cursor-pointer transition-colors duration-200 hover:bg-[var(--js-track)]/50 focus:bg-[var(--js-track)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--js-accent-strong)]/50 ${selected?.id === h.id ? "bg-[var(--js-accent-strong)]/[0.07]" : i % 2 === 1 ? "bg-[var(--js-surface-2)]/50" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-semibold transition-colors group-hover:text-[var(--js-accent-strong)]">{h.district}</p>
                        <p className="mt-0.5 text-xs text-[var(--js-muted)]">{h.state} · {title(h.category)}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-serif text-xl font-semibold tabular-nums">{fmtInt(h.signal_count)}</p>
                        <p className="text-[11px] text-[var(--js-muted)]">signals</p>
                      </td>
                      <td className="px-5 py-3.5"><Trend value={h.trend_pct} /></td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums">{h.gap_index?.toFixed(2) ?? "—"}</td>
                      <td className="px-5 py-3.5 tabular-nums">{fmtInt(h.population)}</td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide">
                          <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${tierOf(h) === "P0" ? "bg-[#C93636]" : tierOf(h) === "P1" ? "bg-[var(--js-accent-strong)]" : tierOf(h) === "P2" ? "bg-[#7C7CFF]" : "bg-[var(--js-faint)]"}`} />
                          {h.priority_level}
                        </span>
                        <TierBadge tier={tierOf(h)} score={h.priority_score} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span aria-hidden="true" className="-translate-x-1 text-lg opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-[var(--js-accent-strong)] group-hover:opacity-100">→</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="mt-5 space-y-3 md:hidden">
              {hotspots.slice(0, 20).map((h) => (
                <li key={h.id}>
                  <article
                    onClick={() => openHotspot(h)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openHotspot(h);
                      }
                    }}
                    className="cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-4 transition-all duration-200 hover:border-[var(--js-accent-strong)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--js-accent-strong)]/50 active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{h.district}</p>
                        <p className="mt-0.5 text-xs text-[var(--js-muted)]">{h.state} · {title(h.category)}</p>
                      </div>
                      <TierBadge tier={tierOf(h)} />
                    </div>
                    <div className="mt-3 flex items-end justify-between border-t border-[var(--border)] pt-3">
                      <p className="text-sm"><strong className="font-serif text-xl tabular-nums">{fmtInt(h.signal_count)}</strong> <span className="text-[var(--js-muted)]">signals</span></p>
                      <Trend value={h.trend_pct} />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-[var(--js-muted)]">
                      Gap {h.gap_index?.toFixed(2) ?? "—"} · {fmtInt(h.population)} people · {h.priority_score.toFixed(2)}
                    </p>
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

export default function HotspotsRoute() {
  return (
    <RequireAuth>
      <HotspotsPage />
    </RequireAuth>
  );
}
