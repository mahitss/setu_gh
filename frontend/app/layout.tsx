import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JanSetu — AI Civic Intelligence for India",
  description: "Citizen signals to evidence-backed development priorities.",
};

function SiteNav() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="leading-tight">
          <span className="block text-base font-bold tracking-widest">JANSETU</span>
          <span className="block text-[11px] text-zinc-500">Civic Intelligence for India</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label="Primary">
          <Link className="hover:underline" href="/">Overview</Link>
          <Link className="hover:underline" href="/citizen">Citizen Voice</Link>
          <Link className="hover:underline" href="/dashboard">Civic Intelligence</Link>
          <Link className="hover:underline" href="/dashboard">Hotspots</Link>
          <Link className="hover:underline" href="/simulate">Simulator</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="rounded border px-2 py-0.5 text-[11px] text-zinc-500">Demo Mode</span>
          <Link href="/citizen" className="rounded-md bg-black px-4 py-2 text-sm text-white">Report a Need</Link>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm">
        <p className="font-bold tracking-widest">JANSETU</p>
        <p className="mt-1 text-zinc-500">AI Civic Intelligence for India · Synthetic demonstration dataset</p>
        <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-1" aria-label="Footer">
          <Link className="hover:underline" href="/citizen">Citizen</Link>
          <Link className="hover:underline" href="/dashboard">Dashboard</Link>
          <Link className="hover:underline" href="/dashboard">Hotspots</Link>
          <Link className="hover:underline" href="/simulate">Simulator</Link>
          <a className="hover:underline" href="https://github.com/mahitss/setu_gh">GitHub</a>
          <a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/architecture.md">Architecture</a>
          <a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/demo-script.md">Demo</a>
        </nav>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav />
        <div className="flex-1 flex flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
