"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtInt, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot } from "@/lib/api";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// India bounding box for the SVG fallback.
const LAT_MIN = 8, LAT_MAX = 37, LON_MIN = 68, LON_MAX = 97;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

function loadMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=visualization`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("maps-load"));
    document.head.appendChild(s);
  });
}

// Priority tiers mirror the backend hotspot engine thresholds.
export const PRIORITY_TIER: Record<string, string> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
  minimal: "P3",
};

export function MapLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--js-muted)]">
      <span>
        Demand intensity <span className="font-medium">LOW → HIGH</span>
      </span>
      <span>Trend <b className="text-[#C93636] dark:text-[#F87171]">↑ Rising</b> · <b>→ Stable</b> · <b className="text-[#138A52] dark:text-[#34D399]">↓ Declining</b></span>
      <span title="P0 critical (≥0.85) · P1 high (≥0.7) · P2 medium (≥0.5) · P3 low/minimal (<0.5)">
        Priority <b>P0 / P1 / P2 / P3</b>
      </span>
    </div>
  );
}

export default function Map({ hotspots, selectedId, onSelect, chrome, totalCount }: {
  hotspots: Hotspot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Enterprise frame: overlay header/legends, priority rings, hover tooltip. Dashboard keeps classic. */
  chrome?: boolean;
  totalCount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [mapsFailed, setMapsFailed] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const pts = hotspots.filter((h) => h.latitude != null && h.longitude != null).slice(0, 50);
  const selected = hotspots.find((h) => h.id === selectedId) ?? null;
  const hovered = pts.find((p) => p.id === hoverId) ?? null;

  function openHotspot(h: Hotspot) {
    onSelect(h.id);
    router.push(hotspotHref(h));
  }

  useEffect(() => {
    if (!MAPS_KEY || mapsFailed || !ref.current || pts.length === 0) return;
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const map = new window.google.maps.Map(ref.current, {
          center: { lat: 23.5, lng: 80 },
          zoom: 5,
        });
        for (const p of pts) {
          const marker = new window.google.maps.Marker({
            position: { lat: p.latitude, lng: p.longitude },
            map,
            title: `${p.district} — ${p.category} (${p.signals})`,
          });
          marker.addListener("click", () => {
            openHotspot(p);
          });
        }
        // Intensity layer from actual signal volume (same provider, no new dependency).
        try {
          if (window.google.maps.visualization) {
            new window.google.maps.visualization.HeatmapLayer({
              data: pts.map((p) => ({
                location: new window.google.maps.LatLng(p.latitude, p.longitude),
                weight: p.signals,
              })),
              map,
              radius: 30,
            });
          }
        } catch {
          /* markers alone still carry the visualization */
        }
      })
      .catch(() => setMapsFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspots]);

  if (MAPS_KEY && !mapsFailed) {
    return (
      <div>
        <div ref={ref} className="h-[500px] w-full rounded-md border" role="img" aria-label="Hotspot map" />
        <MapLegend />
      </div>
    );
  }

  const max = Math.max(...pts.map((p) => p.signals), 1);
  const tierR = (s: number) => (s / max > 0.66 ? 2.1 : s / max > 0.33 ? 1.5 : 0.9);
  const ringOf = (p: Hotspot) =>
    p.priority_level === "critical" ? "#DC2626"
    : p.priority_level === "high" ? "#F5B400"
    : p.priority_level === "medium" ? "#7C7CFF"
    : "#A1A1AA";
  const X = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
  const Y = (lat: number) => (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 100;
  const frameH = chrome ? "h-[360px] sm:h-[560px]" : "h-[500px]";
  return (
    <div className={chrome ? "relative" : undefined}>
      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4 sm:p-5" aria-hidden="true">
          <div>
            <p className="text-[13px] font-bold tracking-[0.28em] text-zinc-100">INDIA</p>
            <p className="mt-0.5 text-[10px] tracking-[0.24em] text-zinc-400">DEMAND HOTSPOTS</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold tabular-nums tracking-[0.14em] text-zinc-100">{totalCount ?? pts.length} HOTSPOTS</p>
            <p className="mt-0.5 text-[10px] tracking-[0.24em] text-zinc-400">90 DAY WINDOW</p>
          </div>
        </div>
      )}
      <svg viewBox="0 0 100 100" className={`${frameH} w-full ${chrome ? "" : "rounded-md border border-[var(--border)]"} bg-[#F1F3F5] dark:bg-[#0B0E14]`} role="img" aria-label="India demand hotspots map (fallback)">
        {!chrome && (
          <>
            <text x="50" y="7" textAnchor="middle" fontSize="4.5" fontWeight="bold" letterSpacing="2" className="fill-zinc-700 dark:fill-zinc-200">INDIA</text>
            <text x="50" y="12" textAnchor="middle" fontSize="2.4" letterSpacing="1" className="fill-zinc-500 dark:fill-zinc-400">DEMAND HOTSPOTS</text>
          </>
        )}
        <defs>
          <filter id="hs-heat" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        {/* Intensity layer: blurred signal-volume circles (district coordinates, real data). */}
        <g filter="url(#hs-heat)" opacity="0.28">
          {pts.map((p) => (
            <circle key={`heat-${p.id}`} cx={X(p.longitude!)} cy={Y(p.latitude!)}
              r={1.6 + (p.signals / max) * 2.8} fill="#f59e0b" />
          ))}
        </g>
        {pts.map((p, i) => {
          const isSel = selected?.id === p.id;
          const isHov = hoverId === p.id;
          return (
          <g key={p.id}
            onMouseEnter={chrome ? () => setHoverId(p.id) : undefined}
            onMouseLeave={chrome ? () => setHoverId((id) => (id === p.id ? null : id)) : undefined}
          >
          {chrome && isSel && (
            <circle cx={X(p.longitude!)} cy={Y(p.latitude!)} r={tierR(p.signals) + 1.6}
              fill="none" stroke="#F5B400" strokeWidth="0.35" className="js-node-ring" />
          )}
          <circle
            cx={X(p.longitude!)}
            cy={Y(p.latitude!)}
            r={tierR(p.signals) + (chrome && (isSel || isHov) ? 0.4 : 0)}
            fill={p.priority_score >= 0.7 ? "#b91c1c" : p.priority_score >= 0.5 ? "#d97706" : "#3f6212"}
            opacity={isSel || !selected ? 1 : 0.7}
            stroke={chrome ? (isSel ? "#F5B400" : ringOf(p)) : isSel ? "#000" : "#fff"}
            strokeWidth={chrome ? (isSel ? 0.7 : 0.45) : 0.3}
            className="signal-dot"
            style={{ cursor: "pointer", animationDelay: `${(i % 7) * 0.4}s`, transition: "opacity 200ms ease" }}
            onClick={() => openHotspot(p)}
            role="button" tabIndex={0} aria-label={`Open evidence for ${p.district}, ${title(p.category)}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openHotspot(p);
            }}
          >
            <title>{`${p.district}, ${p.state} — ${title(p.category)}: ${fmtInt(p.signals)} signals, trend ${trendLabel(p.trend_pct)}, ${title(p.priority_level)} priority. Activate to open evidence.`}</title>
          </circle>
          </g>
          );
        })}
        {pts.length === 0 && <text x="50" y="50" textAnchor="middle" fontSize="3">No coordinates</text>}
      </svg>
      {chrome && hovered && hovered.latitude != null && hovered.longitude != null && (
        <div
          className="absolute z-20 w-56 rounded-xl border border-white/15 bg-[#0B0C0F]/95 p-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur"
          style={{
            left: `clamp(8px, ${(X(hovered.longitude) / 100) * 100}%, calc(100% - 232px))`,
            top: `clamp(70px, ${(Y(hovered.latitude) / 100) * 100}%, calc(100% - 220px))`,
          }}
          role="status"
        >
          <p className="text-[15px] font-bold uppercase tracking-wide">{hovered.district}</p>
          <p className="text-xs text-zinc-400">{hovered.state}</p>
          <p className="mt-1.5 text-sm font-semibold text-[#F5B400]">{title(hovered.category)}</p>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between"><dt className="text-zinc-400">{fmtInt(hovered.signals)} signals</dt><dd className="font-semibold tabular-nums">{trendLabel(hovered.trend_pct)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-400">Infrastructure gap</dt><dd className="font-semibold tabular-nums">{hovered.gap_index?.toFixed(2) ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-400">Priority</dt><dd className="font-bold uppercase tracking-wide text-[#F5B400]">{hovered.priority_level}</dd></div>
          </dl>
          <a href={hotspotHref(hovered)} className="mt-2.5 inline-block text-[13px] font-semibold underline underline-offset-2 hover:text-[#F5B400]">
            View intelligence →
          </a>
        </div>
      )}
      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-4 sm:p-5" aria-hidden="true">
          <div>
            <p className="text-[10px] font-bold tracking-[0.22em] text-zinc-400">DEMAND INTENSITY</p>
            <p className="mt-1.5 flex items-center gap-2 text-[10px] tracking-[0.18em] text-zinc-500">
              LOW
              <span className="inline-block h-1 w-24 rounded-full bg-gradient-to-r from-zinc-600 via-[#B87E00] to-[#F5B400]" />
              HIGH
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-bold tracking-[0.18em]">
              <span className="text-[#F87171]">P0</span>
              <span className="text-[#F5B400]">P1</span>
              <span className="text-[#A5A5FF]">P2</span>
              <span className="text-zinc-500">P3</span>
            </p>
            <p className="mt-1 text-[10px] tracking-[0.22em] text-zinc-500">MAP MODE · DEMONSTRATION</p>
          </div>
        </div>
      )}
      {selected && !chrome && (
        <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--js-surface)] p-3 text-sm">
          <p className="font-semibold">{title(selected.category)} — {selected.district}, {selected.state}</p>
          <p className="mt-1">{fmtInt(selected.signals)} signals · {trendLabel(selected.trend_pct)}</p>
          <p>Infrastructure gap: {selected.gap_index?.toFixed(2) ?? "—"} ({title(selected.priority_level)} priority)</p>
          <p>Population affected: {fmtInt(selected.population)}</p>
          <a className="mt-1 inline-block underline" href={hotspotHref(selected)}>View Evidence</a>
        </div>
      )}
      <p className="mt-1.5 px-0.5 text-[11px] leading-relaxed text-[var(--js-muted)]">
        {chrome
          ? "Demonstration geography · Size = signals · Ring = priority."
          : "Demonstration geography · Circle size = signals; red = high priority. Click a marker for details."}
      </p>
      {!chrome && <MapLegend />}
    </div>
  );
}
