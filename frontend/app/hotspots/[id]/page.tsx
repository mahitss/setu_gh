"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import HotspotDetailView from "@/components/HotspotDetailView";
import { Skeleton } from "@/components/ui";
import { apiGet } from "@/lib/api";
import type { CompareOut, HotspotDetail, RecommendationOut } from "@/lib/api";

export default function HotspotByIdPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<HotspotDetail | null>(null);
  const [rec, setRec] = useState<RecommendationOut | null>(null);
  const [compare, setCompare] = useState<CompareOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    // useParams decodes percent-encoding, but decode once more if it arrives raw —
    // either way `raw` ends up the canonical id and is safely re-encoded below.
    const raw = params.id.includes("%") ? decodeURIComponent(params.id) : params.id;
    const base = `/api/v1/hotspots/${encodeURIComponent(raw)}`;
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
  }, [params, reloadKey]);

  if (error) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 md:px-10 py-12">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
        <div className="mt-4 flex gap-3">
          <button onClick={() => { setError(null); setReloadKey((k) => k + 1); }}
            className="rounded-md border px-4 py-2 text-sm hover:bg-zinc-50">
            Retry
          </button>
          <Link href="/dashboard" className="underline self-center text-sm">Back to dashboard</Link>
        </div>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 md:px-10 py-12" aria-label="Loading hotspot">
        <p className="text-xs font-semibold tracking-widest text-zinc-500">JANSETU INTELLIGENCE</p>
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    );
  }
  return <HotspotDetailView detail={detail} rec={rec} compare={compare} />;
}
