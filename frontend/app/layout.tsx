import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthContext";
import Navbar from "@/components/Navbar";
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

function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto max-w-7xl px-6 md:px-10 py-8 text-sm">
        <p className="font-bold tracking-widest">JANSETU</p>
        <p className="mt-1 text-zinc-500">AI Civic Intelligence for India</p>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <nav aria-label="Product">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">Product</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="hover:underline" href="/citizen">Citizen Voice</Link></li>
              <li><Link className="hover:underline" href="/dashboard">Civic Intelligence</Link></li>
              <li><Link className="hover:underline" href="/hotspots">Hotspots</Link></li>
              <li><Link className="hover:underline" href="/simulator">Simulator</Link></li>
            </ul>
          </nav>
          <nav aria-label="Resources">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">Resources</p>
            <ul className="mt-2 space-y-1">
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/architecture.md">Architecture</a></li>
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/demo-script.md">Demo</a></li>
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh">GitHub</a></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="text-xs font-semibold tracking-wide text-zinc-500">Account</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="hover:underline" href="/signin">Sign in</Link></li>
              <li><Link className="hover:underline" href="/signup">Create account</Link></li>
            </ul>
          </nav>
          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-500">Technology</p>
            <ul className="mt-2 space-y-1 text-zinc-600">
              <li>Google Gemini</li>
              <li>Deterministic backend engines</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 border-t pt-4 text-xs text-zinc-500">
          Disclosure: Synthetic demonstration dataset. Values shown are prototype data and are not official statistics.
        </p>
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
        <AuthProvider>
          <Navbar />
          <div className="flex-1 flex flex-col">{children}</div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
