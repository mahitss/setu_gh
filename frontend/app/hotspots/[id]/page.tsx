"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import HotspotDetailView from "@/components/HotspotDetailView";
import { apiGet } from "@/lib/api";
import type { CompareOut, HotspotDetail, RecommendationOut } from "@/lib/api";

export default function HotspotByIdPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<HotspotDetail | null>(null);
  const [rec, setRec] = useState<RecommendationOut | null>(null);
  const [compare, setCompare] = useState<CompareOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const base = `/api/v1/hotspots/${encodeURIComponent(params.id)}`;
    apiGet<HotspotDetail>(base, ctrl.signal)
      .then((d) => {
        setDetail(d);
        const h = d.hotspot;
        const body = {
          state: h.state,
          district: h.district,
          category: h.category,
          budgets_cr: [50, 100, 250],
        };
        apiGet<RecommendationOut>(`${base}/recommendation`, ctrl.signal)
          .then(setRec)
          .catch(() => setRec(null));
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/simulate/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((c) => setCompare(c))
          .catch(() => setCompare(null));
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Could not load this hotspot. It may not exist or the server is unreachable.");
      });
    return () => ctrl.abort();
  }, [params]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block underline">Back to dashboard</Link>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-zinc-600">Loading hotspot…</p>
      </main>
    );
  }
  return <HotspotDetailView detail={detail} rec={rec} compare={compare} />;
}
