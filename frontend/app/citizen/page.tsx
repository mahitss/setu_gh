"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { STATE_DISTRICTS, title } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLES = [
  "हमारे गांव में अस्पताल बहुत दूर है...",
  "हमारे इलाके में पानी की समस्या है...",
  "हमारे गांव की सड़क खराब है...",
  "हमारे क्षेत्र में स्कूल की सुविधा कम है...",
];

const LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  bn: "Bengali",
  mr: "Marathi",
  kn: "Kannada",
};

type Signal = {
  id: number;
  category: string;
  sub_category: string | null;
  severity: string;
  summary: string | null;
  language: string;
  state: string | null;
  district: string | null;
  extractor?: string;
  ai_confidence?: number;
};

type VoicePhase = "ready" | "recording" | "processing" | "complete" | "error";

const PHASE_LABEL: Record<VoicePhase, string> = {
  ready: "Ready",
  recording: "Recording",
  processing: "Processing",
  complete: "Complete",
  error: "Error",
};

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof DOMException && e.name === "AbortError") {
    return "The request timed out. Please check your connection and try again.";
  }
  if (e instanceof TypeError) return "Cannot reach the server. Please make sure it is running and try again.";
  if (e instanceof Error) return e.message;
  return fallback;
}

export default function CitizenPage() {
  const [text, setText] = useState("");
  const [placeholder, setPlaceholder] = useState(`Example: ${EXAMPLES[1]}`);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [lang, setLang] = useState("auto");
  const [voiceLang, setVoiceLang] = useState("hi-IN");
  const [state, setState] = useState("Uttar Pradesh");
  const [district, setDistrict] = useState("Lucknow");
  const [locality, setLocality] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [exploreId, setExploreId] = useState<string | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("ready");
  const [recSec, setRecSec] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % EXAMPLES.length;
      setPlaceholder(EXAMPLES[i]);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => stopTimer, []);

  async function analyzeText(value: string) {
    const input = value.trim();
    setError(null);
    setSignal(null);
    setExploreId(null);
    if (!input) {
      setError("Please describe the issue before analyzing.");
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${API_URL}/api/v1/citizen/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, language: lang, state, district, locality: locality.trim() || null }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail = Array.isArray(data?.detail)
          ? data.detail[0]?.msg ?? "Invalid input."
          : data?.detail ?? "Something went wrong.";
        throw new Error(
          res.status === 422
            ? `Could not accept that input: ${detail}`
            : "Could not save your request. Please try again."
        );
      }
      const data = await res.json();
      setSignal(data.signal);
      setSubmittedAt(new Date().toLocaleString());
      // Link to the matching hotspot if one exists — id comes from the API, never invented.
      fetch(
        `${API_URL}/api/v1/hotspots?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}&category=${encodeURIComponent(data.signal.category)}&limit=1`,
        { signal: ctrl.signal }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => {
          if (h?.hotspots?.[0]?.id) setExploreId(h.hotspots[0].id);
        })
        .catch(() => setExploreId(null));
    } catch (e) {
      setError(friendlyError(e, "Something went wrong. Please try again."));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function startRecording() {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stopTimer();
        transcribe(new Blob(chunksRef.current, { type: rec.mimeType }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecSec(0);
      timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
      setPhase("recording");
    } catch {
      setVoiceError("Microphone unavailable. Please allow access or type your request.");
      setPhase("error");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function transcribe(blob: Blob) {
    setPhase("processing");
    setVoiceError(null);
    try {
      const form = new FormData();
      form.append("file", blob, "request.webm");
      form.append("language_code", voiceLang);
      const res = await fetch(`${API_URL}/api/v1/citizen/voice`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Voice transcription failed. Please type your request instead.");
      setTranscript(data.transcript);
      setPhase("complete");
    } catch (e) {
      setVoiceError(friendlyError(e, "Voice transcription failed. Please type your request instead."));
      setPhase("error");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 md:px-10 py-10">
      {/* HERO */}
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link href="/" className="underline hover:text-black">Home</Link>
        <span> → Citizen Voice</span>
      </nav>
      <p className="mt-2 text-sm font-semibold tracking-widest text-zinc-500">JANSETU · CITIZEN VOICE</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">Tell JanSetu what your community needs.</h1>
      <p className="mt-2 max-w-2xl text-zinc-600">You can write it or simply speak. JanSetu will help structure your concern.</p>
      <p className="mt-2 max-w-2xl text-zinc-600">
        Share a local problem in your own words. JanSetu turns your voice into a
        structured civic signal that can be connected to development data.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* FORM */}
        <div className="lg:col-span-3" id="citizen-form">
          <div role="tablist" aria-label="Input mode" className="inline-flex rounded-md border p-1 text-sm">
            {(["text", "voice"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded px-4 py-2 font-medium ${mode === m ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
              >
                {m === "text" ? "Describe a problem" : "🎙️ Speak instead"}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <section aria-labelledby="text-heading" className="mt-4">
              <h2 id="text-heading" className="text-lg font-semibold">Step 1 — Tell us what&apos;s happening</h2>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <label htmlFor="lang">Language</label>
                <select id="lang" className="rounded-md border p-1.5" value={lang} onChange={(e) => setLang(e.target.value)} disabled={loading}>
                  <option value="auto">Auto-detect</option>
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                  <option value="bn">Bengali</option>
                  <option value="mr">Marathi</option>
                  <option value="kn">Kannada</option>
                </select>
              </div>
              <label className="mt-3 block text-sm font-medium" htmlFor="issue">Your concern</label>
              <textarea
                id="issue"
                className="mt-2 min-h-40 w-full rounded-md border p-3 text-base"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
              />
            </section>
          ) : (
            <section aria-labelledby="voice-heading" className="rounded-md border border-[#E7E3DB] bg-[#F6F4EF] p-5">
              <h2 id="voice-heading" className="text-lg font-semibold">Speak your concern</h2>
              <p className="mt-1 text-sm text-zinc-600">Speak naturally. Hindi, English and other supported languages are welcome.</p>
              <h2 id="voice-heading" className="text-lg font-semibold">Speak your concern</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-sm" htmlFor="voice-lang">Voice language</label>
                <select id="voice-lang" className="rounded-md border p-1.5 text-sm" value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)} disabled={phase === "recording" || phase === "processing"}>
                  <option value="hi-IN">Hindi</option>
                  <option value="en-IN">English (India)</option>
                  <option value="bn-IN">Bengali</option>
                  <option value="mr-IN">Marathi</option>
                  <option value="kn-IN">Kannada</option>
                </select>
              </div>
              <p className="mt-3 text-sm font-medium" role="status" aria-live="polite">
                Status: {PHASE_LABEL[phase]}
                {phase === "recording" && ` — recording ${fmtTime(recSec)}`}
                {phase === "processing" && " — transcribing"}
              </p>
              <div className="mt-3">
                {phase === "recording" ? (
                  <Button variant="destructive" onClick={stopRecording} className="min-h-11 px-6">
                    ⏹ Stop ({fmtTime(recSec)})
                  </Button>
                ) : (
                  <Button variant="outline" onClick={startRecording} disabled={phase === "processing"} className="min-h-11 px-6">
                    🎙️ {phase === "complete" ? "Record again" : "Start recording"}
                  </Button>
                )}
              </div>
              {voiceError && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{voiceError}</p>}
              {phase === "complete" && (
                <div className="mt-4">
                  <p className="text-sm font-medium">Your transcript</p>
                  <label className="mt-1 block text-xs text-zinc-500" htmlFor="transcript">Editable — correct it if needed</label>
                  <textarea id="transcript" className="mt-2 w-full rounded-md border p-3 text-base" rows={4}
                    value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={loading} />
                </div>
              )}
            </section>
          )}

          {/* LOCATION */}
          <section aria-labelledby="loc-heading" className="mt-6">
            <h2 id="loc-heading" className="text-lg font-semibold">Step 2 — Where is this happening?</h2>
            <p className="mt-1 text-sm text-zinc-600">Location helps JanSetu connect your concern with local development context.</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium" htmlFor="state">State</label>
                <select id="state" className="mt-2 w-full rounded-md border p-2" value={state} disabled={loading}
                  onChange={(e) => { setState(e.target.value); setDistrict(STATE_DISTRICTS[e.target.value][0]); }}>
                  {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="district">District</label>
                <select id="district" className="mt-2 w-full rounded-md border p-2" value={district} disabled={loading}
                  onChange={(e) => setDistrict(e.target.value)}>
                  {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-4 block text-sm font-medium" htmlFor="locality">
              Locality <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input id="locality" className="mt-2 w-full rounded-md border p-2" value={locality}
              onChange={(e) => setLocality(e.target.value)} placeholder="Village / ward" disabled={loading} />
          </section>

          {/* CTA */}
          <div className="mt-6">
            {mode === "text" ? (
              <Button className="min-h-11 px-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]" onClick={() => analyzeText(text)} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze my concern →"}
              </Button>
            ) : (
              <Button className="min-h-11 px-6" onClick={() => analyzeText(transcript)} disabled={loading || phase !== "complete"}>
                {loading ? "Analyzing…" : "Analyze transcript →"}
              </Button>
            )}
            <p className="mt-2 text-xs text-zinc-500">Only the information needed to understand and locate the civic concern is processed.</p>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
          )}
        </div>

        {/* INFO PANEL */}
        <aside className="lg:col-span-2" aria-label="How JanSetu works">
          <div className="rounded-md border p-5 lg:sticky lg:top-6">
            <h2 className="text-lg font-semibold">How JanSetu works</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                ["1", "Tell us what is happening."],
                ["2", "AI structures the concern."],
                ["3", "JanSetu connects it with civic data."],
                ["4", "Evidence can inform development decisions."],
              ].map(([n, t]) => (
                <li key={n} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold">{n}</span>
                  <span className="text-zinc-700">{t}</span>
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-sm font-semibold">Supported input</h3>
            <p className="text-sm text-zinc-600">Text · Voice</p>
            <h3 className="mt-4 text-sm font-semibold">Languages</h3>
            <p className="text-sm text-zinc-600">Hindi · English · Bengali · Marathi · Kannada</p>
          </div>
        </aside>
      </div>

      {/* RESULT */}
      {signal && (
        <section aria-labelledby="result-heading" className="mx-auto mt-8 max-w-3xl rounded-md border p-5">
          <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU UNDERSTANDS</p>
          <h2 id="result-heading" className="mt-1 text-xl font-semibold">Your concern has been heard. ✓</h2>
          <p className="mt-1 text-sm text-zinc-600">JanSetu converted your message into a structured civic signal.</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Category</dt><dd>{title(signal.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Severity</dt><dd>{title(signal.severity)} priority</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Language</dt><dd>{LANGUAGE_NAMES[signal.language] ?? signal.language}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Location</dt><dd>{[signal.district, signal.state].filter(Boolean).join(", ")}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Signal ID</dt><dd>#{signal.id}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Confidence</dt><dd>{signal.ai_confidence != null ? `${Math.round(signal.ai_confidence * 100)}%` : "—"}</dd></div>
            {submittedAt && <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Submitted</dt><dd>{submittedAt}</dd></div>}
          </dl>
          <p className="mt-3 text-sm"><span className="font-medium">Issue:</span> {signal.summary ?? title(signal.sub_category ?? signal.category)}</p>
          <p className="mt-3 text-xs text-zinc-500">
            AI helps structure your concern. Civic metrics are calculated by JanSetu&apos;s deterministic data engine.{" "}
            {signal.extractor === "gemini" ? "Live AI extraction via Google Gemini." : "Demo fallback — structured without a live AI call."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-md bg-black px-4 py-2 text-sm text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              View how this contributes to civic intelligence →
            </Link>
            {exploreId && (
              <Link href={`/hotspots/${encodeURIComponent(exploreId)}`} className="rounded-md border px-4 py-2 text-sm">
                Explore this area →
              </Link>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
