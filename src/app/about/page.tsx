import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HERO_IMAGES } from "@/lib/venue-images";

export const metadata: Metadata = { title: "About & how it works", description: "How Gather matches event planners with independent London venues, and how venue owners take bookings." };

const PLANNER_STEPS: [string, string][] = [
  ["Describe your event", "Write it the way you’d brief a colleague: date, guests, area, budget and anything you can’t do without. Gather reads it, shows you what it understood, and asks if something important is missing. Nothing is searched until you confirm."],
  ["Compare venues", "You see up to five venues that are free on your date, hold your numbers in your layout and have your essentials. Each card says why it fits, with the price worked out for your event."],
  ["Request a quote", "Send an enquiry to a venue with any extras you’d like. The venue replies in Gather and sends an itemised quote: total, deposit, remaining balance and when it’s due, and the cancellation terms."],
  ["Book", "Pay the deposit to confirm the booking and block the date. Pay the remaining balance later from My bookings. Everything stays in one place for both of you."],
];

const OWNER_STEPS: [string, string][] = [
  ["List a space", "One listing per bookable space: capacity for each layout, how you charge, what’s included and what’s extra, access notes and photos. Save it as a draft until it’s ready, then publish."],
  ["Set availability", "Open the dates you can host in your calendar. Planners only ever see venues on dates you’ve opened, so nobody asks for a day you can’t do."],
  ["Respond to enquiries", "Each enquiry arrives with the planner’s confirmed brief. Reply, ask a question, or send an itemised quote with your deposit, balance due date and cancellation cutoff."],
  ["Manage bookings", "When the planner pays the deposit, the booking is confirmed and the date is blocked. You see what’s been paid, get an email when it’s paid in full, and can cancel from the booking if you must."],
];

const FAQ: [string, React.ReactNode][] = [
  ["What does the deposit do?", "Paying the deposit confirms the booking and blocks the date for you. The venue sets the deposit in its quote, so you see it before you pay."],
  ["How is the remaining balance paid?", "Through Gather, from My bookings → Pay remaining balance, by the due date shown on the quote and the booking. The booking shows “Paid in full” once the payment is confirmed. If the deposit covers the whole amount, there’s nothing more to pay."],
  ["Where are the cancellation terms?", "On every quote, before you pay, and saved with your booking. If the venue later changes its terms, your booking keeps the ones you agreed. Cancel from the booking page: Gather shows the exact refund before you confirm."],
  ["What if the venue cancels?", "You get back everything you paid through Gather: the deposit and any balance."],
  ["Is this real money?", "Not yet. This is a test build: every venue is fictional and payments run in Stripe’s test mode, so no real money moves."],
];

/** Small line icons for the two step tracks (decorative; each step has its own heading). */
const ICONS: Record<string, React.ReactNode> = {
  write: <path d="M5 19h4l10-10-4-4L5 15v4zM14 6l4 4" />,
  compare: <><rect x="3.5" y="5" width="7" height="14" rx="1.5" /><rect x="13.5" y="5" width="7" height="14" rx="1.5" /></>,
  quote: <><path d="M6 3.5h9l3 3V20.5H6z" /><path d="M9 10h6M9 13.5h6M9 17h4" /></>,
  book: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5v4M16 3.5v4M9 15l2 2 4-4" /></>,
  list: <><path d="M4 10.5L12 4l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5v4M16 3.5v4" /></>,
  reply: <><path d="M4 5.5h16v10H9l-5 4z" /></>,
  manage: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
};
const PLANNER_ICONS = ["write", "compare", "quote", "book"];
const OWNER_ICONS = ["list", "calendar", "reply", "manage"];

function StepTrack({ id, title, steps, icons, actions }: { id: string; title: string; steps: [string, string][]; icons: string[]; actions: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel track">
      <h2 id={id}>{title}</h2>
      <ol className="track-steps">
        {steps.map(([t, d], i) => (
          <li key={t}>
            <span className="track-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{ICONS[icons[i]]}</svg>
            </span>
            <div><h3><span className="sr-only">Step {i + 1}: </span>{t}</h3><p>{d}</p></div>
          </li>
        ))}
      </ol>
      <div className="actions">{actions}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="wrap info-page">
      <header className="about-hero">
        <div className="about-hero-copy">
          <h1>About Gather</h1>
          <p className="lead">Gather helps people find and book independent event spaces in London. Planners describe their event once and get a short list of venues that genuinely fit. Venue owners get enquiries that already match their space, dates and prices.</p>
          <p className="notice info mb-0">This is a test build for a pilot. Every venue, person and price on it is fictional, and payments use Stripe’s test mode: no real money moves.</p>
        </div>
        <figure className="about-hero-photo photo-3x2">
          <Image src={HERO_IMAGES.glasshouseDaylight.src} alt={HERO_IMAGES.glasshouseDaylight.alt} fill sizes="(max-width: 860px) 100vw, 45vw" preload />
        </figure>
      </header>

      <div className="tracks">
        <StepTrack id="planners" title="For event planners" steps={PLANNER_STEPS} icons={PLANNER_ICONS}
          actions={<><Link className="btn" href="/plan">Describe your event</Link><Link className="btn quiet" href="/signup">Create a planner account</Link></>} />
        <StepTrack id="owners" title="For venue owners" steps={OWNER_STEPS} icons={OWNER_ICONS}
          actions={<><Link className="btn" href="/signup?role=owner">List your space</Link><Link className="btn quiet" href="/owner">Manage listings</Link></>} />
      </div>

      <div className="about-lower">
        <section aria-labelledby="faq" className="faq">
          <h2 id="faq">Questions about paying and cancelling</h2>
          <div className="accordion">
            {FAQ.map(([q, a]) => (
              <details key={q} className="disclosure">
                <summary>{q}</summary>
                <div className="inner"><p className="mb-0">{a}</p></div>
              </details>
            ))}
          </div>
        </section>
        <section aria-labelledby="who" className="about-who">
          <h2 id="who">Who we are</h2>
          <p>Gather is a marketplace that connects event planners with independent venues in London. For the personal information described in our <Link href="/privacy">privacy notice</Link>, Gather is the data controller.</p>
          <p className="small muted mb-0">To be confirmed before launch: the legal name and registered address of the company running Gather, and the contact address for privacy questions. These will be published here before Gather opens to the public.</p>
        </section>
      </div>
    </div>
  );
}
