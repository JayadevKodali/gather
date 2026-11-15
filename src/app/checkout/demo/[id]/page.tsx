import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notices } from "@/components/Notice";
import { requirePageRole } from "@/lib/auth/session";
import { isDemo } from "@/lib/config";
import { getDb } from "@/lib/db";
import { formatPounds, longDate } from "@/lib/format";
import { getCheckoutForPlanner } from "@/lib/services/checkout";
import { demoCancelAction, demoPayAction } from "../../../actions/enquiry";
import { orNotFound } from "@/lib/services/page-guard";
import { InfoTip } from "@/components/InfoTip";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill } from "@/components/StatusPill";
import { checkoutSummary } from "@/lib/services/checkout-summary";

export const metadata: Metadata = { title: "Demo payment" };

/** Demo-mode stand-in for Stripe Checkout. Clearly labelled; no card data is real or stored. */
export default async function DemoCheckoutPage({ params, searchParams }: PageProps<"/checkout/demo/[id]">) {
  const actor = await requirePageRole("planner");
  if (!isDemo()) redirect("/enquiries");
  const { id } = await params;
  const query = await searchParams;
  const c = await orNotFound(getCheckoutForPlanner(await getDb(), actor, id));
  if (c.status !== "pending") redirect(`/checkout/return/${id}`);
  const shown = await checkoutSummary(await getDb(), c.listing_id, c.enquiry_id);
  return (
    <div className="wrap" style={{ maxWidth: 560 }}>
      <div className="panel">
        <p className="mb-0"><StatusPill tone="amber">Demo payment · no real money</StatusPill></p>
        <h1 className="mt-s">{c.kind === "balance" ? "Pay your remaining balance" : "Pay your deposit"}</h1>
        <Notices params={query} />
        {/* Same product summary as the Stripe page: venue photo, name, quote, date and guests (3.13). */}
        <div className="pay-product">
          {shown.imagePath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown.imagePath} alt={shown.imageAlt} width={120} height={80} />
          )}
          <div>
            <p className="mb-0"><strong>{c.kind === "balance" ? "Remaining balance" : "Deposit"} — {c.listing_name}</strong></p>
            <p className="small muted mb-0">Quote {c.quote_reference}{shown.summary ? ` · ${shown.summary}` : ""}</p>
          </div>
        </div>
        <table>
          <tbody>
            <tr><th scope="row">Venue</th><td>{c.listing_name}</td></tr>
            <tr><th scope="row">Date</th><td>{longDate(c.event_date)}</td></tr>
            <tr><th scope="row">Quote</th><td>{c.quote_reference} (total {formatPounds(c.quote_total)})</td></tr>
            <tr><th scope="row">{c.kind === "balance" ? "Balance now" : "Deposit now"}</th><td className="num"><strong>{formatPounds(c.amount_pence)}</strong></td></tr>
            {c.kind === "deposit" && <tr><th scope="row">Balance later (through Gather)</th><td className="num">{formatPounds(c.quote_total - c.amount_pence)}</td></tr>}
          </tbody>
        </table>
        <form action={demoPayAction} className="mt-m">
          <input type="hidden" name="checkoutId" value={c.id} />
          <div className="field">
            <div className="label-row"><label htmlFor="card">Test card number</label><InfoTip id="card-hint">4242 4242 4242 4242 succeeds. 4000 0000 0000 0002 is declined. 4000 0000 0000 5126 succeeds, but a later refund to it fails (like Stripe&rsquo;s test card).</InfoTip></div>
            <input id="card" aria-describedby="card-hint" name="card" type="text" inputMode="numeric" autoComplete="off" defaultValue="4242 4242 4242 4242" />
          </div>
          <div className="actions">
            <SubmitButton pendingLabel="Paying…">Pay {formatPounds(c.amount_pence)}</SubmitButton>
          </div>
        </form>
        <form action={demoCancelAction} className="mt-s">
          <input type="hidden" name="checkoutId" value={c.id} />
          <SubmitButton className="btn quiet" pendingLabel="Cancelling…">Cancel and go back</SubmitButton>
        </form>
        <p className="tiny mt-m mb-0">
          {c.kind === "balance"
            ? "Your booking stays confirmed whatever happens here."
            : `The date is held for you until ${new Date(c.expires_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}.`}{" "}
          In connected mode this page is Stripe Checkout (test mode).
        </p>
      </div>
    </div>
  );
}
