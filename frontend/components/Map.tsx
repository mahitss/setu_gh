"use client";

import { useEffect, useRef, useState } from "react";
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
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600">
      <span className="flex items-center gap-2">
        Signal intensity
        <span className="inline-block h-2 w-20 rounded bg-gradient-to-r from-zinc-200 via-amber-300 to-red-700" />
        LOW — HIGH
      </span>
      <span>Trend: <b className="text-red-700">Rising</b> · <b>Stable</b> · <b className="text-green-700">Declining</b></span>
      <span title="P0 critical (≥0.85) · P1 high (≥0.7) · P2 medium (≥0.5) · P3 low/minimal (<0.5)">
        Priority: P0 · P1 · P2 · P3
      </span>
    </div>
  );
}

function infoHtml(h: Hotspot): string {
  return `<div style="font-size:13px;line-height:1.5;max-width:220px">` +
    `<b>${title(h.category)}</b><br>${h.district}, ${h.state}<br>` +
    `${fmtInt(h.signals)} signals · ${trendLabel(h.trend_pct)}<br>` +
    `Infrastructure gap: ${h.gap_index?.toFixed(2) ?? "—"}<br>` +
    `Population affected: ${fmtInt(h.population)}<br>` +
    `<a href="${hotspotHref(h)}">View Evidence</a></div>`;
}

export default function Map({ hotspots, selectedId, onSelect }: {
  hotspots: Hotspot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mapsFailed, setMapsFailed] = useState(false);
  const pts = hotspots.filter((h) => h.latitude != null && h.longitude != null).slice(0, 50);
  const selected = hotspots.find((h) => h.id === selectedId) ?? null;

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
        const info = new window.google.maps.InfoWindow();
        for (const p of pts) {
          const marker = new window.google.maps.Marker({
            position: { lat: p.latitude, lng: p.longitude },
            map,
            title: `${p.district} — ${p.category} (${p.signals})`,
          });
          marker.addListener("click", () => {
            onSelect(p.id);
            info.setContent(infoHtml(p));
            info.open(map, marker);
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
        <div ref={ref} className="h-[28rem] w-full rounded-md border" role="img" aria-label="Hotspot map" />
        <MapLegend />
      </div>
    );
  }

  const max = Math.max(...pts.map((p) => p.signals), 1);
  const X = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
  const Y = (lat: number) => (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 100;
  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-[28rem] w-full rounded-md border bg-zinc-50" role="img" aria-label="Hotspot map (fallback)">
        <defs>
          <filter id="hs-heat" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        {/* Intensity layer: blurred signal-volume circles (district coordinates, real data). */}
        <g filter="url(#hs-heat)" opacity="0.5">
          {pts.map((p) => (
            <circle key={`heat-${p.id}`} cx={X(p.longitude!)} cy={Y(p.latitude!)}
              r={2.5 + (p.signals / max) * 4.5} fill="#f59e0b" />
          ))}
        </g>
        {pts.map((p) => (
          <circle
            key={p.id}
            cx={X(p.longitude!)}
            cy={Y(p.latitude!)}
            r={1.2 + (p.signals / max) * 2.2}
            fill={p.priority_score >= 0.7 ? "#b91c1c" : p.priority_score >= 0.5 ? "#d97706" : "#3f6212"}
            opacity={selected?.id === p.id ? 1 : 0.75}
            stroke={selected?.id === p.id ? "#000" : "none"}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(p.id)}
          >
            <title>{`${p.district}, ${p.state} — ${p.category}: ${p.signals} signals`}</title>
          </circle>
        ))}
        {pts.length === 0 && <text x="50" y="50" textAnchor="middle" fontSize="3">No coordinates</text>}
      </svg>
      {selected && (
        <div className="mt-2 rounded-md border p-3 text-sm">
          <p className="font-semibold">{title(selected.category)} — {selected.district}, {selected.state}</p>
          <p className="mt-1">{fmtInt(selected.signals)} signals · {trendLabel(selected.trend_pct)}</p>
          <p>Infrastructure gap: {selected.gap_index?.toFixed(2) ?? "—"} ({title(selected.priority_level)} priority)</p>
          <p>Population affected: {fmtInt(selected.population)}</p>
          <a className="mt-1 inline-block underline" href={hotspotHref(selected)}>View Evidence</a>
        </div>
      )}
      <p className="mt-1 text-xs text-zinc-500">
        {MAPS_KEY ? "Interactive map unavailable — showing fallback." : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for the interactive map."} Circle size = signals; red = high priority. Click a marker for details.
      </p>
      <MapLegend />
    </div>
  );
}
