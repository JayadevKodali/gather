import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "@fontsource/instrument-serif/400.css";
import "@fontsource-variable/inter";
import "./globals.css";
import { getActor } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { signOutAction } from "./actions/auth";
import { MOTION_BOOT_SCRIPT } from "@/components/Motion";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: { default: "Gather · Independent London venues", template: "%s · Gather" },
  description: "Describe your event in plain English and get a shortlist of independent London venues that genuinely fit.",
  // The Table mark. Green on light tab bars; the same art in cream when the browser is in dark mode.
  icons: {
    icon: [
      { url: "/brand/gather-mark.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: light)" },
      { url: "/brand/gather-mark-light.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: dark)" },
    ],
  },
};
export const viewport: Viewport = { themeColor: "#175340" };

const NAV = {
  planner: [["/plan", "Find a venue"], ["/enquiries", "Enquiries & quotes"], ["/bookings", "Bookings"]],
  owner: [["/owner", "Manage listings"], ["/enquiries", "Inbox"], ["/bookings", "Bookings"]],
  admin: [["/admin", "Pilot dashboard"]],
} as const;
const ROLE_LABEL = { planner: "Planner", owner: "Venue owner", admin: "Admin" } as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const demo = isDemo();
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Decide before first paint whether motion is welcome, so nothing jumps. */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <div className="top-chrome">
        {demo && (
          <div className="demo-ribbon">
            <div className="wrap">
              <span>Demo mode: synthetic venues, test payments and an email outbox. Nothing real is sent or charged.</span>
              <span className="row">
                <Link href="/dev/outbox">Email outbox</Link>
                <Link href="/login#demo">Switch account</Link>
              </span>
            </div>
          </div>
        )}
        <header className="site-header">
          <div className="wrap">
            <Link href={actor ? (actor.role === "admin" ? "/admin" : actor.role === "owner" ? "/owner" : "/plan") : "/"} className="brand" aria-label="Gather">
              {/* Green logo on light headers; cream copy of the same art over the homepage photo. */}
              <Image className="brand-logo brand-logo-default" src="/brand/gather-logo.png" alt="" width={141} height={40} unoptimized preload />
              <Image className="brand-logo brand-logo-light" src="/brand/gather-logo-light.png" alt="" width={141} height={40} unoptimized />
            </Link>
            <nav className="nav" aria-label="Main">
              {actor ? (
                <>
                  {NAV[actor.role].map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
                  <Link href="/about" className="nav-quiet">About</Link>
                  <span className="role-pill" title={actor.email}>{ROLE_LABEL[actor.role]} · {actor.fullName.split(" ")[0]}</span>
                  <form action={signOutAction} className="inline-form"><SubmitButton className="btn quiet small" pendingLabel="Signing out…">Sign out</SubmitButton></form>
                </>
              ) : (
                <>
                  <Link href="/about">About</Link>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/login">Sign in</Link>
                  <Link href="/signup" className="btn small">Create account</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        </div>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <div className="footer-brand">
              <Image className="footer-mark" src="/brand/gather-mark.png" alt="" width={28} height={28} unoptimized />
              <p className="mb-0">Independent London venues. Pilot preview: venues and people are fictional, payments are in test mode.</p>
            </div>
            <nav aria-label="Footer" className="footer-links"><Link href="/about">About</Link><Link href="/privacy">Privacy</Link></nav>
            <p className="footer-status mb-0">{demo ? "Demo mode: nothing real is sent or charged." : "Payments: Stripe test mode."}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
