"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth, type DemoRole } from "@/components/AuthContext";

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<DemoRole>("citizen");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const err = signup(name, email, password, confirm, role);
    if (err) {
      setError(err);
      return;
    }
    router.push(params.get("next") ?? (role === "policymaker" ? "/dashboard" : "/citizen"));
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-md border p-6">
        <p className="text-center text-sm font-semibold tracking-widest text-zinc-500">JANSETU</p>
        <h1 className="mt-2 text-center font-serif text-2xl font-semibold">Create your JanSetu account</h1>
        <p className="mt-1 text-center text-xs text-zinc-500">
          Demonstration account only — stored in this browser, replaceable by Firebase/Auth later.
        </p>
        <label className="mt-5 block text-sm font-medium" htmlFor="su-name">Full name</label>
        <input id="su-name" autoComplete="name" className="mt-1 w-full rounded-md border p-2"
          value={name} onChange={(e) => setName(e.target.value)} />
        <label className="mt-4 block text-sm font-medium" htmlFor="su-email">Email</label>
        <input id="su-email" type="email" autoComplete="email" className="mt-1 w-full rounded-md border p-2"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="mt-4 block text-sm font-medium" htmlFor="su-password">Password</label>
        <input id="su-password" type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border p-2"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="mt-4 block text-sm font-medium" htmlFor="su-confirm">Confirm password</label>
        <input id="su-confirm" type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border p-2"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Role</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="role" checked={role === "citizen"} onChange={() => setRole("citizen")} />
              Citizen
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="role" checked={role === "policymaker"} onChange={() => setRole("policymaker")} />
              Policymaker / Analyst
            </label>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <Button className="mt-5 w-full" onClick={submit}>Create account →</Button>
        <p className="mt-4 text-center text-sm">
          <Link href="/signin" className="underline">Already have an account? Sign in</Link>
        </p>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-6 py-16"><p className="text-zinc-600">Loading…</p></main>}>
      <SignUpForm />
    </Suspense>
  );
}
