"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui";
import Map from "@/components/Map";
import { fmtInt, hotspotHref, title, trendLabel } from "@/lib/api";
import type { Hotspot } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const HISTORY_KEY = "jansetu-recent-queries";

const EXAMPLES = [
  "Show rising healthcare issues in Uttar Pradesh",
  "Which districts have the largest water demand?",
  "Show education hotspots with infrastructure gaps",
  "Where is road demand increasing?",
];

type NlResult = {
  question: string;
  filters: Record<string, string | number>;
  source: string;
  matches: Hotspot[];
  count: number;
};

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export default function AskJanSetu({ hotspots }: { hotspots: Hotspot[] }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<NlResult | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function run(q: string) {
    const query = q.trim();
    setErr(null);
    setResult(null);
    if (!query) {
      setErr("Try asking about a sector, location, or trend.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/policy-query/nl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Try asking about a sector, location, or trend.");
      setResult({ ...data, question: query });
      setHistory((h) => {
        const next = [query, ...h.filter((x) => x !== query)].slice(0, 5);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable — history stays in memory only */
        }
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not answer that question.");
    } finally {
      setBusy(false);
    }
  }

  const f = result?.filters ?? {};
  const understood: [string, string][] = [
    ["Category", f.category ? title(String(f.category)) : "—"],
    ["State", f.state ? String(f.state) : "—"],
    ["District", f.district ? String(f.district) : "—"],
    ["Trend", Number(f.min_signals ?? 0) >= 50 ? "Rising" : "—"],
    ["Other filters", [
      Number(f.min_gap ?? 0) > 0 ? `gap ≥ ${f.min_gap}` : "",
      f.max_investment_cr ? `investment ≤ ₹${f.max_investment_cr} Cr` : "",
    ].filter(Boolean).join(" · ") || "—"],
  ];

  // Explore further: derived ONLY from available data, never invented.
  const explore: string[] = [];
  if (result && result.count > 0) {
    const cat = String(f.category ?? result.matches[0].category);
    const states = [...new Set(hotspots.filter((h) => h.category === cat).map((h) => h.state))]
      .filter((s) => s !== f.state).slice(0, 2);
    states.forEach((s) => explore.push(`Show ${cat} hotspots in ${s}`));
    const otherCat = [...new Set(hotspots.filter((h) => !f.state || h.state === f.state).map((h) => h.category))]
      .filter((c) => c !== cat).slice(0, 2);
    otherCat.forEach((c) => explore.push(
      f.state ? `Show ${c} demand in ${f.state}` : `Where is ${c} demand rising?`));
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--js-surface)] p-5">
      <h3 className="text-lg font-semibold">Ask JanSetu</h3>
      <div className="mt-3 flex gap-2">
        <input
          className="w-full rounded-md border border-[var(--border)] bg-[var(--js-surface)] p-2.5 placeholder:text-[var(--js-faint)] focus:border-[var(--js-accent)] focus:outline-none"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(question);
          }}
          placeholder="Show rising healthcare problems in UP"
          disabled={busy}
          aria-label="Policy question"
        />
        <Button onClick={() => run(question)} disabled={busy}>{busy ? "…" : "Analyze →"}</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--js-muted)] transition-colors hover:bg-[var(--js-track)]"
            onClick={() => { setQuestion(ex); run(ex); }} disabled={busy}>
            {ex}
          </button>
        ))}
      </div>
      {history.length > 0 && (
        <p className="mt-3 text-xs text-[var(--js-muted)]">
          Recent queries:{" "}
          {history.map((h, i) => (
            <span key={h}>
              {i > 0 && " · "}
              <button className="underline underline-offset-2 hover:text-[var(--foreground)]" onClick={() => { setQuestion(h); run(h); }} disabled={busy}>
                {h.length > 42 ? `${h.slice(0, 42)}…` : h}
              </button>
            </span>
          ))}
        </p>
      )}
      {err && <p role="alert" className="mt-3 rounded-md border border-[#C93636]/40 bg-[#C93636]/10 p-3 text-sm text-[#C93636] dark:text-[#F87171]">{err}</p>}

      {result && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold tracking-wide text-[var(--js-muted)]">UNDERSTOOD AS</h4>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm lg:grid-cols-5">
            {understood.map(([k, v]) => (
              <div key={k} className="rounded-md bg-[var(--js-track)]/60 p-2">
                <dt className="text-xs text-[var(--js-muted)]">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          {result.matches.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No matching hotspots found"
                body="No districts match these interpreted filters. Try a broader sector or remove the location."
              />
            </div>
          ) : (
            <>
              <p className="mt-4 text-sm text-[var(--js-muted)]">
                {result.count} matching district{result.count === 1 ? "" : "s"} · deterministic engine
                {result.source === "keyword_parser" ? " (rule-based parse — live AI unavailable)" : ""}
              </p>
              <div className="mt-3">
                <Map hotspots={result.matches} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {result.matches.slice(0, 6).map((m) => (
                  <div key={m.id} className="rounded-md border border-[var(--border)] bg-[var(--js-surface)] p-4">
                    <p className="font-semibold">{m.district} <span className="font-normal text-[var(--js-muted)]">· {m.state}</span></p>
                    <p className="text-sm text-[var(--js-muted)]">{title(m.category)} · {title(m.priority_level)} priority</p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between"><dt className="text-[var(--js-muted)]">Demand</dt><dd className="font-medium">{fmtInt(m.signals)} signals</dd></div>
                      <div className="flex justify-between"><dt className="text-[var(--js-muted)]">Trend</dt><dd className="font-medium">{trendLabel(m.trend_pct)}</dd></div>
                      <div className="flex justify-between"><dt className="text-[var(--js-muted)]">Infrastructure gap</dt><dd className="font-medium">{m.gap_index?.toFixed(2) ?? "—"}</dd></div>
                      <div className="flex justify-between"><dt className="text-[var(--js-muted)]">Population</dt><dd className="font-medium">{fmtInt(m.population)}</dd></div>
                    </dl>
                    <Link href={hotspotHref(m)} className="mt-2 inline-block text-sm underline">View evidence →</Link>
                  </div>
                ))}
              </div>
            </>
          )}

          {explore.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">Explore further</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {explore.map((ex) => (
                  <button key={ex} className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--js-muted)] transition-colors hover:bg-[var(--js-track)]"
                    onClick={() => { setQuestion(ex); run(ex); }} disabled={busy}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-md bg-[var(--js-track)]/60 p-3 text-xs text-[var(--js-muted)]">
            <p className="font-semibold">How JanSetu answered</p>
            <p className="mt-1">Natural-language request → AI interpreted filters → deterministic civic data engine → evidence-backed results. Rankings and numbers are computed, never generated.</p>
          </div>
        </div>
      )}
    </div>
  );
}
