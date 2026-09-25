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
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]);
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
  const issueRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRef = useRef<HTMLDivElement | null>(null);

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

  function scrollTo(el: React.RefObject<HTMLElement | null>) {
    el.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (el === issueRef) issueRef.current?.focus({ preventScroll: true });
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* HERO */}
      <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your voice can help shape better development decisions.
      </h1>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => scrollTo(issueRef)}>Describe a problem</Button>
        <Button variant="outline" onClick={() => { scrollTo(voiceRef); if (phase === "ready" || phase === "error") startRecording(); }}>
          🎙️ Speak instead
        </Button>
      </div>

      {/* TEXT */}
      <section aria-labelledby="text-heading" className="mt-10">
        <h2 id="text-heading" className="text-xl font-semibold">Describe your concern</h2>
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
        <label className="mt-3 block text-sm font-medium" htmlFor="issue">Your concern (large text)</label>
        <textarea
          id="issue"
          ref={issueRef}
          className="mt-2 min-h-36 w-full rounded-md border p-3 text-base"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
        />
        <Button className="mt-3" onClick={() => analyzeText(text)} disabled={loading}>
          {loading ? "Analyzing…" : "Analyze my concern"}
        </Button>
      </section>

      {/* VOICE */}
      <section aria-labelledby="voice-heading" className="mt-10 rounded-md border p-5" ref={voiceRef}>
        <h2 id="voice-heading" className="text-xl font-semibold">Or speak</h2>
        <p className="mt-1 text-sm text-zinc-600" role="status" aria-live="polite">
          Status: {PHASE_LABEL[phase]}
          {phase === "recording" && ` — recording ${fmtTime(recSec)}`}
          {phase === "processing" && " — transcribing, then analyzing"}
        </p>
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
          {phase === "recording" ? (
            <Button variant="destructive" onClick={stopRecording}>⏹ Stop ({fmtTime(recSec)})</Button>
          ) : (
            <Button variant="outline" onClick={startRecording} disabled={phase === "processing"}>
              🎙️ {phase === "complete" ? "Record again" : "Start recording"}
            </Button>
          )}
        </div>
        {voiceError && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{voiceError}</p>}
        {phase === "complete" && (
          <div className="mt-4">
            <label className="block text-sm font-medium" htmlFor="transcript">Your transcript (editable — correct it if needed)</label>
            <textarea id="transcript" className="mt-2 w-full rounded-md border p-3 text-base" rows={4}
              value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={loading} />
            <Button className="mt-3" onClick={() => analyzeText(transcript)} disabled={loading}>
              {loading ? "Analyzing…" : "Analyze concern"}
            </Button>
          </div>
        )}
      </section>

      {/* LOCATION */}
      <section aria-labelledby="loc-heading" className="mt-10">
        <h2 id="loc-heading" className="text-xl font-semibold">Location</h2>
        <p className="mt-1 text-sm text-zinc-600">Location helps us connect your concern with local development data.</p>
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

      {error && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>
      )}

      {/* RESULT */}
      {signal && (
        <section aria-labelledby="result-heading" className="mt-8 rounded-md border p-5">
          <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU UNDERSTOOD</p>
          <h2 id="result-heading" className="mt-1 text-xl font-semibold">✓ Concern recorded</h2>
          <p className="mt-1 text-sm text-zinc-600">Your concern has been converted into a structured civic signal.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Category</dt><dd>{title(signal.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Issue</dt><dd>{signal.summary ?? title(signal.sub_category ?? signal.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Severity</dt><dd>{title(signal.severity)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Language</dt><dd>{LANGUAGE_NAMES[signal.language] ?? signal.language}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Location</dt><dd>{[signal.district, signal.state].filter(Boolean).join(", ")}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Signal ID</dt><dd>#{signal.id}</dd></div>
            {submittedAt && <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium">Submitted</dt><dd>{submittedAt}</dd></div>}
          </dl>
          <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm">
            <p className="font-semibold">AI understanding</p>
            <p className="text-zinc-600">Classification, summary, language, extracted issue.</p>
            <p className="mt-2 font-semibold">Civic data</p>
            <p className="text-zinc-600">Stored signal, district aggregation, infrastructure, demographics, investment.</p>
            <p className="mt-2 text-xs text-zinc-500">AI helps structure your concern. Civic metrics are calculated by JanSetu&apos;s deterministic data engine.</p>
            {signal.extractor === "gemini" ? (
              <p className="mt-1 text-xs text-zinc-500">Live AI extraction via Google Gemini.</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">Demo fallback — structured without a live AI call.</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-md bg-black px-4 py-2 text-sm text-white">
              See how this contributes to civic trends →
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
