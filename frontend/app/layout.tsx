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
      <div className="mx-auto max-w-[1360px] px-6 md:px-10 py-8">
        <p className="font-bold tracking-widest">JANSETU</p>
        <p className="mt-1 text-[var(--js-muted)]">AI Civic Intelligence for India</p>
        <p className="mt-1 text-[var(--js-muted)]">Built to help communities turn lived experience into structured civic intelligence.</p>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <nav aria-label="Product">
            <p className="text-xs font-semibold tracking-wide text-[var(--js-muted)]">Product</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="hover:underline" href="/citizen">Citizen Voice</Link></li>
              <li><Link className="hover:underline" href="/dashboard">Civic Intelligence</Link></li>
              <li><Link className="hover:underline" href="/hotspots">Hotspots</Link></li>
              <li><Link className="hover:underline" href="/simulator">Simulator</Link></li>
            </ul>
          </nav>
          <nav aria-label="Resources">
            <p className="text-xs font-semibold tracking-wide text-[var(--js-muted)]">Resources</p>
            <ul className="mt-2 space-y-1">
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/architecture.md">Architecture</a></li>
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh/blob/master/docs/demo-script.md">Demo</a></li>
              <li><a className="hover:underline" href="https://github.com/mahitss/setu_gh">GitHub</a></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="text-xs font-semibold tracking-wide text-[var(--js-muted)]">Account</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="hover:underline" href="/signin">Sign in</Link></li>
              <li><Link className="hover:underline" href="/signup">Create account</Link></li>
            </ul>
          </nav>
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--js-muted)]">Technology</p>
            <ul className="mt-2 space-y-1 text-[var(--js-muted)]">
              <li>Google Gemini</li>
              <li>Google Cloud</li>
              <li>Deterministic backend engines</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--js-muted)]">
          Disclosure: Synthetic demonstration dataset. Values shown are prototype data and are not official statistics.
        </p>
        <p className="mt-2 text-xs text-[var(--js-faint)]">© JanSetu</p>
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
