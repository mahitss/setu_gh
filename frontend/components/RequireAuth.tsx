"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const path = usePathname();

  if (user === undefined) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-zinc-600">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-md border p-6 text-center">
          <p className="text-sm font-semibold tracking-widest text-zinc-500">JANSETU</p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in required</h1>
          <p className="mt-2 text-sm text-zinc-600">
            This policymaker area needs a demo account. The citizen reporting page stays public.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link href={`/signin?next=${encodeURIComponent(path)}`} className="rounded-md bg-black px-4 py-2 text-sm text-white">
              Sign in →
            </Link>
            <Link href={`/signup?next=${encodeURIComponent(path)}`} className="rounded-md border px-4 py-2 text-sm">
              Create account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
