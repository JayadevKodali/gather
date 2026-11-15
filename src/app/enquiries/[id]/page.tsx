import type { Metadata } from "next";
import Link from "next/link";
import { BookingPanel } from "@/components/BookingPanel";
import { balanceDueDate } from "@/lib/payments/policy";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { getDb } from "@/lib/db";
import { EVENT_TYPE_LABELS, FACILITY_LABELS, LAYOUT_LABELS, type FacilityCode } from "@/lib/domain";
import { dateTime, formatPounds, longDate, poundsInput } from "@/lib/format";
import { enquiryStatusLabel, getEnquiryThread, quoteExceedsCap, suggestedQuoteLines, termsForViewer } from "@/lib/services/enquiries";
import { declineEnquiryAction, declineQuoteAction, messageAction, payDepositAction, sendQuoteAction } from "../../actions/enquiry";
import { orNotFound } from "@/lib/services/page-guard";
import { InfoTip } from "@/components/InfoTip";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { BriefStrip } from "@/components/BriefStrip";
import { briefSummary } from "@/lib/brief-summary";
import { QuoteTotals } from "@/components/QuoteTotals";

export const metadata: Metadata = { title: "Enquiry" };

const TONE: Record<string, string> = {
  awaiting_venue: "amber", info_requested: "amber", quoted: "brass", declined_by_venue: "red", declined_by_planner: "red", booked: "green",
};
const QUOTE_STATUS = { active: ["green", "Current"], superseded: ["grey", "Replaced"], declined: ["red", "Declined"], paid: ["green", "Accepted"] } as const;

export default async function EnquiryPage({ params, searchParams }: PageProps<"/enquiries/[id]">) {
  const actor = await requirePageRole("planner", "owner");
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();
  const t = await orNotFound(getEnquiryThread(db, actor, id));
  const { enquiry: e, listing, side, quotes, booking } = t;
  const current = quotes.find((q) => q.status === "active") ?? null;
  const closed = ["booked", "declined_by_venue", "declined_by_planner"].includes(e.status);
  // After booking, quoting and declining are closed but both sides can still message (questions about the event).
  const declined = ["declined_by_venue", "declined_by_planner"].includes(e.status);
  const pendingHold = t.checkouts.find((c) => c.status === "pending" && new Date(c.expires_at) > new Date());
  const lastFailed = t.checkouts[0]?.status === "failed" ? t.checkouts[0] : null;
  const suggested = side === "owner" && !closed ? (current ? current.lines : await suggestedQuoteLines(db, e)) : [];
  const suggestedTotal = suggested.reduce((s, l) => s + l.amountPence, 0);
  const snap = e.brief_snapshot;
  const essentials = Object.entries(snap.facilities).filter(([, l]) => l === "essential").map(([c]) => FACILITY_LABELS[c as FacilityCode]);
  const preferred = Object.entries(snap.facilities).filter(([, l]) => l === "preferred").map(([c]) => FACILITY_LABELS[c as FacilityCode]);
  const other = side === "planner" ? t.owner : t.planner;
  const confirmDecline = typeof query.confirmDecline === "string" ? query.confirmDecline : null;

  return (
    <>
    <BriefStrip summary={briefSummary(snap)} label={side === "planner" ? "Your event" : "Their event"} />
    <div className="wrap">
      <p className="back-link"><Link href="/enquiries"><span aria-hidden="true">←</span> {side === "planner" ? "All enquiries and quotes" : "Inbox"}</Link></p>
      <div className="page-head">
        <div>
          {/* The status pill sits on the title row, next to the title (fix 7). */}
          <div className="title-row">
            <h1>{side === "planner" ? listing.name : `${t.planner.full_name}’s ${snap.eventType ? EVENT_TYPE_LABELS[snap.eventType].toLowerCase() : "event"}`}</h1>
            {booking?.status === "cancelled"
              ? <StatusPill tone="red">Booking cancelled</StatusPill>
              : <StatusPill tone={TONE[e.status] as "grey"}>{enquiryStatusLabel(e.status, side)}</StatusPill>}
          </div>
          <p className="muted mb-0">{e.reference} · {longDate(e.event_date)} · {e.guests} {LAYOUT_LABELS[e.layout].toLowerCase()}{side === "owner" ? ` · ${listing.name}` : ""}</p>
        </div>
      </div>
      <Notices params={query} />

      {booking && <BookingPanel db={db} bookingId={booking.id} side={side} />}

      <div className="split">
        <section className="stack">
          {/* Quotes: newest version first; earlier versions stay for reference. */}
          {quotes.length > 0 && (
            <div className="stack" aria-label="Quotes">
              {quotes.map((q) => {
                const [tone, label] = q.status === "paid" && booking?.status === "cancelled" ? ["red", "Accepted, then cancelled"] : QUOTE_STATUS[q.status];
                // The accepted quote under a booking: the booking above shows what was paid and the terms, so the quote
                // just records what was agreed (no "paid now", no second copy of the terms).
                const accepted = q.status === "paid" && !!booking;
                const overCap = quoteExceedsCap(e, q);
                return (
                  <article key={q.id} className={`quote ${q.status === "active" ? "current" : ""}`} id={q.reference}>
                    <div className="spread"><h3 className="mb-0">Quote {q.reference}{q.version > 1 ? ` (version ${q.version})` : ""}</h3><StatusPill tone={tone as "grey"}>{label}</StatusPill></div>
                    <p className="tiny">Sent {dateTime(q.sent_at)}</p>
                    <table>
                      <tbody>
                        {q.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="right num">{formatPounds(l.amountPence)}</td></tr>)}
                        <tr className="total"><td>Total</td><td className="right num">{formatPounds(q.total_pence)}</td></tr>
                        <tr><td>{accepted ? "Deposit" : "Deposit, paid now to confirm the date"}</td><td className="right num">{formatPounds(q.deposit_pence)}</td></tr>
                        <tr><td>{accepted ? "Balance" : `Remaining balance${q.total_pence > q.deposit_pence && q.balance_due_days !== null ? `, paid through Gather by ${longDate(balanceDueDate(e.event_date, q.balance_due_days))}` : ""}`}</td><td className="right num">{formatPounds(q.total_pence - q.deposit_pence)}</td></tr>
                      </tbody>
                    </table>
                    {accepted ? <p className="tiny mb-0">What’s been paid, what’s left and the cancellation terms are in the booking above.</p> : <div className="terms">
                      <h4>Cancellation terms</h4>
                      <p className="small mb-0">{q.cancellation_terms ? termsForViewer(q.cancellation_terms, side) : "No cancellation terms were set on this older quote. If the planner cancels, Gather reviews the deposit before anything is kept; if the venue cancels, everything is refunded."}</p>
                    </div>}
                    {side === "planner" && q.status === "active" && !closed && (
                      <div className="mt-m stack">
                        {overCap !== null && <div className="notice error mb-0">This quote is above your strict budget cap of {formatPounds(overCap)}. Ask the venue for a revision, or decline it.</div>}
                        {lastFailed && lastFailed.quote_id === q.id && <div className="notice error mb-0">Your last payment didn’t go through ({lastFailed.failure_reason}). Nothing was charged. You can try again.</div>}
                        <div className="actions">
                          <form action={payDepositAction}>
                            <input type="hidden" name="enquiryId" value={e.id} /><input type="hidden" name="quoteId" value={q.id} />
                            <SubmitButton disabled={overCap !== null} pendingLabel="Opening payment…">{pendingHold ? "Continue to payment" : `Pay ${formatPounds(q.deposit_pence)} deposit`}</SubmitButton>
                          </form>
                          <a className="btn secondary" href="#reply">Ask about this quote</a>
                        </div>
                        {/* Declining sits apart from Pay and always asks first (3.12). */}
                        <div className="decline-zone" id="decline">
                          {confirmDecline === q.id ? (
                            <form action={declineQuoteAction} className="confirm-box" role="alertdialog" aria-labelledby="decline-q" aria-describedby="decline-d">
                              <input type="hidden" name="enquiryId" value={e.id} /><input type="hidden" name="quoteId" value={q.id} /><input type="hidden" name="confirm" value="yes" />
                              <p id="decline-q" className="mb-0"><strong>Decline this quote? The venue will be told.</strong></p>
                              <label htmlFor="reason" id="decline-d" className="mt-s">Reason (optional, shared with the venue)</label>
                              <textarea id="reason" name="reason" autoFocus style={{ minHeight: 70 }} />
                              <div className="actions mt-s">
                                <SubmitButton className="btn danger" pendingLabel="Declining…">Decline</SubmitButton>
                                <Link className="btn secondary" href={`/enquiries/${e.id}`}>Keep</Link>
                              </div>
                            </form>
                          ) : (
                            <details>
                              <summary className="decline-toggle">Decline this quote</summary>
                              <form action={declineQuoteAction} className="mt-s">
                                <input type="hidden" name="enquiryId" value={e.id} /><input type="hidden" name="quoteId" value={q.id} />
                                <p className="small muted mb-0">You’ll be asked to confirm, and can add a reason for the venue.</p>
                                <SubmitButton className="btn danger mt-s" pendingLabel="Checking…">Decline quote</SubmitButton>
                              </form>
                            </details>
                          )}
                        </div>
                        <p className="tiny mb-0">{isDemo() ? "Demo mode: payment opens a test page; no money moves." : "Payment opens Stripe Checkout in test mode."} The date is held for you for about 30 minutes while you pay.</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="panel" id="thread">
            <h2>Conversation with {other.full_name}</h2>
            <div className="thread">
              <p className="msg-system">Enquiry sent {dateTime(e.created_at)}. The brief and selected extras are on the right.</p>
              {t.messages.map((m) => {
                const quoteRef = m.quote_id ? quotes.find((q) => q.id === m.quote_id)?.reference : null;
                const mine = m.author_id === actor.id;
                return (
                  <div key={m.id} className={`msg ${mine ? "mine" : "theirs"}`}>
                    <div className={`bubble ${mine ? "mine" : ""}`}>{m.body}</div>
                    <div className="who">{mine ? "You" : m.author_name} · {dateTime(m.created_at)}{quoteRef ? ` · about ${quoteRef}` : ""}</div>
                  </div>
                );
              })}
            </div>
            {!declined && (
              <form action={messageAction} id="reply" className="mt-m">
                <input type="hidden" name="enquiryId" value={e.id} />
                <label htmlFor="body">{side === "owner" && !e.first_reply_at ? "Reply or ask for missing details" : "Reply"}</label>
                <textarea id="body" name="body" required maxLength={4000} />
                {quotes.length > 0 && (
                  <div className="field mt-s">
                    <label htmlFor="quoteId">This message is about</label>
                    <select id="quoteId" name="quoteId" defaultValue={current?.id ?? ""}>
                      <option value="">The enquiry in general</option>
                      {quotes.map((q) => <option key={q.id} value={q.id}>Quote {q.reference}</option>)}
                    </select>
                  </div>
                )}
                <SubmitButton pendingLabel="Sending…">Send message</SubmitButton>
                <span className="tiny" style={{ marginLeft: 12 }}>They’ll get an email saying there’s a reply, without your message text.</span>
              </form>
            )}
          </div>

          {side === "owner" && !closed && (
            <form action={sendQuoteAction} id="compose" className="panel">
              <input type="hidden" name="enquiryId" value={e.id} />
              <h2>{current ? `Revise quote (creates version ${current.version + 1})` : "Send an itemised quote"}</h2>
              <p className="small muted">Start from your listed prices and the extras the planner chose. Edit amounts, add custom lines, then set the deposit. Sent quotes can’t be edited; a revision gets a new reference and the old one stays visible to both of you.</p>
              {pendingHold && <div className="notice info">The planner is paying the deposit on the current quote right now, so it can’t be revised until that finishes.</div>}
              <table className="quote-lines">
                <thead><tr><th>Line</th><th className="right">Amount (£)</th></tr></thead>
                <tbody>
                  {[...suggested, ...Array.from({ length: 3 }, () => ({ label: "", amountPence: 0 }))].map((l, i) => (
                    <tr key={i}>
                      <td><label className="sr-only" htmlFor={`label_${i}`}>Line {i + 1}</label><input id={`label_${i}`} name={`label_${i}`} type="text" defaultValue={l.label} placeholder={i >= suggested.length ? "Custom line, e.g. Set-up help" : ""} /></td>
                      <td style={{ width: 160 }}><label className="sr-only" htmlFor={`amount_${i}`}>Amount for line {i + 1}</label><input id={`amount_${i}`} name={`amount_${i}`} type="text" inputMode="decimal" defaultValue={l.label ? poundsInput(l.amountPence) : ""} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="quote-terms mt-m">
                <div className="field">
                  <div className="label-row"><label htmlFor="deposit">Deposit (£)</label><InfoTip id="deposit-hint">More than £0 and no more than the total. Paid by the planner to confirm the date. If it equals the total, there&rsquo;s no balance to pay.</InfoTip></div>
                  <input id="deposit" aria-describedby="deposit-hint" name="deposit" type="text" inputMode="decimal" required defaultValue={current ? poundsInput(current.deposit_pence) : poundsInput(Math.round(suggestedTotal * 0.2))} />
                </div>
                <div className="field">
                  <div className="label-row"><label htmlFor="balanceDueDays">Balance due (days before)</label><InfoTip id="balanceDueDays-hint">The planner pays the rest through Gather by this many days before the event. 0 means on the day.</InfoTip></div>
                  <input id="balanceDueDays" aria-describedby="balanceDueDays-hint" name="balanceDueDays" type="number" inputMode="numeric" min={0} max={365} required defaultValue={current?.balance_due_days ?? 14} />
                </div>
                <div className="field">
                  <div className="label-row"><label htmlFor="cancellationCutoffDays">Cancellation cutoff (days)</label><InfoTip id="cancellationCutoffDays-hint">If the planner cancels more than this many days before the event, their deposit is refunded. Within the cutoff, you keep the deposit. Any balance paid is always refunded, and if you cancel, the planner gets everything back.</InfoTip></div>
                  <input id="cancellationCutoffDays" aria-describedby="cancellationCutoffDays-hint" name="cancellationCutoffDays" type="number" inputMode="numeric" min={0} max={365} required defaultValue={current?.cancellation_cutoff_days ?? 14} />
                </div>
              </div>
              <QuoteTotals formId="compose" />
              <p className="small muted">These terms are saved with this quote and shown to the planner before they pay. Changing them later only affects new quotes.</p>
              <div className="actions">
                <SubmitButton disabled={Boolean(pendingHold)} pendingLabel="Sending quote…">{current ? "Send revised quote" : "Send quote"}</SubmitButton>
                <span className="tiny">The total is calculated from the lines when you send.</span>
              </div>
            </form>
          )}

          {side === "owner" && !closed && (
            <details className="disclosure">
              <summary>Decline this enquiry</summary>
              <form action={declineEnquiryAction} className="inner">
                <input type="hidden" name="enquiryId" value={e.id} />
                <label htmlFor="decline-reason">Message to the planner</label>
                <textarea id="decline-reason" name="reason" defaultValue="Sorry, we can't host this one." />
                <SubmitButton className="btn danger mt-s" pendingLabel="Declining…">Decline enquiry</SubmitButton>
              </form>
            </details>
          )}
        </section>

        <aside className="panel enquiry-aside" aria-labelledby="brief-title">
          <h2 id="brief-title">The brief</h2>
          <table>
            <tbody>
              <tr><th scope="row">Date</th><td>{longDate(e.event_date)}</td></tr>
              <tr><th scope="row">Guests</th><td>{e.guests} ({LAYOUT_LABELS[e.layout].toLowerCase()})</td></tr>
              <tr><th scope="row">Event</th><td>{snap.eventType ? EVENT_TYPE_LABELS[snap.eventType] : "Not specified"}</td></tr>
              <tr><th scope="row">Area</th><td>{snap.areaText ?? "Any"}</td></tr>
              <tr><th scope="row">Budget</th><td>{snap.budget.amountPence ? `${snap.budget.mode === "strict" ? "Up to" : "Around"} ${formatPounds(snap.budget.amountPence)}${snap.budget.basis === "per_head" ? " per head" : ""}` : "Not given"}</td></tr>
              <tr><th scope="row">Must have</th><td>{essentials.join(", ") || "Nothing specific"}</td></tr>
              {preferred.length > 0 && <tr><th scope="row">Nice to have</th><td>{preferred.join(", ")}</td></tr>}
              <tr><th scope="row">Extras chosen</th><td>{e.selected_extras.length ? e.selected_extras.map((x) => `${x.label} (${x.pricePence === null ? "price to confirm" : formatPounds(x.pricePence)})`).join(", ") : "None"}</td></tr>
            </tbody>
          </table>
          <h3 className="mt-m">In their words</h3>
          <p className="small muted">“{snap.rawText}”</p>
          {side === "owner" && <p className="tiny">Planner: {t.planner.full_name}. Contact stays in Gather during the pilot.</p>}
        </aside>
      </div>
    </div>
    </>
  );
}
