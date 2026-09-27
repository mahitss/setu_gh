import Link from "next/link";

export function PageHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold tracking-widest text-zinc-500">{eyebrow}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#E7E3DB] bg-white p-6">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-widest text-zinc-500">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#D99A18]" />
        {label.toUpperCase()}
      </p>
      <p className="mt-1 text-[36px] font-semibold tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "rising" | "stable" | "declining" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "rising"
      ? "bg-red-50 text-red-700"
      : tone === "declining"
        ? "bg-green-50 text-green-700"
        : "bg-zinc-100 text-zinc-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-md border p-6 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">{body}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-zinc-50">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 ${className}`} />;
}

export function Breadcrumb({ trail }: { trail: [string, string?][] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      {trail.map(([label, href], i) => (
        <span key={label}>
          {i > 0 && " → "}
          {href ? <Link href={href} className="underline hover:text-black">{label}</Link> : <span>{label}</span>}
        </span>
      ))}
    </nav>
  );
}
