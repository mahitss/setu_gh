"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import HotspotDetailView from "@/components/HotspotDetailView";
import { apiGet } from "@/lib/api";
import type { HotspotDetail } from "@/lib/api";

export default function HotspotByIdPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<HotspotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<HotspotDetail>(`/api/v1/hotspots/${encodeURIComponent(params.id)}`, ctrl.signal)
      .then(setDetail)
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
  return <HotspotDetailView detail={detail} />;
}
