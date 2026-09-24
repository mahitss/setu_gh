"use client";

import { useEffect, useRef, useState } from "react";
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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("maps-load"));
    document.head.appendChild(s);
  });
}

export default function Map({ hotspots }: { hotspots: Hotspot[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mapsFailed, setMapsFailed] = useState(false);
  const pts = hotspots.filter((h) => h.latitude != null && h.longitude != null).slice(0, 50);

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
          new window.google.maps.Marker({
            position: { lat: p.latitude, lng: p.longitude },
            map,
            title: `${p.district} — ${p.category} (${p.signals})`,
          });
        }
      })
      .catch(() => setMapsFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspots]);

  if (MAPS_KEY && !mapsFailed) {
    return <div ref={ref} className="h-96 w-full rounded-md border" role="img" aria-label="Hotspot map" />;
  }

  const max = Math.max(...pts.map((p) => p.signals), 1);
  const X = (lon: number) => ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * 100;
  const Y = (lat: number) => (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 100;
  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-96 w-full rounded-md border bg-zinc-50" role="img" aria-label="Hotspot map (fallback)">
        {pts.map((p) => (
          <circle
            key={`${p.state}-${p.district}-${p.category}`}
            cx={X(p.longitude!)}
            cy={Y(p.latitude!)}
            r={1.2 + (p.signals / max) * 2.2}
            fill={p.priority_score >= 0.7 ? "#b91c1c" : p.priority_score >= 0.5 ? "#d97706" : "#3f6212"}
            opacity={0.75}
          >
            <title>{`${p.district}, ${p.state} — ${p.category}: ${p.signals} signals`}</title>
          </circle>
        ))}
        {pts.length === 0 && <text x="50" y="50" textAnchor="middle" fontSize="3">No coordinates</text>}
      </svg>
      <p className="mt-1 text-xs text-zinc-500">
        {MAPS_KEY ? "Interactive map unavailable — showing fallback." : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for the interactive map."} Circle size = signals; red = high priority.
      </p>
    </div>
  );
}
