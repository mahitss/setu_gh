"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { STATE_DISTRICTS } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const title = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function CitizenPage() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("auto");
  const [voiceLang, setVoiceLang] = useState("hi-IN");
  const [state, setState] = useState("Uttar Pradesh");
  const [district, setDistrict] = useState("Lucknow");
  const [locality, setLocality] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => transcribe(new Blob(chunksRef.current, { type: rec.mimeType }));
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone unavailable. Please allow access or type your request.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", blob, "request.webm");
      form.append("language_code", voiceLang);
      const res = await fetch(`${API_URL}/api/v1/citizen/voice`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? "Voice transcription failed. Please type your request.");
      setText(data.transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice transcription failed. Please type your request.");
    } finally {
      setTranscribing(false);
    }
  }

  async function submit() {
    setError(null);
    setSignal(null);
    if (!text.trim()) {
      setError("Please describe the issue before submitting.");
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${API_URL}/api/v1/citizen/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          language: lang,
          state,
          district,
          locality: locality.trim() || null,
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
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("The request timed out. Please check your connection and try again.");
      } else if (e instanceof TypeError) {
        setError("Cannot reach the server. Please make sure it is running and try again.");
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Tell us what your community needs.</h1>
      <p className="mt-2 text-zinc-600">
        Describe the issue in your own words, in any language.
      </p>

      <label className="mt-8 block text-sm font-medium" htmlFor="issue">
        Describe the issue…
      </label>
      <div className="mt-2 flex items-center gap-2 text-sm">
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
      <textarea
        id="issue"
        className="mt-2 w-full rounded-md border p-3"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. हमारे गांव में अस्पताल बहुत दूर है…"
        disabled={loading}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm" htmlFor="voice-lang">Voice language</label>
        <select id="voice-lang" className="rounded-md border p-1.5 text-sm" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} disabled={loading || recording || transcribing}>
          <option value="hi-IN">Hindi</option>
          <option value="en-IN">English (India)</option>
          <option value="bn-IN">Bengali</option>
          <option value="mr-IN">Marathi</option>
          <option value="kn-IN">Kannada</option>
        </select>
        {!recording ? (
          <button
            className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
            onClick={startRecording}
            disabled={loading || transcribing}
          >
            🎤 Record voice instead
          </button>
        ) : (
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm text-white" onClick={stopRecording}>
            ⏹ Stop recording…
          </button>
        )}
        {transcribing && <span className="text-sm text-zinc-500">Transcribing…</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="state">State</label>
          <select
            id="state"
            className="mt-2 w-full rounded-md border p-2"
            value={state}
            disabled={loading}
            onChange={(e) => {
              setState(e.target.value);
              setDistrict(STATE_DISTRICTS[e.target.value][0]);
            }}
          >
            {Object.keys(STATE_DISTRICTS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="district">District</label>
          <select
            id="district"
            className="mt-2 w-full rounded-md border p-2"
            value={district}
            disabled={loading}
            onChange={(e) => setDistrict(e.target.value)}
          >
            {STATE_DISTRICTS[state].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="locality">
        Locality <span className="font-normal text-zinc-500">(optional)</span>
      </label>
      <input
        id="locality"
        className="mt-2 w-full rounded-md border p-2"
        value={locality}
        onChange={(e) => setLocality(e.target.value)}
        placeholder="Village / ward"
        disabled={loading}
      />

      <Button
        className="mt-6"
        onClick={submit}
        disabled={loading}
      >
        {loading ? "Submitting…" : "Submit Request"}
      </Button>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}

      {signal && (
        <section className="mt-6 rounded-md border p-5">
          <h2 className="text-xl font-semibold">Your request has been understood.</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2"><dt className="w-24 font-medium">Category</dt><dd>{title(signal.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 font-medium">Issue</dt><dd>{signal.summary ?? title(signal.sub_category ?? signal.category)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 font-medium">Severity</dt><dd>{title(signal.severity)}</dd></div>
            <div className="flex gap-2"><dt className="w-24 font-medium">Location</dt><dd>{[signal.district, signal.state].filter(Boolean).join(", ")}</dd></div>
            <div className="flex gap-2"><dt className="w-24 font-medium">Language</dt><dd>{LANGUAGE_NAMES[signal.language] ?? signal.language}</dd></div>
          </dl>
          {signal.extractor && signal.extractor !== "gemini" && (
            <p className="mt-3 text-xs text-zinc-500">Demo fallback — structured without a live AI call (live Gemini unavailable).</p>
          )}
        </section>
      )}
    </main>
  );
}
