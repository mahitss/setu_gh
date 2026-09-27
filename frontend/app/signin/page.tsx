"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthContext";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const err = signin(email, password);
    if (err) {
      setError(err);
      return;
    }
    router.push(params.get("next") ?? "/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 md:px-8 min-[1440px]:px-10 py-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="hidden rounded-xl border border-[#E5E7EB] bg-zinc-950 p-8 text-white lg:block">
          <p className="text-sm font-bold tracking-widest">JANSETU</p>
          <p className="mt-4 font-serif text-3xl font-semibold leading-tight">Civic intelligence,<br />built on citizen voices.</p>
          <p className="mt-3 max-w-sm text-sm text-zinc-300">
            Sign in to explore demand hotspots, evidence and investment scenarios.
          </p>
        </div>
        <div className="rounded-md border p-6">
        <p className="text-center text-sm font-semibold tracking-widest text-zinc-500">JANSETU</p>
        <h1 className="mt-2 text-center text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-center text-sm text-zinc-600">Sign in to continue to JanSetu.</p>
        <p className="mt-2 rounded bg-zinc-50 p-2 text-center text-xs text-zinc-500">
          Demonstration sign-in only — no real authentication provider is configured yet.
        </p>
        <label className="mt-5 block text-sm font-medium" htmlFor="si-email">Email</label>
        <input id="si-email" type="email" autoComplete="email" className="mt-1 w-full rounded-md border p-2"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="mt-4 block text-sm font-medium" htmlFor="si-password">Password</label>
        <input id="si-password" type="password" autoComplete="current-password" className="mt-1 w-full rounded-md border p-2"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        {error && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <Button className="mt-5 w-full" onClick={submit}>Sign in →</Button>
        <button disabled title="Google sign-in is not configured in this demo"
          className="mt-2 w-full cursor-not-allowed rounded-md border px-4 py-2 text-sm text-zinc-400">
          Continue with Google (not configured)
        </button>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-zinc-400" title="Password reset is not available in this demo">Forgot password?</span>
          <Link href="/signup" className="underline">Don&apos;t have an account? Create one</Link>
        </div>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-6 py-16"><p className="text-zinc-600">Loading…</p></main>}>
      <SignInForm />
    </Suspense>
  );
}
