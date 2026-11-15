# Payments: what Gather does now, and a possible future flow

## Now (assessment build, Stripe test mode)
- **Quote:** the venue sets the deposit, the balance due date (days before the event) and a cancellation cutoff. The quote shows the total, the deposit, the remaining balance with its due date, and the cancellation terms. The terms are saved on the quote and copied onto the booking, so a later change of policy never alters an existing booking.
- **Deposit:** Stripe Checkout. The signed webhook confirms the booking and blocks the date. If the deposit equals the total, the booking is paid in full straight away.
- **What the payment page shows:** the Stripe Checkout product carries a description (quote reference, date, guests) and the venue's cover photo. Stripe fetches the photo itself, so it is sent only when the site is on a public https address. The amount, currency, metadata and expiry are unchanged. The demo payment page shows the same summary.
- **Balance:** My bookings → **Pay remaining balance** opens a second Checkout for the same booking. The amount is calculated on the server (quote total minus confirmed payments). The booking shows **Paid in full**, and both parties are emailed, only after Stripe confirms. A declined balance leaves the booking confirmed and the planner can retry; the open session is reused.
- **Cancellation:** either party can cancel from the booking. A preview shows the exact refund and what the venue keeps before they confirm; the confirmation is checked against the same numbers, so a crossed cutoff can't slip through.
  - The venue cancels: every payment is refunded.
  - The planner cancels: the cutoff is counted in London calendar days. Cancelling cutoff + 1 or more days before the event refunds the deposit; cancelling within the cutoff, the venue keeps it. Any balance paid is always refunded, and an open balance payment is cancelled.
  - Older bookings without terms: a planner cancellation refunds any balance, and the deposit waits for an admin decision.
- **Refunds:** one refund per original Stripe payment, with the refund row's id as Stripe's idempotency key. Statuses: Refund pending, Refunded or Refund failed (updated by `refund.updated` / `refund.failed` webhooks). Failed refunds appear in the admin dashboard's "Refunds to check" with a Retry button.
- **Races and repeats:** a balance payment that completes after a cancellation is refunded automatically. Repeated clicks, two tabs and webhook resends can't create a second charge, refund or email.
- Money goes to Gather's own Stripe test account. Nothing is paid out to venues, and live payments are off.

## Possible future flow (not built): Stripe Connect payouts
Decisions for Amara first: who invoices the balance, whether Gather takes a fee, refund and cancellation rules,
and who handles disputes.

1. **Venue onboarding.** Each owner creates a Stripe connected account (Express) from their Gather dashboard.
   Stripe does identity and bank checks (KYC); Gather stores only the connected account ID.
2. **Deposit.** Checkout is created as a destination charge to the venue's account, optionally with an
   `application_fee_amount` for Gather. A venue without a verified account can't be paid; Gather says so in the quote.
3. **Balance.** The second Checkout (built) would charge through the venue's connected account in the same way.
4. **Refunds and cancellations.** Refunds go through Stripe against the original charge (and reverse any fee),
   following the venue's stated policy. A refund releases the date in the calendar.
5. **Disputes.** With destination charges the platform is liable first; Gather would recover the amount from the
   venue's balance. This is the main risk to price before going live.
6. **Fees.** Stripe's processing and Connect fees, plus any Gather fee, are a separate line from the hosting costs in
   `docs/COST_MODEL.md`, and must be checked against Stripe's current UK pricing at that time.
