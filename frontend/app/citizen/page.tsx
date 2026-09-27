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

const ANALYSIS_STAGES = [
  "Understanding language",
  "Identifying civic category",
  "Detecting severity",
  "Connecting location",
  "Structuring civic signal",
];

const PIPELINE_STAGES: [string, string][] = [
  ["Your voice", "People describe what their community needs, in their own language."],
  ["Gemini", "Language and intent become structured data — category, severity, summary."],
  ["Civic signal", "A validated, located record of one community concern."],
  ["Civic intelligence", "Signals join infrastructure, demographic and investment context."],
  ["Development insight", "Evidence and scenarios inform real planning decisions."],
];

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
  const [submittedText, setSubmittedText] = useState("");
  const [placeholder, setPlaceholder] = useState(`Example: ${EXAMPLES[1]}`);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [lang, setLang] = useState("auto");
  const [voiceLang, setVoiceLang] = useState("hi-IN");
  const [state, setState] = useState("Uttar Pradesh");
  const [district, setDistrict] = useState("Lucknow");
  const [locality, setLocality] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [exploreId, setExploreId] = useState<string | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("ready");
  const [recSec, setRecSec] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % EXAMPLES.length;
      setPlaceholder(`Example: ${EXAMPLES[i]}`);
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

  // Animated analysis progress, tied to the single real request in flight.
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStageIdx((i) => Math.min(i + 1, ANALYSIS_STAGES.length - 1)), 1200);
    return () => clearInterval(t);
  }, [loading]);

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
    setStageIdx(0);
    setSubmittedText(input);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${API_URL}/api/v1/citizen/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          language: lang,
          state,
          district,
          locality: locality.trim() || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lon ?? null,
        }),
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

  function resetAll() {
    setSignal(null);
    setText("");
    setTranscript("");
    setSubmittedText("");
    setPhase("ready");
    setExploreId(null);
    setSubmittedAt(null);
    setError(null);
    setVoiceError(null);
    setActiveStage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function useMyLocation() {
    setGeoMsg(null);
    if (!navigator.geolocation) {
      setGeoMsg("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoMsg("Location attached — state and district selection still apply.");
      },
      () => setGeoMsg("Could not read your location. Please select state and district."),
      { timeout: 10000 }
    );
  }

  const autoStage = !signal ? 0 : 4;

  return (
    <main className="mx-auto max-w-[1280px] px-6 md:px-10 py-10">
      {/* HERO */}
      <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU · CITIZEN VOICE</p>
      <h1 className="mt-1 max-w-3xl font-serif text-4xl font-semibold tracking-tight">
        Tell us what&apos;s happening in your community.
      </h1>
      <p className="mt-2 max-w-2xl text-zinc-600">
        Speak naturally. Write in your own language. JanSetu uses AI to turn your
        experience into a structured civic signal that can be connected to development data.
      </p>

      {/* WORKSPACE */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT — INPUT */}
        <section aria-labelledby="input-heading" className="rounded-xl border border-[#E7E3DB] bg-white p-6">
          <h2 id="input-heading" className="text-sm font-semibold tracking-widest text-zinc-500">YOUR COMMUNITY SIGNAL</h2>
          <div role="tablist" aria-label="Input mode" className="mt-3 inline-flex rounded-md border border-[#E7E3DB] p-1 text-sm">
            {(["text", "voice"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded px-4 py-2 font-medium transition-colors duration-150 ${mode === m ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
              >
                {m === "text" ? "Write" : "Speak"}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="lang">Language</label>
                <select id="lang" className="rounded-md border border-[#E7E3DB] p-1.5" value={lang}
                  onChange={(e) => setLang(e.target.value)} disabled={loading}>
                  <option value="auto">Auto detect</option>
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                  <option value="bn">Bengali</option>
                  <option value="mr">Marathi</option>
                  <option value="kn">Kannada</option>
                </select>
              </div>
              <label className="mt-3 block text-sm font-medium" htmlFor="issue">Describe what your community is experiencing…</label>
              <textarea
                id="issue"
                className="mt-2 min-h-40 w-full rounded-md border border-[#E7E3DB] p-3 text-base focus:border-black focus:outline-none"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                disabled={loading}
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-xs text-zinc-500">{text.length} / 5000</span>
                <span className="flex items-center gap-2">
                  <button onClick={() => setMode("voice")} className="rounded-md border border-[#E7E3DB] px-3 py-2 text-sm hover:bg-zinc-50" title="Switch to voice input">🎙 Voice</button>
                  <select aria-label="Language" className="rounded-md border border-[#E7E3DB] p-2 text-sm" value={lang}
                    onChange={(e) => setLang(e.target.value)} disabled={loading}>
                    <option value="auto">Auto</option>
                    <option value="hi">HI</option>
                    <option value="en">EN</option>
                    <option value="bn">BN</option>
                    <option value="mr">MR</option>
                    <option value="kn">KN</option>
                  </select>
                  <Button onClick={() => analyzeText(text)} disabled={loading}>
                    {loading ? "Analyzing…" : "Analyze with AI →"}
                  </Button>
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-[#E7E3DB] bg-[#F6F4EF] p-6 text-center">
              <div aria-hidden="true" className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${phase === "recording" ? "bg-red-700" : "bg-black"}`}>
                <span className={`text-xl text-white ${phase === "recording" ? "animate-pulse" : ""}`}>●</span>
              </div>
              <p className="mt-3 font-medium" role="status" aria-live="polite">
                {phase === "recording" ? `Listening to your voice… ${fmtTime(recSec)}` : PHASE_LABEL[phase]}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span key={i} className={`inline-block w-1 rounded bg-zinc-400 ${phase === "recording" ? "signal-dot" : "opacity-40"}`}
                    style={{ height: `${8 + ((i * 5) % 14)}px`, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <label htmlFor="voice-lang">Voice language</label>
                <select id="voice-lang" className="rounded-md border border-[#E7E3DB] bg-white p-1.5" value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)} disabled={phase === "recording" || phase === "processing"}>
                  <option value="hi-IN">Hindi</option>
                  <option value="en-IN">English (India)</option>
                  <option value="bn-IN">Bengali</option>
                  <option value="mr-IN">Marathi</option>
                  <option value="kn-IN">Kannada</option>
                </select>
              </div>
              <div className="mt-4">
                {phase === "recording" ? (
                  <Button variant="destructive" onClick={stopRecording} className="min-h-11 px-6">
                    Stop recording ({fmtTime(recSec)})
                  </Button>
                ) : (
                  <Button variant="outline" onClick={startRecording} disabled={phase === "processing"} className="min-h-11 px-6">
                    {phase === "complete" ? "Record again" : "Start recording"}
                  </Button>
                )}
              </div>
              {voiceError && <p role="alert" className="mx-auto mt-3 max-w-md rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{voiceError}</p>}
              {phase === "complete" && (
                <div className="mt-4 text-left">
                  <label className="block text-sm font-medium" htmlFor="transcript">Your transcript (editable)</label>
                  <textarea id="transcript" className="mt-2 w-full rounded-md border border-[#E7E3DB] bg-white p-3 text-base" rows={4}
                    value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={loading} />
                  <Button className="mt-3" onClick={() => analyzeText(transcript)} disabled={loading}>
                    {loading ? "Analyzing…" : "Analyze concern →"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* LOCATION */}
          <div className="mt-6 border-t border-[#E7E3DB] pt-4">
            <h3 className="text-sm font-semibold tracking-wide">WHERE IS THIS HAPPENING?</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium" htmlFor="state">State</label>
                <select id="state" className="mt-1 h-[52px] w-full rounded-md border border-[#d8d8d8] bg-white px-4 text-[15px]" value={state} disabled={loading}
                  onChange={(e) => { setState(e.target.value); setDistrict(STATE_DISTRICTS[e.target.value][0]); }}>
                  {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="district">District</label>
                <select id="district" className="mt-1 h-[52px] w-full rounded-md border border-[#d8d8d8] bg-white px-4 text-[15px]" value={district} disabled={loading}
                  onChange={(e) => setDistrict(e.target.value)}>
                  {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-3 block text-sm font-medium" htmlFor="locality">
              Locality <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input id="locality" className="mt-1 w-full rounded-md border border-[#d8d8d8] p-3" value={locality}
              onChange={(e) => setLocality(e.target.value)} placeholder="Village / ward" disabled={loading} />
            <div className="mt-2 flex items-center gap-2 text-sm">
              <button onClick={useMyLocation} className="rounded-md border border-[#E7E3DB] px-3 py-1.5 hover:bg-zinc-50">
                Use my location
              </button>
              {coords && <span className="text-xs text-zinc-500">📍 {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}</span>}
            </div>
            {geoMsg && <p className="mt-1 text-xs text-zinc-500">{geoMsg}</p>}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          )}
        </section>

        {/* RIGHT — AI PANEL */}
        <aside aria-label="JanSetu AI interpretation" className="rounded-xl border border-[#E7E3DB] bg-white p-6 lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-semibold tracking-widest text-zinc-500">JANSETU AI</p>
          {loading ? (
            <>
              <p className="mt-1 font-medium" role="status" aria-live="polite">
                <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#D99A18]" />
                Analyzing your concern
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {ANALYSIS_STAGES.map((s, i) => (
                  <li key={s} className={`flex items-center gap-2 ${i <= stageIdx ? "text-black" : "text-zinc-400"}`}>
                    <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${i < stageIdx ? "bg-green-700 text-white" : i === stageIdx ? "animate-pulse bg-[#D99A18] text-white" : "bg-zinc-100 text-zinc-400"}`}>
                      {i < stageIdx ? "✓" : i + 1}
                    </span>
                    {s}{i === stageIdx && " ●"}
                  </li>
                ))}
              </ul>
            </>
          ) : signal ? (
            <>
              <p className="mt-1 font-medium">
                <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-green-700" />
                Understood
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-zinc-500">Category</dt><dd className="font-semibold">{title(signal.category)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-zinc-500">Severity</dt><dd className="font-semibold">{title(signal.severity)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-zinc-500">Location</dt><dd className="font-semibold">{[signal.district, signal.state].filter(Boolean).join(", ") || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-zinc-500">AI confidence</dt><dd className="font-semibold">{signal.ai_confidence != null ? `${Math.round(signal.ai_confidence * 100)}%` : "—"}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <p className="mt-1 font-medium">
                <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-green-700" />
                Ready
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                Once you submit your concern, JanSetu will identify the civic category,
                severity, location and structured summary.
              </p>
            </>
          )}
        </aside>
      </div>

      {/* RESULT */}
      {signal && (
        <section aria-labelledby="result-heading" className="mx-auto mt-8 max-w-3xl">
          <div className="rounded-xl border border-[#E7E3DB] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold tracking-widest text-zinc-500">JANSETU UNDERSTANDING</p>
            <h2 id="result-heading" className="mt-1 text-xl font-semibold">Your concern has been heard. ✓</h2>
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md bg-[#F6F4EF] p-3"><dt className="text-xs text-zinc-500">CATEGORY</dt><dd className="mt-1 text-lg font-semibold">{title(signal.category)}</dd></div>
              <div className="rounded-md bg-[#F6F4EF] p-3"><dt className="text-xs text-zinc-500">SEVERITY</dt><dd className="mt-1 text-lg font-semibold">{title(signal.severity)} priority</dd></div>
              <div className="rounded-md bg-[#F6F4EF] p-3"><dt className="text-xs text-zinc-500">LOCATION</dt><dd className="mt-1 text-lg font-semibold">{[signal.district, signal.state].filter(Boolean).join(", ")}</dd></div>
              <div className="rounded-md bg-[#F6F4EF] p-3"><dt className="text-xs text-zinc-500">AI CONFIDENCE</dt><dd className="mt-1 text-lg font-semibold">{signal.ai_confidence != null ? `${Math.round(signal.ai_confidence * 100)}%` : "—"}</dd></div>
            </dl>
            <p className="mt-3 text-sm"><span className="font-medium">Language:</span> {LANGUAGE_NAMES[signal.language] ?? signal.language} · <span className="font-medium">Signal ID:</span> #{signal.id}{submittedAt ? <> · <span className="font-medium">Submitted:</span> {submittedAt}</> : null}</p>
            <p className="mt-2 text-sm text-zinc-600">“{signal.summary ?? submittedText.slice(0, 160)}”</p>
            <p className="mt-2 text-xs text-zinc-500">
              AI helps structure your concern. Civic metrics are calculated by JanSetu&apos;s deterministic data engine.{" "}
              {signal.extractor === "gemini" ? "Live AI extraction via Google Gemini." : "Demo fallback — structured without a live AI call."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-md bg-black px-4 py-2 text-sm text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                View how this contributes to civic intelligence →
              </Link>
              {exploreId && (
                <Link href={`/hotspots/${encodeURIComponent(exploreId)}`} className="rounded-md border border-[#E7E3DB] px-4 py-2 text-sm hover:bg-zinc-50">
                  Explore this area →
                </Link>
              )}
              <button onClick={resetAll} className="rounded-md border border-[#E7E3DB] px-4 py-2 text-sm hover:bg-zinc-50">
                Submit another signal
              </button>
            </div>
          </div>

          {/* SIGNAL VIZ */}
          <div className="mt-4 rounded-xl border border-[#E7E3DB] bg-white p-6">
            <p className="text-xs font-semibold tracking-widest text-zinc-500">YOUR VOICE → CIVIC SIGNAL</p>
            <ol className="mt-3 space-y-2 text-sm">
              <li className="rounded-md bg-[#F6F4EF] p-3">
                <p className="text-xs text-zinc-500">Citizen words</p>
                <p className="mt-1">“{submittedText.slice(0, 120)}{submittedText.length > 120 ? "…" : ""}”</p>
              </li>
              <li className="rounded-md bg-[#F6F4EF] p-3">
                <p className="text-xs text-zinc-500">AI understanding</p>
                <p className="mt-1 font-medium">{title(signal.category)} · {title(signal.sub_category ?? signal.category)}</p>
              </li>
              <li className="rounded-md bg-[#F6F4EF] p-3">
                <p className="text-xs text-zinc-500">Civic signal</p>
                <p className="mt-1 font-medium">{title(signal.severity)} priority · {[signal.district, signal.state].filter(Boolean).join(", ")} · #{signal.id}</p>
              </li>
            </ol>
            <p className="mt-3 text-sm font-medium">Ready for civic intelligence →</p>
            <Link href="/dashboard" className="mt-2 inline-block rounded-md bg-black px-4 py-2 text-sm text-white">
              Continue →
            </Link>
          </div>
        </section>
      )}

      {/* PIPELINE */}
      <section className="mx-auto mt-10 max-w-[1280px]">
        <h2 className="font-serif text-2xl font-semibold">How JanSetu understands you</h2>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE_STAGES.map(([t, d], i) => {
            const n = i + 1;
            const isActive = (activeStage ?? autoStage) === i;
            return (
              <li key={t}>
                <button onClick={() => setActiveStage(activeStage === i ? null : i)}
                  className={`w-full rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] ${isActive ? "border-[#D99A18] bg-[#F6F4EF]" : "border-[#E7E3DB] bg-white"}`}
                  aria-pressed={isActive}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isActive ? "bg-[#D99A18] text-white" : "bg-zinc-100 text-zinc-600"}`}>
                    {String(n).padStart(2, "0")}
                  </span>
                  <span className="mt-2 block text-sm font-semibold">{t}</span>
                  <span className={`mt-1 block text-xs text-zinc-500 ${isActive ? "" : "hidden group-hover:block"}`}>{d}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* TRANSPARENCY */}
      <section className="mx-auto mt-8 max-w-[1280px] rounded-xl border border-[#E7E3DB] bg-white p-6">
        <h2 className="text-sm font-semibold tracking-widest text-zinc-500">HOW JANSETU USES AI</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Gemini helps understand and structure citizen language. Deterministic backend
          systems calculate civic metrics. Your submission becomes a structured signal.
          Numerical priorities are NOT generated by the language model.
        </p>
      </section>
    </main>
  );
}
