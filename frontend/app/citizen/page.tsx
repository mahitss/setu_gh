"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Languages,
  MapPin,
  Mic,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { STATE_DISTRICTS, title } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EXAMPLES = [
  { text: "हमारे गांव में अस्पताल बहुत दूर है और एंबुलेंस आने में बहुत समय लगता है।", category: "Healthcare" },
  { text: "हमारे इलाके में पीने का पानी रोज़ नहीं आता, गर्मियों में बहुत दिक्कत होती है।", category: "Water" },
  { text: "स्कूल तक जाने वाली सड़क बारिश में बंद हो जाती है, बच्चों को बहुत परेशानी होती है।", category: "Roads" },
  { text: "हमारे क्षेत्र के स्कूल में शिक्षकों की कमी है और सुविधाएँ बहुत कम हैं।", category: "Education" },
];

const LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  bn: "Bengali",
  mr: "Marathi",
  kn: "Kannada",
  ta: "Tamil",
  te: "Telugu",
};

const LANGUAGE_CHIPS = ["Hindi", "English", "Bengali", "Marathi", "Kannada", "Tamil", "Telugu"];

const TEXT_LANGS: [string, string][] = [
  ["auto", "Auto detect"],
  ["hi", "Hindi"],
  ["en", "English"],
  ["bn", "Bengali"],
  ["mr", "Marathi"],
  ["kn", "Kannada"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
];

const VOICE_LANGS: [string, string][] = [
  ["hi-IN", "Hindi"],
  ["en-IN", "English (India)"],
  ["bn-IN", "Bengali"],
  ["mr-IN", "Marathi"],
  ["kn-IN", "Kannada"],
  ["ta-IN", "Tamil"],
  ["te-IN", "Telugu"],
];

const ANALYSIS_STAGES = [
  "Listening",
  "Understanding",
  "Locating",
  "Structuring",
  "Ready",
];

const AI_PIPE = ["Input", "Language", "Gemini", "Civic signal", "Evidence"] as const;

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

function Reveal({ children, className, delay }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        el.classList.add("is-visible");
        io.disconnect();
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className ?? ""}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

type OrbState = "idle" | "listening" | "thinking" | "done" | "attention";

const ORB_COPY: Record<OrbState, [string, string]> = {
  idle: ["JANSETU AI", "Ready to listen"],
  listening: ["LISTENING", "Speak naturally…"],
  thinking: ["UNDERSTANDING", "Gemini is structuring your concern…"],
  done: ["SIGNAL CREATED", "Ready to connect with civic intelligence"],
  attention: ["ATTENTION NEEDED", "Check the message below"],
};

function SignalOrb({ orb, recSec }: { orb: OrbState; recSec: number }) {
  const [headline, sub] = ORB_COPY[orb];
  const core =
    orb === "listening"
      ? "bg-[#C93636]"
      : orb === "done"
        ? "bg-[#138A52]"
        : orb === "thinking"
          ? "bg-[#F5B400]"
          : "bg-[#0B0C0F]";
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center" role="status" aria-live="polite" aria-label={`${headline}. ${sub}`}>
      <div aria-hidden="true" className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(245,180,0,0.14),transparent_65%)]" />
      <div aria-hidden="true" className="js-orb-breathe absolute inset-[6%] rounded-full border border-[#0B0C0F]/10" />
      <div aria-hidden="true" className="absolute inset-[13%] rounded-full border border-dashed border-[#0B0C0F]/20 js-orb-spin" />
      <div aria-hidden="true" className="absolute inset-[21%] rounded-full border border-[#0B0C0F]/10" />
      {orb === "listening" && (
        <span aria-hidden="true" className="absolute inset-[27%] animate-ping rounded-full bg-[#C93636]/20" />
      )}
      <div className="relative z-10 flex flex-col items-center px-10 text-center">
        <span className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-[0_18px_50px_rgba(11,12,15,0.25)] transition-colors duration-500 ${core}`}>
          {orb === "done" ? (
            <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden="true" />
          ) : orb === "listening" ? (
            <Mic className={`h-9 w-9 ${orb === "listening" ? "animate-pulse" : ""}`} aria-hidden="true" />
          ) : (
            <Sparkles className="h-8 w-8" aria-hidden="true" />
          )}
        </span>
        <p className="mt-5 text-[11px] font-bold tracking-[0.28em] text-zinc-500">{headline}</p>
        <p className="mt-1.5 font-serif text-xl font-semibold text-[#0B0C0F]">
          {orb === "listening" ? `${sub} ${fmtTime(recSec)}` : sub}
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-zinc-400">Voice ↓ · Gemini ↓ · Civic signal</p>
      </div>
    </div>
  );
}

export default function CitizenPage() {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [placeholder, setPlaceholder] = useState(`Example: ${EXAMPLES[1].text.slice(0, 42)}…`);
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % EXAMPLES.length;
      setPlaceholder(`Example: ${EXAMPLES[i].text.slice(0, 42)}…`);
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

  function pickMode(m: "text" | "voice") {
    setMode(m);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyExample(example: string) {
    setText(example);
    setMode("text");
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 450);
  }

  const orb: OrbState = signal
    ? "done"
    : phase === "recording"
      ? "listening"
      : phase === "processing" || loading
        ? "thinking"
        : phase === "error" || error
          ? "attention"
          : "idle";

  const detectedLang = signal ? (LANGUAGE_NAMES[signal.language] ?? signal.language) : null;

  return (
    <main className="flex-1 bg-[#F6F7F8]">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(rgba(11,12,15,0.055)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_80%_90%_at_50%_20%,black,transparent)]" />
          <div className="absolute -top-24 right-[10%] h-80 w-80 rounded-full bg-[#F5B400] opacity-[0.10] blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-10 px-5 pb-14 pt-12 md:px-8 min-[1440px]:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-16">
          <div className="animate-[fade-up_.5s_ease-out]">
            <p className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-zinc-500">
              <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
              JANSETU · CITIZEN VOICE
            </p>
            <h1 className="mt-5 font-serif text-[clamp(2.6rem,5.5vw,4.75rem)] font-semibold uppercase leading-[1.04] tracking-tight text-[#0B0C0F]">
              Tell us what your <span className="text-[#B87E00]">community</span> is experiencing.
            </h1>
            <p className="mt-5 max-w-xl text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-zinc-600">
              Speak naturally. Write in your own language. JanSetu turns your experience
              into a structured civic signal that can be connected to development intelligence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => pickMode("voice")}
                className={`group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold transition-all duration-200 hover:-translate-y-0.5 ${mode === "voice" ? "bg-[#F5B400] text-black shadow-[0_12px_36px_rgba(245,180,0,0.4)]" : "bg-[#0B0C0F] text-white hover:shadow-[0_12px_32px_rgba(11,12,15,0.3)]"}`}
              >
                <Mic className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                Speak
              </button>
              <button
                onClick={() => pickMode("text")}
                className={`group inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-[15px] font-medium transition-all duration-200 hover:-translate-y-0.5 ${mode === "text" ? "border-[#0B0C0F] bg-white text-[#0B0C0F] shadow-[0_12px_32px_rgba(11,12,15,0.12)]" : "border-zinc-300 bg-white/60 text-zinc-700 hover:border-zinc-500"}`}
              >
                <PenLine className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                Write
              </button>
            </div>
          </div>
          <Reveal className="w-full">
            <SignalOrb orb={orb} recSec={recSec} />
          </Reveal>
        </div>
      </section>

      {/* ================= WORKSPACE ================= */}
      <div ref={workspaceRef} className="mx-auto max-w-[1360px] scroll-mt-24 px-5 md:px-8 min-[1440px]:px-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* LEFT — INPUT */}
          <section aria-labelledby="input-heading" className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_20px_60px_rgba(11,12,15,0.07)]">
            <div className="border-b border-zinc-100 px-6 pb-5 pt-6 sm:px-8">
              <h2 id="input-heading" className="text-[11px] font-bold tracking-[0.24em] text-zinc-500">YOUR COMMUNITY SIGNAL</h2>
              <div role="tablist" aria-label="Input mode" className="mt-4 inline-flex rounded-full border border-zinc-200 bg-[#F6F7F8] p-1 text-sm">
                {(["text", "voice"] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`rounded-full px-6 py-2 font-semibold transition-all duration-200 ${mode === m ? "bg-[#0B0C0F] text-white shadow" : "text-zinc-500 hover:text-zinc-900"}`}
                  >
                    {m === "text" ? "Write" : "Speak"}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {mode === "text" ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label htmlFor="lang" className="text-[11px] font-bold tracking-[0.18em] text-zinc-500">LANGUAGE</label>
                    <select id="lang" className="rounded-full border border-zinc-200 bg-[#F6F7F8] px-4 py-2 text-sm font-medium transition-colors focus:border-[#F5B400] focus:outline-none" value={lang}
                      onChange={(e) => setLang(e.target.value)} disabled={loading}>
                      {TEXT_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <label className="mt-5 block font-serif text-2xl font-semibold text-[#0B0C0F]" htmlFor="issue">
                    What is happening in your community?
                  </label>
                  <textarea
                    id="issue"
                    ref={textareaRef}
                    className="mt-3 min-h-44 w-full resize-y rounded-xl border-2 border-zinc-200 bg-[#FDFDFC] p-4 text-[17px] leading-relaxed transition-all duration-200 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#F5B400] focus:outline-none focus:ring-4 focus:ring-[#F5B400]/15"
                    rows={7}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder}
                    disabled={loading}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs tabular-nums text-zinc-400">{text.length} / 5000</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setMode("voice")} className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-zinc-400 hover:bg-zinc-50" title="Switch to voice input">
                        <Mic size={16} aria-hidden="true" /> Voice
                      </button>
                      <select aria-label="Language" className="rounded-full border border-zinc-200 bg-[#F6F7F8] px-3 py-2.5 text-sm font-medium" value={lang}
                        onChange={(e) => setLang(e.target.value)} disabled={loading}>
                        <option value="auto">Auto</option>
                        <option value="hi">HI</option>
                        <option value="en">EN</option>
                        <option value="bn">BN</option>
                        <option value="mr">MR</option>
                        <option value="kn">KN</option>
                        <option value="ta">TA</option>
                        <option value="te">TE</option>
                      </select>
                      <Button onClick={() => analyzeText(text)} disabled={loading}
                        className="h-auto rounded-full bg-[#F5B400] px-7 py-3 text-[15px] font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FFB81C] hover:shadow-[0_12px_36px_rgba(245,180,0,0.45)] disabled:translate-none">
                        {loading ? "Analyzing…" : <>Analyze with AI <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                      </Button>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#0B0C0F] p-6 text-center text-white sm:p-8">
                  <div aria-hidden="true" className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-full transition-colors duration-300 ${phase === "recording" ? "bg-[#C93636]" : "bg-white/10"}`}>
                    {phase === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-[#C93636]/40" />}
                    <Mic className={`h-8 w-8 ${phase === "recording" ? "animate-pulse" : ""}`} aria-hidden="true" />
                  </div>
                  <p className="mt-4 font-serif text-2xl font-semibold" role="status" aria-live="polite">
                    {phase === "recording" ? `Listening… ${fmtTime(recSec)}` : PHASE_LABEL[phase]}
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <span key={i} className={`inline-block w-1 rounded-full ${phase === "recording" ? "bg-[#F5B400] signal-dot" : "bg-white/25"}`}
                        style={{ height: `${8 + ((i * 7) % 20)}px`, animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-300">
                    <label htmlFor="voice-lang">Voice language</label>
                    <select id="voice-lang" className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-white" value={voiceLang}
                      onChange={(e) => setVoiceLang(e.target.value)} disabled={phase === "recording" || phase === "processing"}>
                      {VOICE_LANGS.map(([v, l]) => <option key={v} value={v} className="text-black">{l}</option>)}
                    </select>
                  </div>
                  <div className="mt-5">
                    {phase === "recording" ? (
                      <Button variant="destructive" onClick={stopRecording} className="h-auto rounded-full px-8 py-3 text-[15px] font-semibold">
                        Stop recording ({fmtTime(recSec)})
                      </Button>
                    ) : (
                      <Button onClick={startRecording} disabled={phase === "processing"} className="h-auto rounded-full bg-[#F5B400] px-8 py-3 text-[15px] font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#FFB81C] hover:shadow-[0_12px_36px_rgba(245,180,0,0.45)]">
                        {phase === "complete" ? "Record again" : "Start recording"}
                      </Button>
                    )}
                  </div>
                  {voiceError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-[#C93636]/50 bg-[#C93636]/15 p-3 text-sm text-red-200">{voiceError}</p>}
                  {phase === "complete" && (
                    <div className="mt-5 text-left">
                      <label className="block text-sm font-medium text-zinc-300" htmlFor="transcript">Your transcript (editable)</label>
                      <textarea id="transcript" className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 p-3 text-base text-white placeholder:text-zinc-500 focus:border-[#F5B400] focus:outline-none" rows={4}
                        value={transcript} onChange={(e) => setTranscript(e.target.value)} disabled={loading} />
                      <Button className="mt-3 h-auto rounded-full bg-[#F5B400] px-6 py-2.5 text-sm font-bold text-black transition-all duration-200 hover:bg-[#FFB81C]" onClick={() => analyzeText(transcript)} disabled={loading}>
                        {loading ? "Analyzing…" : <>Analyze concern <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* LOCATION */}
              <div className="mt-8 border-t border-zinc-100 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[11px] font-bold tracking-[0.24em] text-zinc-500">WHERE IS THIS HAPPENING?</h3>
                    <p className="mt-1.5 text-sm text-zinc-500">Location gives your signal civic context.</p>
                  </div>
                  <div className="hidden items-center gap-2.5 rounded-xl bg-[#F6F7F8] px-3.5 py-2.5 sm:flex" aria-hidden="true">
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#0B0C0F]">
                      <MapPin className="h-4 w-4 text-[#F5B400]" />
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#F5B400]/20" />
                    </span>
                    <span className="text-left text-xs leading-tight">
                      <span className="block font-semibold text-[#0B0C0F]">{district}</span>
                      <span className="block text-zinc-500">{state}</span>
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700" htmlFor="state">State</label>
                    <select id="state" className="mt-1.5 h-[52px] w-full rounded-xl border border-zinc-200 bg-white px-4 text-[15px] transition-colors focus:border-[#F5B400] focus:outline-none" value={state} disabled={loading}
                      onChange={(e) => { setState(e.target.value); setDistrict(STATE_DISTRICTS[e.target.value][0]); }}>
                      {Object.keys(STATE_DISTRICTS).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700" htmlFor="district">District</label>
                    <select id="district" className="mt-1.5 h-[52px] w-full rounded-xl border border-zinc-200 bg-white px-4 text-[15px] transition-colors focus:border-[#F5B400] focus:outline-none" value={district} disabled={loading}
                      onChange={(e) => setDistrict(e.target.value)}>
                      {STATE_DISTRICTS[state].map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <label className="mt-3 block text-sm font-medium text-zinc-700" htmlFor="locality">
                  Locality <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input id="locality" className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white p-3.5 transition-colors placeholder:text-zinc-400 focus:border-[#F5B400] focus:outline-none" value={locality}
                  onChange={(e) => setLocality(e.target.value)} placeholder="Village / ward" disabled={loading} />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={useMyLocation} className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 font-medium transition-colors duration-200 hover:border-[#0B0C0F] hover:bg-zinc-50">
                    <MapPin size={15} aria-hidden="true" /> Use my location
                  </button>
                  {coords && <span className="text-xs tabular-nums text-zinc-500">{coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}</span>}
                </div>
                {geoMsg && <p className="mt-1.5 text-xs text-zinc-500">{geoMsg}</p>}
              </div>

              {error && (
                <p role="alert" className="mt-5 rounded-xl border border-[#C93636]/30 bg-[#C93636]/[.06] p-3.5 text-sm text-[#C93636]">{error}</p>
              )}
            </div>
          </section>

          {/* RIGHT — JANSETU AI PANEL */}
          <aside aria-label="JanSetu AI interpretation" className="overflow-hidden rounded-2xl bg-[#0B0C0F] text-white shadow-[0_20px_60px_rgba(11,12,15,0.25)] lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-zinc-300">
                <Sparkles className="h-3.5 w-3.5 text-[#F5B400]" aria-hidden="true" />
                JANSETU AI
              </p>
              <p className="flex items-center gap-1.5 text-[11px] tracking-wide text-zinc-400">
                <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${signal ? "bg-emerald-400" : loading || phase === "processing" ? "animate-pulse bg-[#F5B400]" : phase === "recording" ? "animate-pulse bg-red-400" : "bg-emerald-400"}`} />
                {signal ? "SIGNAL READY" : loading || phase === "processing" ? "WORKING" : phase === "recording" ? "LISTENING" : "SYSTEM READY"}
              </p>
            </div>
            <div className="px-6 py-5">
              <ol className="space-y-0.5">
                {AI_PIPE.map((label, i) => {
                  const done = !!signal || (loading && i < stageIdx);
                  const active = !signal && loading && i === stageIdx;
                  const langLabel = i === 1 && signal ? detectedLang : i === 1 && loading ? (lang === "auto" ? "Detecting…" : (LANGUAGE_NAMES[lang] ?? lang)) : null;
                  return (
                    <li key={label} className="relative flex gap-3.5 pb-5 last:pb-0">
                      {i < AI_PIPE.length - 1 && (
                        <span aria-hidden="true" className={`absolute left-[11px] top-7 h-[calc(100%-24px)] w-px ${done ? "bg-[#F5B400]/70" : "bg-white/10"}`} />
                      )}
                      <span aria-hidden="true" className={`z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300 ${done ? "bg-[#F5B400] text-black" : active ? "animate-pulse bg-white text-black" : "border border-white/20 text-zinc-500"}`}>
                        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${done || active ? "text-white" : "text-zinc-500"}`}>
                          {label}
                          {langLabel ? <span className="ml-2 font-normal text-zinc-400">· {langLabel}</span> : null}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {done
                            ? i === 0 ? "Input received"
                              : i === 1 ? `${detectedLang ?? "Language"} detected`
                                : i === 2 ? "Gemini analysis complete"
                                  : i === 3 ? `${signal ? title(signal.category) : ""} signal created`
                                    : "Ready for civic intelligence"
                            : active ? ANALYSIS_STAGES[Math.min(stageIdx, ANALYSIS_STAGES.length - 1)] + "…"
                              : "Waiting"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {signal ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.05] p-5" role="status">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">CATEGORY</p>
                      <p className="mt-1 font-serif text-xl font-semibold text-[#F5B400]">{title(signal.category)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">SEVERITY</p>
                      <p className="mt-1 font-serif text-xl font-semibold">{title(signal.severity)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">LOCATION</p>
                      <p className="mt-1 font-semibold">{[signal.district, signal.state].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <div className="col-span-2 border-t border-white/10 pt-3">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">SUMMARY</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-300">“{signal.summary ?? submittedText.slice(0, 160)}”</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[13px] leading-relaxed text-zinc-400">
                  Describe your concern — JanSetu will identify the civic category, severity,
                  location and a structured summary.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ================= SUCCESS ================= */}
      {signal && (
        <section aria-labelledby="result-heading" className="mx-auto mt-10 max-w-[1360px] scroll-mt-24 px-5 md:px-8 min-[1440px]:px-10">
          <Reveal className="overflow-hidden rounded-2xl bg-[#0B0C0F] text-white shadow-[0_24px_80px_rgba(11,12,15,0.35)]">
            <div className="relative px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_20%_20%,rgba(245,180,0,0.12),transparent_70%)]" />
              <div className="relative">
                <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-[#F5B400]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#138A52]"><Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" /></span>
                  SIGNAL CREATED
                </p>
                <h2 id="result-heading" className="mt-4 font-serif text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-tight">
                  {title(signal.category)}
                </h2>
                <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-red-300">{title(signal.severity)} priority</p>
                <p className="mt-1 text-[15px] text-zinc-300">{[signal.district, signal.state].filter(Boolean).join(" · ")}</p>
                <p className="mt-5 max-w-2xl border-l-2 border-[#F5B400] pl-4 font-serif text-xl italic leading-relaxed text-zinc-200">
                  “{signal.summary ?? submittedText.slice(0, 160)}”
                </p>
                <ol className="mt-7 flex flex-wrap items-center gap-2 text-xs text-zinc-400" aria-label="How your words became a signal">
                  {["Citizen words", "AI understanding", "Civic signal"].map((s, i, a) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className={`rounded-full border px-3 py-1.5 ${i === a.length - 1 ? "border-[#F5B400]/50 text-[#F5B400]" : "border-white/15"}`}>{s}</span>
                      {i < a.length - 1 && <span aria-hidden="true" className="text-zinc-600">→</span>}
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-xs text-zinc-500">
                  Language: {LANGUAGE_NAMES[signal.language] ?? signal.language} · Signal #{signal.id}
                  {submittedAt ? <> · Submitted {submittedAt}</> : null} · AI confidence {signal.ai_confidence != null ? `${Math.round(signal.ai_confidence * 100)}%` : "—"}
                </p>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-zinc-500">
                  AI helps structure your concern. Civic metrics are calculated by JanSetu&apos;s deterministic data engine.{" "}
                  {signal.extractor === "gemini" ? "Live AI extraction via Google Gemini." : "Demo fallback — structured without a live AI call."}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/dashboard" className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F5B400]">
                    View Civic Intelligence
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                  {exploreId && (
                    <Link href={`/hotspots/${encodeURIComponent(exploreId)}`} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium transition-all duration-200 hover:border-white/60 hover:bg-white/10">
                      Explore this area →
                    </Link>
                  )}
                  <button onClick={resetAll} className="rounded-full border border-white/25 px-6 py-3 text-sm font-medium transition-all duration-200 hover:border-white/60 hover:bg-white/10">
                    Submit another signal
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* ================= TRUST STRIP ================= */}
      <section className="mx-auto max-w-[1360px] px-5 py-16 md:px-8 min-[1440px]:px-10 lg:py-20">
        <Reveal>
          <div className="rounded-2xl border border-zinc-200/80 bg-white px-6 py-8 shadow-[0_20px_60px_rgba(11,12,15,0.06)] sm:px-10">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-zinc-500">
              <ShieldCheck className="h-4 w-4 text-[#138A52]" aria-hidden="true" />
              WHY YOU CAN TRUST THIS
            </p>
            <ol className="mt-6 flex flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
              {["Your voice", "Structured signal", "Civic intelligence", "Development insight"].map((s, i, a) => (
                <li key={s} className="flex flex-1 items-center gap-4 md:gap-0">
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0B0C0F] font-serif text-base font-semibold text-[#F5B400]" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="text-[15px] font-semibold text-[#0B0C0F]">{s}</span>
                  </div>
                  {i < a.length - 1 && (
                    <span aria-hidden="true" className="mx-2 hidden h-px flex-1 bg-gradient-to-r from-[#F5B400]/70 to-zinc-200 md:mx-5 md:block" />
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-6 border-t border-zinc-100 pt-5 text-center text-sm leading-relaxed text-zinc-500">
              JanSetu uses Gemini to understand language. Deterministic systems calculate civic metrics and priorities.
              <br className="hidden sm:block" />
              <strong className="font-semibold text-zinc-800">AI interprets language. The data engine calculates the numbers.</strong>
            </p>
          </div>
        </Reveal>
      </section>

      {/* ================= LANGUAGES ================= */}
      <section className="border-y border-[#EDE6D8] bg-[#F7F6F3]">
        <div className="mx-auto max-w-[1360px] px-5 py-16 text-center md:px-8 min-[1440px]:px-10 lg:py-20">
          <Reveal>
            <p className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[0.24em] text-zinc-500">
              <Languages className="h-4 w-4 text-[#B87E00]" aria-hidden="true" />
              MULTILINGUAL BY DESIGN
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl font-serif text-[clamp(1.8rem,3.5vw,3rem)] font-semibold tracking-tight text-[#0B0C0F]">
              Speak in your language
            </h2>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5" role="list" aria-label="Supported languages">
              {LANGUAGE_CHIPS.map((l) => (
                <span key={l} role="listitem" className="cursor-default rounded-full border border-zinc-300/80 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#B87E00] hover:text-[#0B0C0F] hover:shadow-[0_10px_28px_rgba(184,126,0,0.18)]">
                  {l}
                </span>
              ))}
            </div>
            <p className="mx-auto mt-7 max-w-xl font-serif text-xl italic leading-relaxed text-zinc-600">
              “Your community does not need to speak in one language to be heard.”
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= EXAMPLES ================= */}
      <section className="mx-auto max-w-[1360px] px-5 py-16 md:px-8 min-[1440px]:px-10 lg:py-20">
        <Reveal>
          <p className="text-[11px] font-bold tracking-[0.24em] text-zinc-500">START FROM A REAL CONCERN</p>
          <h2 className="mt-3 font-serif text-[clamp(1.8rem,3.5vw,3rem)] font-semibold tracking-tight text-[#0B0C0F]">
            What can you tell JanSetu?
          </h2>
          <p className="mt-2 text-[15px] text-zinc-500">Tap any example — it will fill the form above, ready for you to edit.</p>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EXAMPLES.map((ex, i) => (
            <Reveal key={ex.category} delay={i * 70}>
              <button
                onClick={() => applyExample(ex.text)}
                className="group block w-full rounded-2xl border border-zinc-200/80 bg-white p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#F5B400]/60 hover:shadow-[0_20px_50px_rgba(184,126,0,0.15)]"
              >
                <span className="inline-block rounded-full bg-[#0B0C0F] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F5B400]">
                  {ex.category}
                </span>
                <span className="mt-3 block text-[16px] leading-relaxed text-zinc-700">“{ex.text}”</span>
                <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-[#B87E00]">
                  Use this example
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= AI TRANSPARENCY ================= */}
      <section className="bg-[#0B0C0F] text-white">
        <div className="mx-auto max-w-[1360px] px-5 py-16 md:px-8 min-[1440px]:px-10 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.24em] text-zinc-500">
                <span className="inline-block h-px w-8 bg-[#F5B400]" aria-hidden="true" />
                HOW JANSETU USES AI
              </p>
              <h2 className="mt-4 font-serif text-[clamp(1.8rem,3.5vw,2.9rem)] font-semibold leading-tight tracking-tight">
                Language is understood by AI. Numbers are calculated by engineering.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-zinc-400">
                Gemini understands human language and structures the concern. Deterministic
                systems then combine citizen signals with infrastructure, demographics and
                investment data to calculate civic intelligence.
              </p>
              <p className="mt-4 inline-block rounded-xl border border-[#F5B400]/40 bg-[#F5B400]/10 px-4 py-3 text-sm font-semibold text-[#F5B400]">
                Numerical priorities are NOT generated by the language model.
              </p>
            </Reveal>
            <Reveal delay={120}>
              <ol className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
                {[
                  { t: "Gemini", d: "Language understanding — category, severity, summary." },
                  { t: "Structured civic signal", d: "A validated, located record of one concern." },
                  { t: "Deterministic data engine", d: "Gaps, exposure, investment — computed, not guessed." },
                  { t: "Civic intelligence", d: "Hotspots, trends and priorities for decision-makers." },
                ].map((s, i, a) => (
                  <li key={s.t} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < a.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-9 h-[calc(100%-32px)] w-px bg-gradient-to-b from-[#F5B400]/70 to-white/10" />}
                    <span aria-hidden="true" className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-[#303A8C] text-white" : i === a.length - 1 ? "bg-[#F5B400] text-black" : "border border-white/25 text-zinc-300"}`}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-serif text-lg font-semibold">{s.t}</p>
                      <p className="mt-0.5 text-sm text-zinc-400">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </div>
      </section>
    </main>
  );
}
