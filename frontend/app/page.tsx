import Link from "next/link";

const STEPS: [string, string][] = [
  ["Gemini", "understands citizen input (text or voice transcript)"],
  ["Speech-to-Text", "transcribes voice submissions"],
  ["Deterministic engine", "calculates metrics — the AI never does arithmetic"],
  ["Database", "stores every signal with language and timestamps"],
  ["CivicPulse", "detects demand trends from real timestamps"],
  ["Recommendation layer", "explains evidence; the policymaker decides"],
  ["Simulator", "models hypothetical scenarios, labelled as estimates"],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-zinc-500">JanSetu — AI Civic Intelligence for India</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Citizen needs → evidence → action.</h1>
      <p className="mt-4 text-zinc-600">
        Submit a community need, or explore demand hotspots and evidence-backed recommendations.
        Demo data is synthetic.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/citizen" className="rounded-md bg-black px-4 py-2 text-white">Report a need</Link>
        <Link href="/dashboard" className="rounded-md border px-4 py-2">Policymaker dashboard</Link>
        <Link href="/simulate" className="rounded-md border px-4 py-2">Investment simulator</Link>
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">How JanSetu works</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {STEPS.map(([k, v]) => (
            <div key={k} className="flex gap-3 rounded-md border p-3">
              <dt className="w-44 shrink-0 font-semibold">{k}</dt>
              <dd className="text-zinc-600">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-md border p-4 text-sm">
          <p className="font-semibold">Data transparency</p>
          <p className="mt-1 text-zinc-600">
            Demo dataset: <span className="font-medium">synthetic demo data</span> — never presented
            as official statistics. Citizen submissions are observed data. Simulator outputs are
            prototype estimates, not government projections.
          </p>
          <p className="mt-3 font-semibold">Limitations</p>
          <ul className="mt-1 list-disc pl-5 text-zinc-600">
            <li>Prototype uses synthetic data where live datasets are unavailable.</li>
            <li>Investment simulation is hypothetical.</li>
            <li>Recommendations are decision-support, not government decisions.</li>
            <li>Infrastructure indicators depend on available datasets.</li>
            <li>Production deployment would require government data governance and validation.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
