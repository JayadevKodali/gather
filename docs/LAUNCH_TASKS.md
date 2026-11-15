# Real-launch tasks (not needed for the work-test walkthrough)

## Marketplace terms (legal review needed)
Reviewed terms of use covering:
- **Gather's role:** a marketplace connecting planners and venues. Gather isn't the venue operator, but it takes payments on the venue's behalf (needs a decision: commercial agent, or Stripe Connect platform).
- **Venue responsibilities:** accurate listings and capacities, honouring confirmed bookings, licences, safety, accessibility statements, and issuing invoices or VAT receipts for the full amount.
- **Payments:** deposit and balance collected through Gather; when the money reaches the venue (payout timing); any Gather fee; currency; failed payments.
- **Cancellations:** venue-set cutoff saved with each quote (built); venue cancellation means a full refund (built); event-day no-shows; force majeure; and what happens to bookings made before terms existed (built as manual review).
- **Disputes:** card chargebacks (who bears them), complaint handling, how Gather decides, and the limits of Gather's liability.
- Planners and owners accept the terms at sign-up (a checkbox plus a stored version and timestamp).

## Privacy (see /privacy, items marked "To be confirmed")
- Publish the controller's legal name, registered address and privacy contact (Jay: "we'll publish it at launch").
- Confirm each provider's data location and transfer safeguards (Vercel, Supabase, OpenAI, Stripe, Resend data processing terms).
- Build the retention schedule as a daily job: delete or anonymise inactive accounts (2 years), unbooked briefs and enquiries (12 months), the email log (90 days) and usage events (24 months). Keep payment records for 6 years after the financial year.
- A data-request process (export and delete) for the rights listed on the page.

## Payments
- **Live payments:** Stripe Connect (Express) so the money reaches venues, with KYC and payouts (see docs/PAYMENTS.md). Today all test money lands in Gather's own Stripe test account.
- **Balance reminders:** email the planner before the due date. Decide what happens if the balance isn't paid by then (currently nothing automatic).
- **Refund failures:** set up an alert for Gather's team. Today they appear in the admin dashboard's "Refunds to check".
