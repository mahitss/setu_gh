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
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm">
        <p className="font-bold tracking-widest">JANSETU</p>
        <p className="mt-1 text-zinc-500">AI Civic Intelligence for India · Synthetic demonstration dataset</p>
        <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-1" aria-label="Footer">
          <Link className="hover:underline" href="/citizen">Citizen</Link>
          <Link className="hover:underline" href="/dashboard">Dashboard</Link>
          <Link className="hover:underline" href="/hotspots">Hotspots</Link>
          <Link className="hover:underline" href="/simulator">Simulator</Link>
          <Link className="hover:underline" href="/signin">Sign in</Link>
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
        <AuthProvider>
          <Navbar />
          <div className="flex-1 flex flex-col">{children}</div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
