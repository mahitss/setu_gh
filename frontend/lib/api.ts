export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Hotspot = {
  id: string;
  state: string;
  district: string;
  category: string;
  signals: number;
  signal_count: number;
  recent_30d: number;
  demand_index: number;
  demand_trend: number | null;
  trend_pct: number | null;
  priority_level: string;
  latitude: number | null;
  longitude: number | null;
  population: number;
  population_affected: number;
  gap_index: number | null;
  infrastructure_gap: number | null;
  investment_inr: number;
  investment: number;
  priority_score: number;
  factors: Record<string, number>;
};

export type TopCategory = {
  category: string;
  count: number;
  trend_percent: number | null;
};

export type Summary = {
  total_signals: number;
  citizen_signals: number;
  active_hotspots: number;
  high_priority_areas: number;
  population_covered: number;
  population_affected: number;
  top_categories: TopCategory[];
  top_hotspots: Hotspot[];
};

export type PulseItem = {
  category: string;
  current_count: number;
  previous_count: number;
  trend_percent: number | null;
  status: "ok" | "insufficient_data";
  recent_30d: number;
  prior: number;
  growth_pct: number | null;
};

export type HotspotDetail = {
  hotspot: Hotspot;
  evidence: Record<string, unknown>;
  recommendation: string;
  note: string;
};

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`Server returned ${res.status}. Please try again.`);
  return res.json() as Promise<T>;
}

const inFmt = new Intl.NumberFormat("en-IN");

export const fmtInt = (n: number) => inFmt.format(n);

export function fmtInr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${inFmt.format(Math.round(n))}`;
}

export const title = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function hotspotHref(h: { id: string }): string {
  return `/hotspots/${encodeURIComponent(h.id)}`;
}

export function trendLabel(t: number | null | undefined): string {
  if (t == null) return "new";
  return `${t >= 0 ? "+" : ""}${t}%`;
}
