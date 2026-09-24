import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium text-zinc-500">JanSetu — AI Civic Intelligence for India</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Citizen needs → evidence → action.</h1>
      <p className="mt-4 text-zinc-600">
        Submit a community need, or explore demand hotspots and evidence-backed recommendations.
        Demo data is synthetic.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/citizen" className="rounded-md bg-black px-4 py-2 text-white">Report a need</Link>
        <Link href="/dashboard" className="rounded-md border px-4 py-2">Policymaker dashboard</Link>
        <Link href="/simulate" className="rounded-md border px-4 py-2">Investment simulator</Link>
      </div>
    </main>
  );
}
