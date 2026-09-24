export default function HotspotPage({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Hotspot {params.id}</h1>
      <p className="mt-2 text-zinc-600">Detailed evidence lands in Phase 9.</p>
    </main>
  );
}
