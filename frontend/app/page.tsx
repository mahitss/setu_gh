"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Brain,
  MapPin,
  Mic,
  Minus,
  Radio,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { apiGet, fmtInt, fmtInr, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot, PulseItem, Summary } from "@/lib/api";

const LAT_MIN = 8, LAT_MAX = 37, LON_MIN = 68, LON_MAX = 97;
const AMBER = "#F5B400";
const INDIGO = "#7C7CFF";

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

function fmtLakh(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr people`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} lakh`;
  return fmtInt(n);
}

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
      if (reduced) {
        setDisplay(value);
        return;
      }
      const dur = 1100;
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(value * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{format(display)}</span>;
}

function Reveal({ children, className, delay }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        el.classList.add("is-visible");
        io.disconnect();
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className ?? ""}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

const PARTICLES = [
  { left: "6%", top: "18%", size: 3, delay: "0s", dur: "7s" },
  { left: "14%", top: "66%", size: 2, delay: "1.2s", dur: "6s" },
  { left: "26%", top: "30%", size: 2, delay: "0.6s", dur: "8s" },
  { left: "41%", top: "12%", size: 3, delay: "2s", dur: "7s" },
  { left: "55%", top: "58%", size: 2, delay: "0.3s", dur: "6.5s" },
  { left: "63%", top: "24%", size: 2, delay: "1.7s", dur: "7.5s" },
  { left: "74%", top: "70%", size: 3, delay: "0.9s", dur: "6s" },
  { left: "85%", top: "36%", size: 2, delay: "2.4s", dur: "8s" },
  { left: "92%", top: "60%", size: 2, delay: "1.5s", dur: "7s" },
  { left: "33%", top: "82%", size: 2, delay: "2.8s", dur: "6.5s" },
];

/* ------------------------------------------------------------------ */
/* Hero: Civic Intelligence Network                                    */
/* ------------------------------------------------------------------ */

function NetworkVisual({
  hotspots,
  signals,
  states,
  districts,
}: {
  hotspots: Hotspot[];
  signals: number | null;
  states: number;
  districts: number;
}) {
  const W = 560, H = 430, PAD = 56;
  const pts = [...hotspots]
    .filter((h) => h.latitude != null && h.longitude != null)
    .sort((a, b) => b.signals - a.signals)
    .slice(0, 10);
  const max = Math.max(...pts.map((p) => p.signals), 1);
  const X = (lon: number) => PAD + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (W - PAD * 2);
  const Y = (lat: number) => 34 + (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (H - 120);
  const chain = pts.slice(0, 6);
  const ringed = new Set(pts.slice(0, 3).map((p) => p.id));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111216]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,rgba(124,124,255,0.10),transparent_70%)]" aria-hidden="true" />
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-zinc-400">CIVIC INTELLIGENCE NETWORK</p>
        <p className="flex items-center gap-1.5 text-[11px] tracking-wide text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          LIVE SIGNAL FLOW
        </p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Civic intelligence network: citizen signals flowing into demand hotspots">
          <defs>
            <pattern id="js-grid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
            </pattern>
            <radialGradient id="js-glow" cx="50%" cy="42%" r="55%">
              <stop offset="0%" stopColor={AMBER} stopOpacity="0.10" />
              <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} fill="url(#js-grid)" />
          <rect width={W} height={H} fill="url(#js-glow)" />
          {chain.slice(1).map((p, i) => (
            <line
              key={`flow-${p.id}`}
              x1={X(chain[i].longitude!)} y1={Y(chain[i].latitude!)}
              x2={X(p.longitude!)} y2={Y(p.latitude!)}
              stroke={INDIGO} strokeWidth="1.4" opacity="0.55" className="js-flow-line"
            />
          ))}
          {pts.map((p, i) => {
            const cx = X(p.longitude!);
            const cy = Y(p.latitude!);
            const r = 4 + (p.signals / max) * 9;
            const core = i === 0 ? AMBER : i < 3 ? "#FFD166" : INDIGO;
            return (
              <g key={p.id}>
                {ringed.has(p.id) && (
                  <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke={core} strokeWidth="1" className="js-node-ring" style={{ animationDelay: `${i * 0.9}s` }} />
                )}
                <circle cx={cx} cy={cy} r={r} fill={core} opacity={i === 0 ? 0.95 : 0.75}>
                  <title>{`${p.district} — ${title(p.category)}: ${fmtInt(p.signals)} signals`}</title>
                </circle>
                {i < 3 && (
                  <text x={cx + r + 6} y={cy + 3} fill="#d4d4d8" fontSize="10.5" fontWeight="600">
                    {p.district} · {fmtInt(p.signals)}
                  </text>
                )}
              </g>
            );
          })}
          <text x={18} y={30} fill="#71717a" fontSize="10" letterSpacing="2">SIGNALS {signals != null ? fmtInt(signals) : "—"}</text>
          <text x={W - 18} y={30} fill="#71717a" fontSize="10" letterSpacing="2" textAnchor="end">HOTSPOTS {hotspots.length || "—"}</text>
          <text x={18} y={H - 16} fill="#71717a" fontSize="10" letterSpacing="2">STATES {states || "—"}</text>
          <text x={W - 18} y={H - 16} fill="#71717a" fontSize="10" letterSpacing="2" textAnchor="end">DISTRICTS {districts || "—"}</text>
        </svg>
        {PARTICLES.map((pt, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="js-float absolute rounded-full bg-white/25"
            style={{ left: pt.left, top: pt.top, width: pt.size, height: pt.size, animationDelay: pt.delay, animationDuration: pt.dur }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.07] px-5 py-3 text-[11px] tracking-wide text-zinc-500">
        {["Citizen signal", "AI understanding", "Civic signal", "CivicPulse", "Hotspot"].map((s, i, a) => (
          <span key={s} className="flex shrink-0 items-center gap-1.5">
            <span className={i === 0 ? "font-semibold text-amber-300" : i === a.length - 1 ? "font-semibold text-zinc-200" : undefined}>{s}</span>
            {i < a.length - 1 && <span className="text-zinc-700">→</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

const STAGES = [
  { icon: Mic, name: "Citizen voice", text: "People describe what their community needs, in their own language." },
  { icon: Brain, name: "AI understanding", text: "Gemini converts voice and text into structured civic signals." },
  { icon: Radio, name: "Civic signal", text: "A validated, located record of one community concern." },
  { icon: Activity, name: "CivicPulse", text: "Timestamps reveal which needs are rising, and how fast." },
  { icon: MapPin, name: "Hotspot", text: "Demand concentrates into districts that need attention first." },
  { icon: Scale, name: "Evidence", text: "Gaps, people affected and investment — weighed side by side." },
  { icon: ArrowUpRight, name: "Action", text: "Policymakers explore recommendations and funding scenarios." },
];

function Pipeline() {
  return (
    <div>
      {/* Desktop: horizontal architecture rail */}
      <ol className="relative hidden lg:block">
        <div className="absolute left-0 right-0 top-[26px] h-px bg-zinc-200" aria-hidden="true" />
        <div className="js-pipeline-progress absolute left-0 right-0 top-[26px] h-px bg-gradient-to-r from-[#F5B400] via-[#F5B400] to-[#7C7CFF]" aria-hidden="true" />
        <div className="grid grid-cols-7 gap-4">
          {STAGES.map((s, i) => (
            <li key={s.name} className="group relative pt-0">
              <span className="relative z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-zinc-200 bg-white transition-all duration-300 group-hover:border-[#F5B400] group-hover:shadow-[0_10px_30px_rgba(245,180,0,0.25)]" aria-hidden="true">
                <s.icon className="h-5 w-5 text-zinc-700 transition-colors duration-300 group-hover:text-[#B87E00]" strokeWidth={1.8} />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0A0A0B] font-mono text-[10px] font-semibold text-white">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-zinc-400">0{i + 1}</p>
              <p className="mt-1 text-[15px] font-semibold text-zinc-900">{s.name}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{s.text}</p>
            </li>
          ))}
        </div>
      </ol>
      {/* Mobile / tablet: vertical timeline */}
      <ol className="relative space-y-7 border-l border-zinc-200 pl-0 lg:hidden">
        {STAGES.map((s, i) => (
          <li key={s.name} className="relative pl-14">
            <span className="absolute left-0 top-0 -translate-x-1/2" aria-hidden="true">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white">
                <s.icon className="h-5 w-5 text-zinc-700" strokeWidth={1.8} />
              </span>
            </span>
            <span className="absolute bottom-[-28px] left-0 top-11 w-px -translate-x-1/2 bg-gradient-to-b from-[#F5B400]/60 to-transparent" aria-hidden={i === STAGES.length - 1} style={i === STAGES.length - 1 ? { display: "none" } : undefined} />
            <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-400">0{i + 1}</p>
            <p className="mt-0.5 text-base font-semibold text-zinc-900">{s.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">{s.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Living intelligence map (landing-specific, hover detail panel)      */
/* ------------------------------------------------------------------ */

function priorityColor(level: string): string {
  switch (level) {
    case "critical": return "#DC2626";
    case "high": return "#F5B400";
    case "medium": return "#7C7CFF";
    default: return "#A1A1AA";
  }
}

function IntelMap({ hotspots }: { hotspots: Hotspot[] }) {
  const router = useRouter();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const W = 600, H = 420, PAD = 30;
  const pts = [...hotspots]
    .filter((h) => h.latitude != null && h.longitude != null)
    .sort((a, b) => b.signals - a.signals)
    .slice(0, 40);
  const max = Math.max(...pts.map((p) => p.signals), 1);
  const X = (lon: number) => PAD + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (W - PAD * 2);
  const Y = (lat: number) => 20 + (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (H - 60);
  const hovered = pts.find((p) => p.id === hoverId) ?? null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(10,10,11,0.10)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-zinc-500">DEMAND GEOGRAPHY · 24 DISTRICTS</p>
        <p className="hidden text-[11px] tracking-wide text-zinc-400 sm:block">Hover a node for detail</p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Living intelligence map of civic demand across India">
          <defs>
            <pattern id="js-light-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#101318" strokeOpacity="0.05" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#js-light-grid)" />
          {pts.slice(0, 12).map((p, i, arr) =>
            i === 0 ? null : (
              <line
                key={`link-${p.id}`}
                x1={X(arr[i - 1].longitude!)} y1={Y(arr[i - 1].latitude!)}
                x2={X(p.longitude!)} y2={Y(p.latitude!)}
                stroke="#7C7CFF" strokeWidth="1" opacity="0.25" className="js-flow-line"
              />
            )
          )}
          {pts.map((p, i) => {
            const cx = X(p.longitude!);
            const cy = Y(p.latitude!);
            const r = 4 + (p.signals / max) * 11;
            const active = hoverId === p.id;
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId((id) => (id === p.id ? null : id))}
                onClick={() => router.push(hotspotHref(p))}
                className="cursor-pointer"
              >
                <circle cx={cx} cy={cy} r={r + 10} fill="transparent" />
                {i < 5 && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={priorityColor(p.priority_level)} strokeWidth="1" opacity="0.5" className="js-node-ring" style={{ animationDelay: `${i * 0.7}s` }} />}
                <circle
                  cx={cx} cy={cy} r={active ? r + 2 : r}
                  fill={priorityColor(p.priority_level)}
                  opacity={active ? 1 : 0.82}
                  stroke="#fff" strokeWidth={active ? 2.5 : 1.5}
                  style={{ transition: "all 200ms ease" }}
                >
                  <title>{`${p.district} — ${title(p.category)}: ${fmtInt(p.signals)} signals`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        {hovered && hovered.latitude != null && hovered.longitude != null && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-xl border border-zinc-200 bg-[#0A0A0B] p-3.5 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
            style={{
              left: `clamp(4px, ${(X(hovered.longitude) / W) * 100}%, calc(100% - 216px))`,
              top: `clamp(4px, ${(Y(hovered.latitude) / H) * 100}%, calc(100% - 150px))`,
            }}
            role="status"
          >
            <p className="text-sm font-semibold">{hovered.district}</p>
            <p className="text-xs text-zinc-400">{hovered.state} · {title(hovered.category)}</p>
            <p className="mt-2 font-serif text-2xl font-semibold">{fmtInt(hovered.signals)} <span className="text-xs font-sans font-normal text-zinc-400">citizen signals</span></p>
            <p className="mt-1 text-xs">
              <span className={(hovered.trend_pct ?? 0) >= 0 ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>
                {trendLabel(hovered.trend_pct)} demand
              </span>
              <span className="ml-2 uppercase tracking-wider text-zinc-400">{hovered.priority_level} priority</span>
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-zinc-100 px-5 py-3 text-[11px] tracking-wide text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#DC2626]" /> Critical</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F5B400]" /> High</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#7C7CFF]" /> Medium</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#A1A1AA]" /> Low</span>
        <Link href="/hotspots" className="ml-auto font-semibold text-zinc-800 hover:underline">All hotspots →</Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CivicPulse demand-momentum panel                                    */
/* ------------------------------------------------------------------ */

function PulsePanel({ pulse }: { pulse: PulseItem[] }) {
  const rows = [...pulse]
    .sort((a, b) => (b.trend_percent ?? -Infinity) - (a.trend_percent ?? -Infinity))
    .slice(0, 4);
  const maxCount = Math.max(...rows.map((r) => Math.max(r.current_count, r.previous_count)), 1);
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No pulse data right now.</p>;
  }
  return (
    <ol className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
      {rows.map((p) => {
        const up = (p.trend_percent ?? 0) >= 0;
        const TrendIcon = up ? TrendingUp : p.trend_percent == null ? Minus : TrendingDown;
        return (
          <li key={p.category} className="group py-5 transition-colors duration-200 first:pt-6 last:pb-6 hover:bg-white/60">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[15px] font-semibold text-zinc-900">{title(p.category)}</p>
              <p className={`flex items-center gap-1.5 font-serif text-[2rem] font-semibold leading-none tracking-tight ${up ? "text-[#B42318]" : "text-emerald-700"}`}>
                <TrendIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                {trendLabel(p.trend_percent)}
              </p>
            </div>
            <p className="mt-1 text-[13px] text-zinc-500">
              {fmtInt(p.current_count)} citizen signals · 30-day change · demand is {p.status.replace(/_/g, " ")}
            </p>
            <div className="mt-3 space-y-1.5" aria-hidden="true">
              <div className="flex items-center gap-2">
                <span className="w-14 text-[11px] text-zinc-400">Prior</span>
                <span className="h-1.5 rounded-full bg-zinc-300 transition-all duration-500" style={{ width: `${Math.max(4, (p.previous_count / maxCount) * 100)}%` }} />
                <span className="text-[11px] text-zinc-400">{fmtInt(p.previous_count)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 text-[11px] text-zinc-400">Now</span>
                <span className={`h-1.5 rounded-full transition-all duration-500 ${up ? "bg-[#F5B400]" : "bg-emerald-600"}`} style={{ width: `${Math.max(4, (p.current_count / maxCount) * 100)}%` }} />
                <span className="text-[11px] font-medium text-zinc-600">{fmtInt(p.current_count)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pulse, setPulse] = useState<PulseItem[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
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

  const top = hotspots[0] ?? null;
  const states = new Set(hotspots.map((h) => h.state)).size;
  const districts = new Set(hotspots.map((h) => `${h.state}|${h.district}`)).size;

  const trail = top
    ? [
        { value: fmtInt(top.signals), label: "Citizen signals", note: `${title(top.category)} concerns reported in ${top.district}, ${top.state}.` },
        { value: trendLabel(top.trend_pct), label: "CivicPulse", note: "30-day demand shift against the previous window." },
        { value: top.gap_index?.toFixed(2) ?? "—", label: "Infrastructure gap", note: "Facility coverage shortfall on a 0–1 index." },
        { value: fmtLakh(top.population), label: "Population context", note: "People living inside this demand cluster." },
        { value: fmtInr(top.investment_inr), label: "Existing investment", note: "Public money already deployed — the gap persists." },
      ]
    : [];

  return (
    <main className="flex-1">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-[#0A0A0B] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-[8%] h-[30rem] w-[30rem] rounded-full bg-[#F5B400] opacity-[0.06] blur-3xl" />
          <div className="absolute -right-24 top-1/4 h-[34rem] w-[34rem] rounded-full bg-[#4F46E5] opacity-[0.12] blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_70%_at_50%_35%,black,transparent)]" />
        </div>
        <div className="relative mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-14 md:px-8 min-[1440px]:px-10 lg:grid-cols-[1.02fr_1fr] lg:gap-14 lg:pb-20 lg:pt-16 lg:min-h-[720px]">
          <div className="animate-[fade-up_.5s_ease-out]">
            <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-zinc-400">
              <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
              JANSETU · AI CIVIC INTELLIGENCE FOR INDIA
            </p>
            <h1 className="mt-5 font-serif text-[clamp(2.75rem,6vw,5.25rem)] font-semibold uppercase leading-[1.02] tracking-tight">
              Turn <span className="text-[#F5B400]">citizen signals</span> into development decisions.
            </h1>
            <p className="mt-6 max-w-xl text-[clamp(1rem,1.4vw,1.2rem)] leading-relaxed text-zinc-400">
              JanSetu transforms multilingual citizen experiences into structured civic
              intelligence — connecting demand, infrastructure gaps, demographic context
              and public investment.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/citizen"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F5B400] hover:shadow-[0_12px_40px_rgba(245,180,0,0.35)]"
              >
                Report a Community Need
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-7 py-3.5 text-[15px] font-medium text-zinc-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/[0.08]"
              >
                Explore Civic Intelligence
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-7 text-xs tracking-wide text-zinc-500">
              AI interprets human input · Deterministic engines calculate the numbers · Synthetic demonstration data
            </p>
          </div>
          <Reveal className="w-full">
            <NetworkVisual
              hotspots={hotspots}
              signals={summary?.citizen_signals ?? null}
              states={states}
              districts={districts}
            />
          </Reveal>
        </div>
      </section>

      {/* ================= NATIONAL SCALE STRIP ================= */}
      <section className="border-y border-white/10 bg-[#0A0A0B] text-white">
        <div className="mx-auto max-w-[1360px] px-5 py-10 md:px-8 min-[1440px]:px-10 lg:py-12">
          {error && (
            <div className="mb-8">
              <p role="alert" className="border-l-2 border-red-400 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>
              <button onClick={retry} className="mt-3 rounded-full border border-white/20 px-5 py-2 text-sm transition-colors duration-200 hover:bg-white/10">
                Retry connection
              </button>
            </div>
          )}
          {loading && !summary && (
            <p className="mb-8 text-sm text-zinc-400" role="status">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#F5B400]" aria-hidden="true" />
              {loadMsg}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            {[
              { v: summary ? <><CountUp value={summary.citizen_signals} format={fmtInt} />+</> : "—", l: "Citizen signals analyzed" },
              { v: summary ? <CountUp value={states} format={fmtInt} /> : "—", l: "States under watch" },
              { v: summary ? <CountUp value={districts} format={fmtInt} /> : "—", l: "Districts mapped" },
              { v: "90 days", l: "Intelligence window" },
            ].map((m, i) => (
              <div key={m.l} className={i > 0 ? "lg:border-l lg:border-white/10 lg:pl-8" : undefined}>
                <dd className="font-serif text-[clamp(2.4rem,4vw,3.6rem)] font-semibold leading-none tracking-tight">
                  {m.v}
                </dd>
                <dt className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{m.l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ================= HOW JANSETU THINKS ================= */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-8 min-[1440px]:px-10 lg:py-[104px]">
          <Reveal>
            <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-zinc-400">
              <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
              SYSTEM ARCHITECTURE
            </p>
            <h2 className="mt-4 font-serif text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-tight text-zinc-950">
              How JanSetu thinks
            </h2>
            <p className="mt-3 max-w-2xl text-[clamp(1rem,1.4vw,1.2rem)] leading-relaxed text-zinc-500">
              From lived experience to evidence-backed action.
            </p>
          </Reveal>
          <Reveal className="mt-12" delay={120}>
            <Pipeline />
          </Reveal>
        </div>
      </section>

      {/* ================= NATIONAL CIVIC INTELLIGENCE ================= */}
      <section className="border-y border-[#EDE6D8] bg-[#FAF6EF]">
        <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-8 min-[1440px]:px-10 lg:py-[104px]">
          <Reveal>
            <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-zinc-400">
              <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
              LIVE FROM THE BACKEND
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-tight text-zinc-950">
              National civic intelligence
            </h2>
            <p className="mt-3 max-w-2xl text-[clamp(1rem,1.4vw,1.2rem)] leading-relaxed text-zinc-500">
              Where citizen demand is concentrating across India — right now.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
            <Reveal delay={80}>
              <IntelMap hotspots={hotspots} />
            </Reveal>
            <Reveal delay={160}>
              <p className="text-[11px] font-semibold tracking-[0.24em] text-zinc-400">CIVICPULSE · DEMAND MOMENTUM</p>
              <h3 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-zinc-950">What&apos;s changing?</h3>
              <PulsePanel pulse={pulse} />
              <Link
                href="/dashboard"
                className="group mt-7 inline-flex items-center gap-2 rounded-full bg-[#0A0A0B] px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(10,10,11,0.3)]"
              >
                Open Intelligence Dashboard
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= EVIDENCE → ACTION ================= */}
      {top && (
        <section className="bg-white">
          <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-8 min-[1440px]:px-10 lg:py-[104px]">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
              <Reveal>
                <div className="lg:sticky lg:top-28">
                  <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-zinc-400">
                    <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
                    WHY IT MATTERS
                  </p>
                  <h2 className="mt-4 font-serif text-[clamp(2rem,4vw,3.4rem)] font-semibold uppercase leading-[1.05] tracking-tight text-zinc-950">
                    From signal to evidence to action.
                  </h2>
                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-500">
                    One live hotspot — <strong className="font-semibold text-zinc-800">{top.district}, {top.state}</strong> ·{" "}
                    {title(top.category)} — traced from raw citizen reports to a development
                    priority. Every figure below is computed by deterministic backend engines.
                  </p>
                  <Link
                    href={hotspotHref(top)}
                    className="group mt-7 inline-flex items-center gap-2 rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-900"
                  >
                    Open the hotspot file
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </div>
              </Reveal>
              <ol className="relative space-y-2">
                {trail.map((t, i) => (
                  <Reveal key={t.label} delay={i * 60}>
                    <li className="group relative flex gap-6 pb-8 last:pb-0">
                      <span className="flex flex-col items-center" aria-hidden="true">
                        <span className="flex h-3 w-3 rounded-full bg-[#F5B400] ring-4 ring-[#F5B400]/15 transition-all duration-300 group-hover:ring-[#F5B400]/30" />
                        {i < trail.length && <span className="mt-1 w-px flex-1 bg-gradient-to-b from-[#F5B400]/70 via-zinc-200 to-zinc-200" />}
                      </span>
                      <div className="flex-1 border-b border-zinc-100 pb-8 group-last:border-0 group-last:pb-0">
                        <p className="font-serif text-[clamp(2.2rem,3.5vw,3.2rem)] font-semibold leading-none tracking-tight text-zinc-950">
                          {t.value}
                        </p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{t.label}</p>
                        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{t.note}</p>
                      </div>
                    </li>
                  </Reveal>
                ))}
                <Reveal delay={trail.length * 60}>
                  <li className="relative flex gap-6">
                    <span className="flex flex-col items-center" aria-hidden="true">
                      <span className="flex h-3 w-3 rounded-full bg-[#0A0A0B] ring-4 ring-zinc-900/10" />
                    </span>
                    <div className="flex-1 rounded-2xl bg-[#0A0A0B] p-7 text-white">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5B400]">Outcome</p>
                      <p className="mt-2 font-serif text-3xl font-semibold tracking-tight">Development priority</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                        <span className="font-semibold uppercase tracking-wider text-white">{top.priority_level}</span>
                        {" "}· {fmtInt(top.signals)} voices, one evidence file, one decision.
                      </p>
                    </div>
                  </li>
                </Reveal>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* ================= FINAL CTA ================= */}
      <section className="relative overflow-hidden bg-[#0A0A0B] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_50%,black,transparent)]" />
          <div className="absolute left-1/2 top-1/2 h-[26rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F5B400] opacity-[0.05] blur-3xl" />
          {PARTICLES.slice(0, 6).map((pt, i) => (
            <span
              key={i}
              className="js-float absolute rounded-full bg-white/20"
              style={{ left: pt.left, top: pt.top, width: pt.size, height: pt.size, animationDelay: pt.delay, animationDuration: pt.dur }}
            />
          ))}
        </div>
        <div className="relative mx-auto max-w-[1360px] px-5 py-20 text-center md:px-8 min-[1440px]:px-10 lg:py-[104px]">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.24em] text-zinc-500">JANSETU · FOR COMMUNITIES & DECISION-MAKERS</p>
            <h2 className="mx-auto mt-5 max-w-3xl font-serif text-[clamp(1.9rem,4vw,3.2rem)] font-semibold leading-[1.1] tracking-tight">
              Every community has a signal.
              <br />
              <span className="text-zinc-400">JanSetu helps decision-makers see it.</span>
            </h2>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/citizen"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F5B400] hover:shadow-[0_12px_40px_rgba(245,180,0,0.35)]"
              >
                Report a Community Need
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-7 py-3.5 text-[15px] font-medium text-zinc-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/[0.08]"
              >
                Explore Civic Intelligence
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-8 text-xs tracking-wide text-zinc-600">
              Synthetic demonstration dataset · Prototype estimates, not official statistics
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
