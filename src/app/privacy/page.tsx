import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy", description: "What Gather collects, why, who we share it with, how long we keep it, your rights and how to contact us." };

/**
 * The privacy notice, in plain English for ordinary visitors and laid out like a normal UK privacy notice.
 * Wording only: every fact matches what the build does (see docs/LAUNCH_TASKS.md for the items still to
 * confirm before launch). Keep id="ai": the brief page links to /privacy#ai.
 */

/** Items not yet confirmed are marked so nobody mistakes them for final commitments. */
function ToConfirm({ children }: { children: React.ReactNode }) {
  return <span className="to-confirm"><strong>Still to be confirmed before launch:</strong> {children}</span>;
}

const SECTIONS: [string, string][] = [
  ["responsible", "Who is responsible"],
  ["collect", "What we collect"],
  ["why", "Why we use it"],
  ["ai", "How AI reads your brief"],
  ["share", "Who we share it with"],
  ["keep", "How long we keep it"],
  ["cookies", "Cookies"],
  ["rights", "Your rights"],
  ["contact", "How to contact us"],
];

const COLLECT: [string, string][] = [
  ["Your account", "Your name, email address, whether you plan events or own a venue, and your password. We store the password only in a scrambled form that we can’t turn back into your password."],
  ["Your event brief", "What you write, the details Gather picks out of it, your answers to any follow-up question, and the searches you run."],
  ["Enquiries, messages and quotes", "What a planner and a venue send each other in Gather. Only the two of them can read the messages."],
  ["Bookings and payments", "Amounts, dates, the booking’s status, the cancellation terms you agreed, refunds, and Stripe’s reference for each payment. We never see or keep your card details."],
  ["Venue listings and photos", "For venue owners: the details of your space and the photos you upload. We remove location and camera details from photos when you upload them."],
  ["Emails we send you", "A record of each email: the address, subject, link and text, so we can check it was delivered."],
  ["How the pilot is used", "Simple counts such as “brief submitted” or “booking confirmed”, linked to your account. Never the words of your briefs or messages."],
  ["Sign-in protection", "How many times a sign-in failed for an email address, and the links we send to confirm your email or reset your password (kept only in a scrambled form)."],
  ["Visit details", "What our website host records when you visit: your IP address, your browser and the pages you asked for."],
];

const WHY: [string, string, string][] = [
  ["To run your account and show you your own briefs, enquiries and bookings", "Your account, brief, enquiries and messages", "We need it to provide the service you signed up for (contract)"],
  ["To find venues that fit, and show a venue your brief when you enquire", "Your event brief", "Contract"],
  ["To confirm bookings, take payments, handle cancellations and refunds, and keep the records the law requires", "Bookings and payments", "Contract, and a legal duty to keep accounting and tax records"],
  ["To show your space to planners", "Venue listings and photos", "Contract"],
  ["To check booking emails arrived and sort out problems", "Emails we send you", "Our legitimate interest in running a reliable service"],
  ["To see how the pilot is doing (sign-ups, matches, bookings)", "How the pilot is used", "Our legitimate interest in measuring and improving the service"],
  ["To slow down password guessing, and let you confirm your email or reset your password", "Sign-in protection", "Our legitimate interest in keeping accounts secure"],
  ["To keep the site secure and fix faults", "Visit details", "Our legitimate interest in security"],
];

const PROVIDERS: [string, string][] = [
  ["Vercel", "Hosts the website and runs the app. It sees requests to the site and keeps short-lived server logs."],
  ["Supabase", "Stores the database (accounts, briefs, enquiries, bookings) and venue photos."],
  ["OpenAI", "Reads the words of event briefs to pick out the details (see “How AI reads your brief”)."],
  ["Stripe", "Takes deposit and balance payments and makes refunds. Your card details go straight to Stripe; Gather never sees or keeps them."],
  ["Resend", "Sends Gather’s emails (booking confirmations, quotes, replies)."],
];

const RETENTION: [string, string][] = [
  ["Bookings, quotes, payments and refunds", "6 years after the end of the financial year they belong to, because UK company and tax law requires these records."],
  ["Accounts", "While your account is open. We delete closed accounts, and accounts nobody has signed in to for 2 years, apart from the records above that we must keep."],
  ["Briefs, enquiries and messages that didn’t lead to a booking", "12 months after the last activity."],
  ["Venue photos", "Until you remove them or delete the listing. The files are deleted straight away."],
  ["Record of emails sent", "90 days."],
  ["Counts of how the pilot is used", "24 months, then deleted."],
  ["Staying signed in", "14 days, or until you sign out or change your password."],
  ["Failed sign-in counts", "Cleared when you sign in successfully, or after 15 minutes."],
  ["Email-confirmation links", "24 hours, and each link works only once."],
  ["Password-reset links", "30 minutes, and each link works only once."],
  ["Copies kept by OpenAI", "Up to 30 days in OpenAI’s logs for spotting misuse (see “How AI reads your brief”)."],
];

export default function PrivacyPage() {
  return (
    <div className="wrap privacy-page">
      <header className="info-head">
        <h1>Privacy notice</h1>
        <p className="lead">What Gather collects, why, who we share it with, how long we keep it, your rights and how to contact us. Last updated 15 November 2026.</p>
        <p className="notice info mb-0">Gather is a test build for a pilot. Please use made-up details: every venue and person on it is fictional, and payments are in test mode, so no real money moves.</p>
      </header>

      <div className="privacy-layout">
        <nav className="privacy-toc" aria-label="On this page">
          <p className="toc-title">On this page</p>
          <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
        </nav>

        <div className="privacy-body">
          <section aria-labelledby="responsible">
            <h2 id="responsible">Who is responsible</h2>
            <p>Gather is responsible for the personal information described here (in data-protection terms, Gather is the “controller”). There’s more about who we are on our <Link href="/about#who">About page</Link>.</p>
          </section>

          <section aria-labelledby="collect">
            <h2 id="collect">What we collect</h2>
            <dl className="plain-list">
              {COLLECT.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
            </dl>
            <p>We don’t sell your information, we don’t use it for advertising, and we don’t ask for sensitive information such as health details.</p>
            <p>When you choose a password, Gather checks it against lists of common and leaked passwords. For the leaked-password check, only the first five characters of a scrambled version of your password are sent to the Have I Been Pwned service, so it never learns your password.</p>
          </section>

          <section aria-labelledby="why">
            <h2 id="why">Why we use it</h2>
            <p>The law asks us to say why we use each kind of information, and the legal reason that allows it.</p>
            <div className="table-scroll stack-on-mobile" role="region" aria-label="Why we use your information" tabIndex={0}>
              <table>
                <thead><tr><th>What for</th><th>Which information</th><th>Legal reason</th></tr></thead>
                <tbody>{WHY.map(([a, b, c]) => <tr key={a}><td data-label="What for">{a}</td><td data-label="Which information">{b}</td><td data-label="Legal reason">{c}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="ai">
            <h2 id="ai">How AI reads your brief</h2>
            <p>When you write a brief, its words are sent to OpenAI, which picks out details such as the date, number of guests, area, budget and must-have facilities. You then see exactly what was understood and can correct it before anything is searched. The AI doesn’t choose or rank venues: Gather’s own rules check every requirement against the venues’ listings.</p>
            <ul>
              <li>OpenAI is instructed not to keep your brief, and it doesn’t use what we send it to train its models.</li>
              <li>OpenAI may keep requests for up to 30 days in its logs for spotting misuse, then deletes them unless the law requires otherwise.</li>
              <li>That’s why the brief box asks you to <strong>leave out names, phone numbers and other personal details</strong>. Describe the event, not the people.</li>
            </ul>
          </section>

          <section aria-labelledby="share">
            <h2 id="share">Who we share it with</h2>
            <p>Inside Gather, a planner’s confirmed brief and messages are shared only with the venue they enquire with, and the venue’s replies and quotes only with that planner. Gather’s small admin team can see accounts, listings and bookings to run the service, but not private messages.</p>
            <p>These companies handle information for us, under contracts that only let them use it to provide their service to us:</p>
            <dl className="plain-list">
              {PROVIDERS.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
            </dl>
            <p><ToConfirm>which countries each company stores information in, and the protections for any transfer outside the UK (such as the UK’s standard transfer agreement in each company’s data-processing terms).</ToConfirm></p>
          </section>

          <section aria-labelledby="keep">
            <h2 id="keep">How long we keep it</h2>
            <p>We keep information only as long as we need it for the reasons above. These periods apply from public launch, when automatic deletion will be switched on. During the test pilot, the information is made up.</p>
            <dl className="plain-list two-col">
              {RETENTION.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
            </dl>
          </section>

          <section aria-labelledby="cookies">
            <h2 id="cookies">Cookies</h2>
            <p>Gather sets two small cookies, both needed for the site to work, so they don’t need your consent. One keeps you signed in. The other remembers the email address you’re confirming, so the “Check your email” page can show it and send a new link; it lasts at most 24 hours and is removed once your address is confirmed. We don’t use advertising or tracking cookies.</p>
          </section>

          <section aria-labelledby="rights">
            <h2 id="rights">Your rights</h2>
            <p>You can ask to see the information we hold about you, to correct it, to delete it, to limit or object to how we use it, or to receive a copy to take elsewhere. Some records, such as payment records, we must keep for the period above even if you ask us to delete them; we’ll tell you if that applies.</p>
          </section>

          <section aria-labelledby="contact">
            <h2 id="contact">How to contact us</h2>
            <p>To make a request or ask a privacy question, write to the privacy contact address. We’ll reply within one month. <ToConfirm>the company’s legal name, registered address and privacy contact address, which will be published on the About page before Gather opens to the public.</ToConfirm></p>
            <p className="mb-0">If you’re unhappy with how we’ve handled your information, you can complain to the Information Commissioner’s Office (ico.org.uk).</p>
          </section>
        </div>
      </div>
    </div>
  );
}
