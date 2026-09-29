import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthContext";
import { ThemeProvider } from "@/components/ThemeContext";
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
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--js-surface)] text-sm">
      <div className="mx-auto max-w-[1360px] px-6 md:px-10 py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-bold tracking-widest">JANSETU<span className="text-[var(--js-accent-strong)]">.</span></p>
            <p className="mt-1 text-xs text-[var(--js-muted)]">AI Civic Intelligence for India</p>
          </div>
          <nav aria-label="Product" className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <Link className="text-[var(--js-muted)] hover:underline" href="/citizen">Citizen Voice</Link>
            <Link className="text-[var(--js-muted)] hover:underline" href="/dashboard">Civic Intelligence</Link>
            <Link className="text-[var(--js-muted)] hover:underline" href="/hotspots">Hotspots</Link>
            <Link className="text-[var(--js-muted)] hover:underline" href="/simulator">Simulator</Link>
          </nav>
          <p className="text-xs text-[var(--js-muted)]">Google Gemini · Google Cloud</p>
        </div>
        <p className="mt-5 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--js-faint)]">
          Synthetic demonstration dataset — prototype data, not official statistics. © JanSetu
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Pre-paint theme restore: prevents flash of the wrong theme. Runs
            before React hydrates; React never renders theme-dependent markup
            during SSR, so this cannot cause a hydration mismatch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('jansetu-theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            <div className="flex-1 flex flex-col">{children}</div>
            <SiteFooter />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
