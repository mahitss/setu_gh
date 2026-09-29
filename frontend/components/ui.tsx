import Link from "next/link";

export function PageHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm font-semibold tracking-widest text-[var(--js-muted)]">{eyebrow}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 text-sm text-[var(--js-muted)]">{sub}</p>}
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--js-surface)] p-6">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold tracking-widest text-[var(--js-muted)]">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#F5A800]" />
        {label.toUpperCase()}
      </p>
      <p className="mt-1 text-[36px] font-semibold tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-[var(--js-muted)]">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "rising" | "stable" | "declining" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "rising"
      ? "bg-[#C93636]/10 text-[#C93636] dark:bg-[#F87171]/15 dark:text-[#F87171]"
      : tone === "declining"
        ? "bg-[#138A52]/10 text-[#138A52] dark:bg-[#34D399]/15 dark:text-[#34D399]"
        : "bg-[var(--js-track)] text-[var(--js-muted)]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--js-surface)] p-6 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--js-muted)]">{body}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--js-track)]">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--js-track)] ${className}`} />;
}

export function Breadcrumb({ trail }: { trail: [string, string?][] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--js-muted)]">
      {trail.map(([label, href], i) => (
        <span key={label}>
          {i > 0 && " → "}
          {href ? <Link href={href} className="underline underline-offset-2 hover:text-[var(--foreground)]">{label}</Link> : <span>{label}</span>}
        </span>
      ))}
    </nav>
  );
}
