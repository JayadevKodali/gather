import type { Metadata } from "next";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { getDb } from "@/lib/db";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/domain";
import { dateTime, formatPounds, hoursLabel, shortDate } from "@/lib/format";
import { adminMetrics, PERIOD_LABELS, type Period } from "@/lib/services/admin";
import { refundsNeedingAttention } from "@/lib/services/booking-money";
import { SubmitButton } from "@/components/SubmitButton";
import { Notices } from "@/components/Notice";
import { resolveRefundAction } from "../actions/admin";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Pilot dashboard" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const actor = await requirePageRole("admin");
  const params = await searchParams;
  const period = (["7", "30", "all"].includes(String(params.period)) ? params.period : "30") as Period;
  const db = await getDb();
  const m = await adminMetrics(db, actor, period);
  const refunds = await refundsNeedingAttention(db, actor);
  const max = Math.max(1, ...m.funnel.map((f) => f.value));
  const conv = m.pilot.conversion;

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="page-head-text">
          <h1>Pilot dashboard</h1>
          <p className="page-summary">Counts only — no private messages or card details. {isDemo() && "Includes seeded synthetic activity."}</p>
        </div>
        <nav className="sort-pills" aria-label="Period">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Link key={p} href={`/admin?period=${p}`} className="sort-pill" aria-current={p === period ? "true" : undefined}>{PERIOD_LABELS[p]}</Link>
          ))}
        </nav>
      </div>

      <Notices params={params} />

      <section className="kpis tiles" aria-label={`Headline numbers, ${PERIOD_LABELS[period].toLowerCase()}`}>
        <div className="kpi tile"><p className="label">Sign-ups</p><p className="value num">{m.signUps.planners + m.signUps.owners}</p><p className="tiny mb-0">{m.signUps.planners} planners · {m.signUps.owners} venue owners</p></div>
        <div className="kpi tile"><p className="label">Briefs</p><p className="value num">{m.briefs.total}</p><p className="tiny mb-0">{m.briefs.awaiting} still being completed</p><p className="tiny mb-0">Read by OpenAI: {m.reader.openai} · AI failed, rules used: {m.reader.fallback} · rules reader: {m.reader.rules}</p></div>
        <div className="kpi tile"><p className="label">Briefs with a match</p><p className="value num">{m.briefs.matched}</p><p className="tiny mb-0">{m.briefs.no_match} with no match · {m.briefs.searches} searches run</p></div>
        <div className="kpi tile accent"><p className="label">Confirmed bookings</p><p className="value num">{m.bookings.count}</p><p className="tiny mb-0">{formatPounds(m.bookings.value)} agreed · {formatPounds(m.bookings.deposits)} test deposits{m.bookings.cancelled > 0 && <> · {m.bookings.cancelled} cancelled</>}</p></div>
      </section>

      {m.reader.last_error && (
        <p className="notice info" role="status">
          The OpenAI brief reader failed {m.reader.fallback} {m.reader.fallback === 1 ? "time" : "times"} in this period, and those briefs were read by the rules reader instead.
          Latest reason: <strong>{m.reader.last_error}</strong>{m.reader.last_error_at ? ` (${dateTime(m.reader.last_error_at)})` : ""}.
        </p>
      )}

      <section className="admin-section" aria-labelledby="pilot-title">
        <h2 id="pilot-title" className="h-sub">Pilot measures</h2>
        <div className="kpis tiles small-tiles">
          <div className="kpi tile"><p className="label">Listings ready</p><p className="value num">{m.pilot.publishedListings} <span className="small muted">of {m.pilot.totalListings}</span></p><p className="tiny mb-0">“Ready” uses published as a stand-in for now. Snapshot as of now, not filtered by period.</p></div>
          <div className="kpi tile"><p className="label">Median time to first venue reply</p><p className="value num">{m.pilot.medianReplyHours === null ? "—" : hoursLabel(m.pilot.medianReplyHours)}</p><p className="tiny mb-0">Across {m.pilot.replySample} enquiries that have a reply.</p></div>
          <div className="kpi tile"><p className="label">Enquiry → booking</p><p className="value num">{conv.denominator ? `${Math.round((100 * conv.numerator) / conv.denominator)}%` : "—"}</p><p className="tiny mb-0">{conv.numerator} of {conv.denominator} enquiries created in this period are now booked.</p></div>
        </div>
      </section>

      <section className="admin-section panel" aria-labelledby="funnel-title">
        <h2 id="funnel-title" className="h-sub">Booking funnel</h2>
        <div className="funnel">
          {m.funnel.map((f, n) => {
            const prev = n > 0 ? m.funnel[n - 1].value : 0;
            return (
              <div key={f.label} className="bar">
                <span>{f.label}</span>
                <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${Math.max(f.value ? 2 : 0, (100 * f.value) / max)}%`, display: "block" }} /></span>
                <span className="num right"><strong>{f.value}</strong>{n > 0 && prev > 0 && <span className="tiny muted funnel-rate"> {Math.round((100 * f.value) / prev)}%</span>}</span>
              </div>
            );
          })}
        </div>
        <p className="tiny mt-s mb-0">Percentages compare each step with the one above. One brief can lead to several enquiries, so the enquiry bar can be longer than the briefs bar.</p>
      </section>

      <section className="admin-section" aria-labelledby="attention-title">
        <h2 id="attention-title" className="h-sub">Needs attention ({m.attention.waiting.length + m.attention.draftListings.length + m.attention.unmatched.length + refunds.length})</h2>
        <div className="attention-cards">
          {refunds.length > 0 && (
            <article className="card attention-card urgent">
              <header className="spread"><h3 className="mb-0">Refunds to check</h3><StatusPill tone="red">{refunds.length}</StatusPill></header>
              <ul className="attention-list small">
                {refunds.map((r) => (
                  <li key={r.id}>
                    <span>{r.reference} at {r.listing}: {formatPounds(r.amount_pence)} {r.status === "review" ? "deposit, planner cancelled (no agreed terms)" : `refund failed${r.failure_reason ? ` (${r.failure_reason})` : ""}`}, {dateTime(r.updated_at)}</span>
                    <form action={resolveRefundAction} className="row-actions">
                      <input type="hidden" name="refundId" value={r.id} />
                      {r.status === "failed" ? (
                        <SubmitButton className="btn small secondary" name="decision" value="retry" pendingLabel="Retrying…">Retry refund</SubmitButton>
                      ) : (
                        <>
                          <SubmitButton className="btn small secondary" name="decision" value="refund" pendingLabel="Refunding…">Refund the deposit</SubmitButton>
                          <SubmitButton className="btn small quiet" name="decision" value="keep" pendingLabel="Saving…">Venue keeps it</SubmitButton>
                        </>
                      )}
                    </form>
                  </li>
                ))}
              </ul>
            </article>
          )}
          <AttentionCard title="Enquiries waiting for a first reply" count={m.attention.waiting.length}>
            {m.attention.waiting.map((w) => <AttentionRow key={w.id} kind="enquiry_waiting" id={w.id} who="owner" contacted={m.attention.lastContact[`enquiry_waiting:${w.id}`]}>{w.reference} at {w.listing}, waiting {hoursLabel(Number(w.hours))}</AttentionRow>)}
          </AttentionCard>
          <AttentionCard title="Draft listings" count={m.attention.draftListings.length}>
            {m.attention.draftListings.map((d) => <AttentionRow key={d.id} kind="draft_listing" id={d.id} who="owner" contacted={m.attention.lastContact[`draft_listing:${d.id}`]}>{d.name} ({d.owner}), last edited {dateTime(d.updated_at)}</AttentionRow>)}
          </AttentionCard>
          <AttentionCard title="Briefs with no suitable venue" count={m.attention.unmatched.length}>
            {m.attention.unmatched.map((u) => <AttentionRow key={u.id} kind="unmatched_brief" id={u.id} who="planner" contacted={m.attention.lastContact[`unmatched_brief:${u.id}`]}>{u.guests ?? "?"} guests{u.area ? ` near ${u.area}` : ""}{u.event_type ? `, ${EVENT_TYPE_LABELS[u.event_type as EventType]}` : ""} ({dateTime(u.created_at)})</AttentionRow>)}
          </AttentionCard>
        </div>
      </section>

      <section className="admin-section stack" aria-label="Recent activity">
        <h2 className="h-sub mb-0">Recent activity</h2>
        <details className="disclosure">
          <summary>Recent sign-ups <span className="group-count">{m.recent.signUps.length}</span></summary>
          <div className="inner table-scroll">
            {m.recent.signUps.length ? (
              <table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Joined</th></tr></thead>
                <tbody>{m.recent.signUps.map((s, i) => <tr key={i}><td>{s.full_name}{s.is_synthetic && <span className="tiny"> (synthetic)</span>}</td><td>{s.role === "owner" ? "Venue owner" : "Planner"}</td><td>{dateTime(s.created_at)}</td></tr>)}</tbody></table>
            ) : <p className="small muted mb-0">No sign-ups in this period.</p>}
          </div>
        </details>

        <details className="disclosure">
          <summary>Recent briefs and matches <span className="group-count">{m.recent.briefs.length}</span></summary>
          <div className="inner table-scroll">
            {m.recent.briefs.length ? (
              <table className="data-table"><thead><tr><th>When</th><th>Event</th><th>Area</th><th>Search state</th></tr></thead>
                <tbody>{m.recent.briefs.map((b, i) => <tr key={i}><td>{dateTime(b.created_at)}</td><td>{b.event_type ? EVENT_TYPE_LABELS[b.event_type as EventType] : "—"}</td><td>{b.area ?? "Any"}</td><td>{b.matched ? <StatusPill tone="green">Matched</StatusPill> : b.status === "searched" ? <StatusPill tone="red">No match</StatusPill> : <StatusPill tone="amber">Awaiting search</StatusPill>}</td></tr>)}</tbody></table>
            ) : <p className="small muted mb-0">No briefs in this period.</p>}
          </div>
        </details>

        <details className="disclosure">
          <summary>Confirmed bookings <span className="group-count">{m.recent.bookings.length}</span></summary>
          <div className="inner table-scroll">
            {m.recent.bookings.length ? (
              <table className="data-table"><thead><tr><th>Reference</th><th>Venue</th><th>Event date</th><th className="right">Agreed total</th><th className="right">Deposit</th><th>Paid with</th></tr></thead>
                <tbody>{m.recent.bookings.map((b) => <tr key={b.reference}><td>{b.reference}</td><td>{b.listing}</td><td>{shortDate(b.event_date)}</td><td className="right num">{formatPounds(b.total_pence)}</td><td className="right num">{formatPounds(b.deposit_pence)}</td><td><StatusPill tone="neutral">{b.provider === "demo" ? "Demo payment" : "Stripe test"}</StatusPill></td></tr>)}</tbody></table>
            ) : <p className="small muted mb-0">No bookings in this period.</p>}
          </div>
        </details>
      </section>
    </div>
  );
}

function AttentionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <article className={`card attention-card ${count ? "" : "clear"}`}>
      <header className="spread"><h3 className="mb-0">{title}</h3><StatusPill tone={count ? "amber" : "green"}>{count ? count : "None"}</StatusPill></header>
      {count ? <ul className="attention-list small">{children}</ul> : <p className="small muted mb-0">Nothing waiting.</p>}
    </article>
  );
}

function AttentionRow({ kind, id, who, contacted, children }: { kind: string; id: string; who: "owner" | "planner"; contacted?: Date; children: React.ReactNode }) {
  const href = `/admin/contact/${kind}/${id}`;
  return (
    <li>
      <span>{children}</span>
      {contacted && <span className="tiny muted"> · Contacted {dateTime(contacted)}.</span>}
      <span className="row-actions">
        <Link href={href}>View</Link>
        <Link href={`${href}#subject`}>Contact {who}</Link>
      </span>
    </li>
  );
}
