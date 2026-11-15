import type { Metadata } from "next";
import Link from "next/link";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { LAYOUT_LABELS } from "@/lib/domain";
import { dateTime, formatPounds, longDate } from "@/lib/format";
import { enquiryStatusLabel, listEnquiries } from "@/lib/services/enquiries";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = { title: "Enquiries" };

const TONE: Record<string, string> = { awaiting_venue: "amber", info_requested: "amber", quoted: "brass", declined_by_venue: "red", declined_by_planner: "red", booked: "green" };

/** What happens next on an enquiry, from each side (display only, from the status). */
function nextStep(status: string, isOwner: boolean, bookingCancelled = false): { label: string; action: boolean } {
  if (bookingCancelled) return { label: "See the cancellation and refund", action: false };
  if (isOwner) {
    if (status === "awaiting_venue") return { label: "Reply or send a quote", action: true };
    if (status === "info_requested" || status === "quoted") return { label: "Waiting for the planner", action: false };
    if (status === "booked") return { label: "Open the booking", action: true };
    return { label: "Closed", action: false };
  }
  if (status === "awaiting_venue") return { label: "Waiting for the venue", action: false };
  if (status === "info_requested") return { label: "Answer the venue’s question", action: true };
  if (status === "quoted") return { label: "Review the quote", action: true };
  if (status === "booked") return { label: "Open the booking", action: true };
  return { label: "Closed", action: false };
}

export default async function EnquiriesPage({ searchParams }: PageProps<"/enquiries">) {
  const actor = await requirePageRole("planner", "owner");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const rows = await listEnquiries(await getDb(), actor, { search: q });
  const isOwner = actor.role === "owner";
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{isOwner ? "Inbox" : "Enquiries and quotes"}</h1>
        <form className="row" role="search">
          <label htmlFor="q" className="sr-only">Search by reference or venue</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Quote or enquiry reference, or venue" style={{ width: 300 }} />
          <button className="btn secondary" type="submit">Search</button>
          {q && <Link href="/enquiries">Clear</Link>}
        </form>
      </div>
      <Notices params={params} />
      {rows.length === 0 ? (
        <div className="panel">
          {q ? <p className="mb-0">Nothing matches “{q}”.</p> : isOwner
            ? <p className="mb-0">No enquiries yet. Planners can only find listings that are published and have confirmed dates, so check <Link href="/owner">your listings</Link>.</p>
            : <p className="mb-0">No enquiries yet. <Link href="/plan">Describe an event</Link> to get a shortlist, then enquire from a venue page.</p>}
        </div>
      ) : (
        <ul className="enquiry-cards stagger" aria-label={isOwner ? "Enquiries in your inbox" : "Your enquiries"}>
          {rows.map((r) => {
            const cancelled = r.status === "booked" && r.booking_status === "cancelled";
            const next = nextStep(r.status, isOwner, cancelled);
            // When a search matched an older quote version, say so (display only; from the quote references).
            const matchedOld = q && r.latest_quote_ref && !r.latest_quote_ref.toLowerCase().includes(q.toLowerCase())
              ? (r.quote_refs ?? "").split(" ").find((ref) => ref.toLowerCase().includes(q.toLowerCase())) : null;
            return (
              <li key={r.id} className="card card-link enquiry-card">
                <div className="enquiry-card-main">
                  <div className="spread">
                    <h2 className="enquiry-card-title"><Link href={`/enquiries/${r.id}`} className="stretched">{isOwner ? r.planner_name : r.listing_name}</Link></h2>
                    {cancelled
                      ? <StatusPill tone="red">Booking cancelled</StatusPill>
                      : <StatusPill tone={TONE[r.status] as "grey"}>{enquiryStatusLabel(r.status, isOwner ? "owner" : "planner")}</StatusPill>}
                  </div>
                  <p className="mb-0 enquiry-card-facts">
                    {longDate(r.event_date)} · {r.guests} {LAYOUT_LABELS[r.layout].toLowerCase().split(" ")[0]}{isOwner ? ` · ${r.listing_name}` : ""}
                  </p>
                  <p className="tiny mb-0">{r.reference}{r.latest_quote_ref ? ` · latest quote ${r.latest_quote_ref} (${formatPounds(r.latest_total ?? 0)})` : ""} · updated {dateTime(r.updated_at)}</p>
                  {matchedOld && <p className="small mb-0 mt-s"><StatusPill tone="neutral">Matched {matchedOld}</StatusPill> <span className="muted">an earlier version of this enquiry’s quote</span></p>}
                </div>
                <div className="enquiry-card-next">
                  <span className="tiny">Next</span>
                  <span className={`next-step ${next.action ? "action" : ""}`}>{next.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="tiny mt-m">Quote history: every quote version keeps its reference. Search by an older reference to find the enquiry it belongs to.</p>
    </div>
  );
}
